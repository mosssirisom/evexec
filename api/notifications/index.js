'use strict';

const crypto = require('crypto');
const { parseBody } = require('../../lib/parse');
const { verifyAuth } = require('../../lib/auth');
const { sendWebPush, getSubscriptions, deleteExpiredSubscription } = require('../../lib/push');
const { sendSMS, sendEmail, normaliseUkPhone } = require('../../lib/notify');
const { processDue } = require('../../lib/notificationQueue');
const { dbRpc } = require('../../lib/supabase');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yoltkmhtxwluqxxpewbl.supabase.co';

function serviceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}

function dbHeaders(extra = {}) {
  const key = serviceKey();
  return {
    'Content-Type': 'application/json',
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...extra
  };
}

function safeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function operatorAuthOk(req) {
  return safeEqual(req.headers['x-operator-secret'], process.env.OPERATOR_ACTION_SECRET);
}

function cronAuthOk(req) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // no secret configured — allow Vercel cron calls through
  return req.headers.authorization === `Bearer ${cronSecret}`;
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

async function readForm(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  const params = new URLSearchParams(raw);
  const body = {};
  params.forEach((value, key) => { body[key] = value; });
  return body;
}

function mask(value) {
  if (!value) return null;
  const str = String(value);
  if (str.includes('@')) return str.replace(/(.{2}).+(@.+)/, '$1***$2');
  if (str.length <= 7) return '***';
  return str.slice(0, 4) + '***' + str.slice(-3);
}

function envStatus() {
  return {
    twilio: {
      enabled: process.env.SMS_ENABLED === 'true',
      accountSid: Boolean(process.env.TWILIO_ACCOUNT_SID),
      authToken: Boolean(process.env.TWILIO_AUTH_TOKEN),
      phoneNumber: Boolean(process.env.TWILIO_PHONE_NUMBER),
      from: mask(normaliseUkPhone(process.env.TWILIO_PHONE_NUMBER || '')),
      ready: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER)
    },
    resend: {
      apiKey: Boolean(process.env.RESEND_API_KEY),
      from: process.env.RESEND_FROM || 'EV Exec <bookings@evexec.co.uk>',
      ready: Boolean(process.env.RESEND_API_KEY)
    },
    operator: {
      phone: Boolean(process.env.OPERATOR_PHONE),
      email: Boolean(process.env.OPERATOR_EMAIL),
      phonePreview: mask(normaliseUkPhone(process.env.OPERATOR_PHONE || '')),
      emailPreview: process.env.OPERATOR_EMAIL ? mask(process.env.OPERATOR_EMAIL) : null
    },
    site: { siteUrl: process.env.SITE_URL || 'https://evexec.co.uk' }
  };
}

async function handleSubscribe(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res);

  let body;
  try { body = await parseBody(req); }
  catch { return badRequest(res, 'Invalid body'); }

  const { endpoint, keys, customer_phone, customer_email } = body;
  if (!endpoint || !keys || !keys.p256dh || !keys.auth) return badRequest(res, 'Missing subscription fields');

  const user = await verifyAuth(req);
  const row = {
    endpoint,
    p256dh: keys.p256dh,
    auth_key: keys.auth,
    user_id: user ? user.id : null,
    customer_phone: customer_phone || null,
    customer_email: customer_email || (user ? user.email : null)
  };

  const r = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions`, {
    method: 'POST',
    headers: dbHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(row)
  });

  if (!r.ok) return serverError(res, await r.text());

  if (user) {
    await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`, {
      method: 'PATCH',
      headers: dbHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ push_enabled: true, updated_at: new Date().toISOString() })
    }).catch(() => {});
  }

  return ok(res, { success: true });
}

async function handleSend(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res);
  if (!operatorAuthOk(req)) return unauthorised(res);

  let body;
  try { body = await parseBody(req); }
  catch { return badRequest(res, 'Invalid body'); }

  const { user_id, email, phone, title, message, tag, url: actionUrl } = body;
  if (!title || !message) return badRequest(res, 'title and message required');

  const subscriptions = await getSubscriptions(user_id, email, phone);
  if (!subscriptions.length) return ok(res, { sent: 0, message: 'No subscriptions found' });

  const payload = JSON.stringify({ title, body: message, tag: tag || 'evexec', data: { url: actionUrl || '/' } });
  const results = await Promise.allSettled(
    subscriptions.map(sub => sendWebPush(
      sub,
      payload,
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
      process.env.VAPID_EMAIL || 'mailto:book@evexec.co.uk'
    ).catch(async err => {
      if (err.statusCode === 410) await deleteExpiredSubscription(sub.endpoint);
      throw err;
    }))
  );

  return ok(res, { sent: results.filter(r => r.status === 'fulfilled').length, total: subscriptions.length });
}

