'use strict';

const crypto = require('crypto');
const { processDue } = require('../../lib/notificationQueue');

function authorised(req) {
  const secret = req.headers['x-operator-secret'];
  const expected = process.env.OPERATOR_ACTION_SECRET;
  return expected && secret && secret.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(expected));
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  const cronSecret = process.env.CRON_SECRET;
  const cronHeader = req.headers.authorization === `Bearer ${cronSecret}`;

  if (!authorised(req) && !cronHeader) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: 'Unauthorised' }));
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  try {
    const result = await processDue(50);
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: true, ...result }));
  } catch (err) {
    console.error('Notification retry processor error:', err);
    res.statusCode = 500;
    return res.end(JSON.stringify({ ok: false, error: err.message || String(err) }));
  }
};
