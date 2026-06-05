'use strict';

const crypto = require('crypto');
const { parseBody } = require('../../lib/parse');
const { sendWebPush, getSubscriptions, deleteExpiredSubscription } = require('../../lib/push');

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  const secret = req.headers['x-operator-secret'];
  const expected = process.env.OPERATOR_ACTION_SECRET;
  const secretValid = expected &&
    secret &&
    secret.length === expected.length &&
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
};
