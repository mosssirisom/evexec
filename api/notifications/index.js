'use strict';

const crypto = require('crypto');
const { parseBody } = require('../../lib/parse');
const { verifyAuth } = require('../../lib/auth');
const { sendWebPush, getSubscriptions, deleteExpiredSubscription } = require('../../lib/push');
const { sendSMS, sendEmail, sendConfirmations, sendPaymentReceived, normaliseUkPhone, paymentMethodLabel } = require('../../lib/notify');
const { processDue } = require('../../lib/notificationQueue');
const { logMany } = require('../../lib/notifyLog');

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

function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
  return Boolean(cronSecret && req.headers.authorization === `Bearer ${cronSecret}`);
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

// ── Confirm a booking — used by evexecoperator to give operator-created
// bookings the exact same SMS+email+push confirmation website bookings get
// once payment is chosen (sendConfirmations), rather than a separate
// SMS-only "is booked" text. Operator-secret protected, same as /send. ────
async function handleConfirm(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res);
  if (!operatorAuthOk(req)) return unauthorised(res);

  let body;
  try { body = await readJson(req); }
  catch { return badRequest(res, 'Invalid JSON body'); }

  const { booking_id } = body;
  if (!booking_id) return badRequest(res, 'booking_id required');

  const bookingRes = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(booking_id)}&select=*&limit=1`,
    { headers: dbHeaders() }
  );
  if (!bookingRes.ok) return serverError(res, await bookingRes.text());
  const rows = await bookingRes.json();
  const booking = rows[0];
  if (!booking) return badRequest(res, 'Booking not found');

  try {
    await sendConfirmations(booking);
    return ok(res, { ok: true });
  } catch (err) {
    console.error('Confirm notification error:', err);
    return serverError(res, err.message || String(err));
  }
}

// ── Payment confirmed — called by evexecoperator's Stripe webhook after it
// marks a booking Paid. That webhook previously only ever updated the
// database; nobody was told, customer included. This now does both sides
// of a standard "payment successful" flow:
//   - customer: SMS + receipt-style email (sendPaymentReceived)
//   - operator: SMS + email alert (OPERATOR_PHONE/OPERATOR_EMAIL, whichever
//     are configured)
// Operator-secret protected, same pattern as /confirm. Each side runs
// independently — a failure on one (e.g. no OPERATOR_EMAIL configured)
// never blocks the other. ───────────────────────────────────────────────
async function handlePaymentConfirmed(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res);
  if (!operatorAuthOk(req)) return unauthorised(res);

  let body;
  try { body = await readJson(req); }
  catch { return badRequest(res, 'Invalid JSON body'); }

  const { booking_id } = body;
  if (!booking_id) return badRequest(res, 'booking_id required');

  const bookingRes = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(booking_id)}&select=*&limit=1`,
    { headers: dbHeaders() }
  );
  if (!bookingRes.ok) return serverError(res, await bookingRes.text());
  const rows = await bookingRes.json();
  const booking = rows[0];
  if (!booking) return badRequest(res, 'Booking not found');

  // ── Customer: standard "payment successful" confirmation + receipt ──────
  let customerSent = 0;
  try {
    const settled = await sendPaymentReceived(booking);
    customerSent = settled.filter(r => r.status === 'fulfilled').length;
  } catch (err) {
    console.error('Payment-confirmed customer notification failed:', err.message || err);
  }

  // ── Operator: alert that a payment link was actually paid ───────────────
  const opPhone = process.env.OPERATOR_PHONE;
  const opEmail = process.env.OPERATOR_EMAIL;
  let operatorSent = 0;

  if (opPhone || opEmail) {
    const amount = booking.price ?? booking.quoted_price;
    const amountTxt = amount != null ? `£${Number(amount).toFixed(2)}` : 'unknown amount';
    const smsTxt = `EV Exec: PAID — ${booking.customer_name} (Ref ${booking.ref}), ${amountTxt} via Stripe payment link.`;
    const emailHtml = `<div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto"><div style="background:#10b981;padding:20px 28px;border-radius:12px 12px 0 0"><h1 style="margin:0;color:#06101c;font-size:1.2rem">Payment Received</h1></div><div style="background:#020813;color:#fff;padding:28px;border-radius:0 0 12px 12px"><p style="margin:0 0 12px;color:rgba(255,255,255,.65)"><strong style="color:#fff">${esc(booking.customer_name)}</strong> (Ref ${esc(booking.ref)}) paid ${esc(amountTxt)} via Stripe payment link.</p><p style="margin:0;color:rgba(255,255,255,.5);font-size:13px">Payment method on record: ${esc(paymentMethodLabel(booking.payment_method))}</p></div></div>`;

    const tasks = [];
    const logEntries = [];
    if (opPhone) { tasks.push(sendSMS(opPhone, smsTxt)); logEntries.push(['sms', opPhone]); }
    if (opEmail) { tasks.push(sendEmail({ to: opEmail, subject: `Payment Received — Ref ${booking.ref}`, html: emailHtml })); logEntries.push(['email', opEmail]); }

    const settled = await Promise.allSettled(tasks);
    operatorSent = settled.filter(r => r.status === 'fulfilled').length;
    if (operatorSent > 0) await logMany(booking.id, 'payment_confirmed', logEntries).catch(() => {});

    const failed = settled.filter(r => r.status === 'rejected');
    if (failed.length) console.error('Payment-confirmed operator alert failed:', failed.map(f => f.reason && f.reason.message));
  }

  return ok(res, { ok: true, customerSent, operatorSent });
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