async function handleHealth(req, res) {
  if (!operatorAuthOk(req)) return unauthorised(res);

  if (req.method === 'GET') return ok(res, { ok: true, environment: envStatus() });
  if (req.method !== 'POST') return methodNotAllowed(res);

  let body = {};
  try { body = await readJson(req); }
  catch { return badRequest(res, 'Invalid JSON body'); }

  const channels = Array.isArray(body.channels) && body.channels.length ? body.channels : ['sms', 'email'];
  const toPhone = body.to_phone || process.env.OPERATOR_PHONE;
  const toEmail = body.to_email || process.env.OPERATOR_EMAIL;
  const stamp = new Date().toISOString();
  const tests = [];

  if (channels.includes('sms')) {
    try {
      if (!toPhone) throw new Error('No SMS recipient provided and OPERATOR_PHONE is missing');
      await sendSMS(toPhone, `EV Exec notification health test successful. ${stamp}`);
      tests.push({ channel: 'sms', ok: true, to: mask(normaliseUkPhone(toPhone)) });
    } catch (err) {
      console.error('Notification health SMS test failed:', err);
      tests.push({ channel: 'sms', ok: false, error: err.message || String(err) });
    }
  }

  if (channels.includes('email')) {
    try {
      if (!toEmail) throw new Error('No email recipient provided and OPERATOR_EMAIL is missing');
      await sendEmail({ to: toEmail, subject: 'EV Exec notification health test', html: `<p>EV Exec notification health test successful.</p><p>${stamp}</p>` });
      tests.push({ channel: 'email', ok: true, to: mask(toEmail) });
    } catch (err) {
      console.error('Notification health email test failed:', err);
      tests.push({ channel: 'email', ok: false, error: err.message || String(err) });
    }
  }

  res.statusCode = tests.every(t => t.ok) ? 200 : 207;
  return res.end(JSON.stringify({ ok: tests.every(t => t.ok), environment: envStatus(), tests }));
}

// Supabase pg_cron's every-minute sweep authenticates with a token that only
// exists in the Supabase vault; we check it by asking the DB, so the secret
// never has to be copied into Vercel.
async function sweepTokenOk(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) return false;
  try { return (await dbRpc('verify_notification_sweep_token', { p_token: m[1] })) === true; }
  catch (err) { console.error('Sweep token check failed:', err.message || err); return false; }
}

async function handleRetry(req, res) {
  if (!operatorAuthOk(req) && !cronAuthOk(req) && !(await sweepTokenOk(req))) return unauthorised(res);
  if (req.method !== 'POST' && req.method !== 'GET') return methodNotAllowed(res);
  const result = await processDue(50);
  return ok(res, { ok: true, ...result });
}

function mapEmailEvent(type) {
  const value = String(type || '').toLowerCase();
  if (value.includes('delivered')) return 'delivered';
  if (value.includes('bounced')) return 'failed';
  if (value.includes('complained')) return 'failed';
  if (value.includes('opened')) return 'opened';
  if (value.includes('clicked')) return 'clicked';
  return value || 'unknown';
}

async function updateEmailQueue(providerId, deliveryStatus, rawEvent) {
  if (!providerId) return;
  const update = { delivery_status: deliveryStatus, meta: { resend_event: rawEvent } };
  if (deliveryStatus === 'failed') update.status = 'failed';
  if (['delivered', 'opened', 'clicked'].includes(deliveryStatus)) update.status = 'sent';
  const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/notification_queue?provider_message_id=eq.${encodeURIComponent(providerId)}`, {
    method: 'PATCH',
    headers: dbHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify(update)
  });
  if (!patchRes.ok) throw new Error(`Resend delivery update failed: ${await patchRes.text()}`);
}

async function handleResendWebhook(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res);
  const body = await readJson(req);
  const eventType = body.type || body.event || '';
  const providerId = body.data && (body.data.email_id || body.data.id);
  await updateEmailQueue(providerId, mapEmailEvent(eventType), body);
  return ok(res, { ok: true });
}

function normaliseSmsStatus(value) {
  const status = String(value || '').toLowerCase();
  if (status === 'delivered') return 'delivered';
  if (status === 'failed' || status === 'undelivered') return 'failed';
  if (status === 'sent' || status === 'queued' || status === 'accepted' || status === 'sending') return status;
  return status || 'unknown';
}

async function handleSmsStatus(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res);
  const body = await readForm(req);
  const providerId = body.MessageSid || body.SmsSid || body.Sid;
  const deliveryStatus = normaliseSmsStatus(body.MessageStatus || body.SmsStatus || body.Status);
  const payload = { delivery_status: deliveryStatus, last_error: body.ErrorMessage || body.ErrorCode || null };
  if (deliveryStatus === 'failed') payload.status = 'failed';
  if (deliveryStatus === 'delivered') payload.status = 'sent';

  const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/notification_queue?provider_message_id=eq.${encodeURIComponent(providerId)}`, {
    method: 'PATCH',
    headers: dbHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify(payload)
  });
  if (!patchRes.ok) throw new Error(`SMS delivery update failed: ${await patchRes.text()}`);
  return ok(res, { ok: true });
}

function ok(res, payload) {
  res.statusCode = 200;
  return res.end(JSON.stringify(payload));
}

function badRequest(res, error) {
  res.statusCode = 400;
  return res.end(JSON.stringify({ error }));
}

function unauthorised(res) {
  res.statusCode = 401;
  return res.end(JSON.stringify({ error: 'Unauthorised' }));
}

function methodNotAllowed(res) {
  res.statusCode = 405;
  return res.end(JSON.stringify({ error: 'Method not allowed' }));
}

function serverError(res, error) {
  res.statusCode = 500;
  return res.end(JSON.stringify({ error }));
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const path = (req.url || '').split('?')[0];

  try {
    if (path.endsWith('/subscribe')) return handleSubscribe(req, res);
    if (path.endsWith('/send')) return handleSend(req, res);
    if (path.endsWith('/health')) return handleHealth(req, res);
    if (path.endsWith('/retry')) return handleRetry(req, res);
    if (path.endsWith('/resend-webhook')) return handleResendWebhook(req, res);
    if (path.endsWith('/sms-status')) return handleSmsStatus(req, res);
    if (path.endsWith('/notifications') || path.endsWith('/notifications/')) return ok(res, { ok: true, service: 'notifications' });

    res.statusCode = 404;
    return res.end(JSON.stringify({ error: 'Not found' }));
  } catch (err) {
    console.error('Notifications router error:', err);
    return serverError(res, err.message || String(err));
  }
};
