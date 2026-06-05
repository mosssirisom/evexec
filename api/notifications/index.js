'use strict';

const crypto = require('crypto');
const { parseBody } = require('../../lib/parse');
const { verifyAuth } = require('../../lib/auth');
const { sendWebPush, getSubscriptions, deleteExpiredSubscription } = require('../../lib/push');

const SUPABASE_URL = () => process.env.SUPABASE_URL || 'https://yoltkmhtxwluqxxpewbl.supabase.co';
const SERVICE_KEY  = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

function dbHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    'apikey': SERVICE_KEY(),
    'Authorization': `Bearer ${SERVICE_KEY()}`,
    ...extra
  };
}

// ── POST /api/notifications/subscribe ──────────────────────────────────────

async function handleSubscribe(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  let body;
  try { body = await parseBody(req); }
  catch { res.statusCode = 400; return res.end(JSON.stringify({ error: 'Invalid body' })); }

  const { endpoint, keys, customer_phone, customer_email } = body;
  if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'Missing subscription fields' }));
  }

  const user = await verifyAuth(req);

  const row = {
    endpoint,
    p256dh:         keys.p256dh,
    auth_key:       keys.auth,
    user_id:        user ? user.id : null,
    customer_phone: customer_phone || null,
    customer_email: customer_email || (user ? user.email : null)
  };

  const r = await fetch(
    `${SUPABASE_URL()}/rest/v1/push_subscriptions`,
    {
      method: 'POST',
      headers: dbHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(row)
    }
  );

  if (!r.ok) {
    const text = await r.text();
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: text }));
  }

  if (user) {
    await fetch(
      `${SUPABASE_URL()}/rest/v1/profiles?id=eq.${user.id}`,
      {
        method: 'PATCH',
        headers: dbHeaders({ Prefer: 'return=minimal' }),
        body: JSON.stringify({ push_enabled: true, updated_at: new Date().toISOString() })
      }
    ).catch(() => {});
  }

  res.statusCode = 200;
  res.end(JSON.stringify({ success: true }));
}

// ── POST /api/notifications/send ───────────────────────────────────────────

async function handleSend(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  const secret   = req.headers['x-operator-secret'];
  const expected = process.env.OPERATOR_ACTION_SECRET;
  const secretValid = expected && secret && secret.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(expected));
  if (!secretValid) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: 'Unauthorised' }));
  }

  let body;
  try { body = await parseBody(req); }
  catch { res.statusCode = 400; return res.end(JSON.stringify({ error: 'Invalid body' })); }

  const { user_id, email, phone, title, message, tag, url: actionUrl } = body;
  if (!title || !message) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'title and message required' }));
  }

  const vapidPublicKey  = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidEmail      = process.env.VAPID_EMAIL || 'mailto:book@evexec.co.uk';

  const subscriptions = await getSubscriptions(user_id, email, phone);
  if (!subscriptions.length) {
    res.statusCode = 200;
    return res.end(JSON.stringify({ sent: 0, message: 'No subscriptions found' }));
  }

  const payload = JSON.stringify({
    title,
    body: message,
    tag: tag || 'evexec',
    data: { url: actionUrl || '/' }
  });

  const results = await Promise.allSettled(
    subscriptions.map(sub =>
      sendWebPush(sub, payload, vapidPublicKey, vapidPrivateKey, vapidEmail)
        .catch(async err => {
          if (err.statusCode === 410) await deleteExpiredSubscription(sub.endpoint);
          throw err;
        })
    )
  );

  const sent = results.filter(r => r.status === 'fulfilled').length;
  res.statusCode = 200;
  res.end(JSON.stringify({ sent, total: subscriptions.length }));
}

// ── Router ─────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  const path = (req.url || '').split('?')[0];
  if (path.endsWith('/subscribe')) return handleSubscribe(req, res);
  if (path.endsWith('/send'))      return handleSend(req, res);

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Not found' }));
};