function safeLimit(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return 100;
  return Math.max(1, Math.min(n, 250));
}

async function handleQueue(req, res) {
  if (!operatorAuthOk(req)) return unauthorised(res);

  if (req.method === 'GET') {
    const url = new URL(req.url, 'https://evexec.co.uk');
    const status = url.searchParams.get('status');
    const bookingId = url.searchParams.get('booking_id');
    const limit = safeLimit(url.searchParams.get('limit'));
    const filters = [];
    if (status) filters.push(`status=eq.${encodeURIComponent(status)}`);
    if (bookingId) filters.push(`booking_id=eq.${encodeURIComponent(bookingId)}`);
    const query = [
      ...filters,
      'select=id,booking_id,type,channel,recipient,subject,status,attempts,next_attempt_at,sent_at,last_error,created_at,meta',
      'order=created_at.desc',
      `limit=${limit}`
    ].join('&');

    const queueRes = await fetch(`${SUPABASE_URL}/rest/v1/notification_queue?${query}`, { headers: dbHeaders() });
    if (!queueRes.ok) throw new Error(`Notification queue fetch failed: ${await queueRes.text()}`);
    const rows = await queueRes.json();

    const countsRes = await fetch(`${SUPABASE_URL}/rest/v1/notification_queue?select=status`, { headers: dbHeaders() });
    let summary = { pending: 0, sent: 0, failed: 0, total: rows.length };
    if (countsRes.ok) {
      const all = await countsRes.json();
      summary = all.reduce((acc, row) => {
        acc.total += 1;
        acc[row.status] = (acc[row.status] || 0) + 1;
        return acc;
      }, { pending: 0, sent: 0, failed: 0, total: 0 });
    }

    return ok(res, { ok: true, summary, items: rows.map(row => ({ ...row, recipient_masked: mask(row.recipient), recipient: undefined })) });
  }

  if (req.method === 'POST') {
    const body = await readJson(req);
    if (body.action !== 'requeue' || !body.id) return badRequest(res, 'Expected action=requeue and id');
    const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/notification_queue?id=eq.${encodeURIComponent(body.id)}`, {
      method: 'PATCH',
      headers: dbHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ status: 'pending', next_attempt_at: new Date().toISOString(), last_error: null })
    });
    if (!patchRes.ok) throw new Error(`Notification requeue failed: ${await patchRes.text()}`);
    return ok(res, { ok: true, id: body.id, status: 'pending' });
  }

  return methodNotAllowed(res);
}

async function handleRetry(req, res) {
  if (!operatorAuthOk(req) && !cronAuthOk(req)) return unauthorised(res);
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
    if (path.endsWith('/confirm')) return handleConfirm(req, res);
    if (path.endsWith('/payment-confirmed')) return handlePaymentConfirmed(req, res);
    if (path.endsWith('/health')) return handleHealth(req, res);
    if (path.endsWith('/queue')) return handleQueue(req, res);
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
