'use strict';

const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yoltkmhtxwluqxxpewbl.supabase.co';

function authOk(req) {
  const secret = req.headers['x-operator-secret'];
  const expected = process.env.OPERATOR_ACTION_SECRET;
  return expected && secret && secret.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(expected));
}

function headers(extra = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    'Content-Type': 'application/json',
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...extra
  };
}

function safeLimit(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return 100;
  return Math.max(1, Math.min(n, 250));
}

function maskRecipient(recipient) {
  if (!recipient) return null;
  const str = String(recipient);
  if (str.includes('@')) return str.replace(/(.{2}).+(@.+)/, '$1***$2');
  if (str.length <= 7) return '***';
  return str.slice(0, 4) + '***' + str.slice(-3);
}

async function fetchQueue(req) {
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

  const res = await fetch(`${SUPABASE_URL}/rest/v1/notification_queue?${query}`, { headers: headers() });
  if (!res.ok) throw new Error(`Notification queue fetch failed: ${await res.text()}`);
  const rows = await res.json();

  const countsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/notification_queue?select=status`,
    { headers: headers() }
  );
  let summary = { pending: 0, sent: 0, failed: 0, total: rows.length };
  if (countsRes.ok) {
    const all = await countsRes.json();
    summary = all.reduce((acc, row) => {
      acc.total += 1;
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    }, { pending: 0, sent: 0, failed: 0, total: 0 });
  }

  return {
    summary,
    items: rows.map(row => ({ ...row, recipient_masked: maskRecipient(row.recipient), recipient: undefined }))
  };
}

async function requeue(id) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/notification_queue?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify({
      status: 'pending',
      next_attempt_at: new Date().toISOString(),
      last_error: null
    })
  });
  if (!res.ok) throw new Error(`Notification requeue failed: ${await res.text()}`);
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (!authOk(req)) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: 'Unauthorised' }));
  }

  try {
    if (req.method === 'GET') {
      const data = await fetchQueue(req);
      res.statusCode = 200;
      return res.end(JSON.stringify({ ok: true, ...data }));
    }

    if (req.method === 'POST') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString('utf8');
      const body = raw ? JSON.parse(raw) : {};
      if (body.action !== 'requeue' || !body.id) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: 'Expected action=requeue and id' }));
      }
      await requeue(body.id);
      res.statusCode = 200;
      return res.end(JSON.stringify({ ok: true, id: body.id, status: 'pending' }));
    }

    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  } catch (err) {
    console.error('Notification queue endpoint error:', err);
    res.statusCode = 500;
    return res.end(JSON.stringify({ ok: false, error: err.message || String(err) }));
  }
};
