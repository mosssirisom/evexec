'use strict';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yoltkmhtxwluqxxpewbl.supabase.co';

function headers(extra = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`, ...extra };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  const params = new URLSearchParams(raw);
  const body = {};
  params.forEach((value, key) => { body[key] = value; });
  return body;
}

function normaliseStatus(value) {
  const status = String(value || '').toLowerCase();
  if (status === 'delivered') return 'delivered';
  if (status === 'failed' || status === 'undelivered') return 'failed';
  if (status === 'sent' || status === 'queued' || status === 'accepted' || status === 'sending') return status;
  return status || 'unknown';
}

async function updateDelivery(providerId, deliveryStatus, errorText) {
  if (!providerId) return;
  const payload = { delivery_status: deliveryStatus, last_error: errorText || null };
  if (deliveryStatus === 'failed') payload.status = 'failed';
  if (deliveryStatus === 'delivered') payload.status = 'sent';

  const res = await fetch(`${SUPABASE_URL}/rest/v1/notification_queue?provider_message_id=eq.${encodeURIComponent(providerId)}`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`SMS delivery update failed: ${await res.text()}`);
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  try {
    const body = await readBody(req);
    const providerId = body.MessageSid || body.SmsSid || body.Sid;
    const deliveryStatus = normaliseStatus(body.MessageStatus || body.SmsStatus || body.Status);
    const errorText = body.ErrorMessage || body.ErrorCode || null;
    await updateDelivery(providerId, deliveryStatus, errorText);
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: true }));
  } catch (err) {
    console.error('SMS status endpoint error:', err);
    res.statusCode = 500;
    return res.end(JSON.stringify({ ok: false }));
  }
};
