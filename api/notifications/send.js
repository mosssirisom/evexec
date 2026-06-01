'use strict';

const webpush = require('web-push');
const { parseBody } = require('../../lib/parse');

const SUPABASE_URL = () => process.env.SUPABASE_URL;
const SERVICE_KEY  = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

function dbHeaders() {
  return {
    'Content-Type': 'application/json',
    'apikey': SERVICE_KEY(),
    'Authorization': `Bearer ${SERVICE_KEY()}`
  };
}

async function getSubscriptions(userId, email, phone) {
  const filters = [];
  if (userId) filters.push(`user_id=eq.${userId}`);
  if (email)  filters.push(`customer_email=eq.${encodeURIComponent(email)}`);
  if (phone)  filters.push(`customer_phone=eq.${encodeURIComponent(phone)}`);
  if (!filters.length) return [];

  const query = filters.join(',');
  const url = `${SUPABASE_URL()}/rest/v1/push_subscriptions?or=(${query})&select=*`;
  const res = await fetch(url, { headers: dbHeaders() });
  if (!res.ok) return [];
  return res.json();
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  const secret = req.headers['x-operator-secret'];
  if (!process.env.OPERATOR_ACTION_SECRET || secret !== process.env.OPERATOR_ACTION_SECRET) {
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

  webpush.setVapidDetails(
    process.env.VAPID_EMAIL || 'mailto:book@evexec.co.uk',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

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
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
        payload
      ).catch(async err => {
        if (err.statusCode === 410) {
          await fetch(
            `${SUPABASE_URL()}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`,
            { method: 'DELETE', headers: dbHeaders() }
          ).catch(() => {});
        }
        throw err;
      })
    )
  );

  const sent = results.filter(r => r.status === 'fulfilled').length;
  res.statusCode = 200;
  res.end(JSON.stringify({ sent, total: subscriptions.length }));
};
