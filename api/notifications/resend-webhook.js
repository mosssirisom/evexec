'use strict';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yoltkmhtxwluqxxpewbl.supabase.co';

function dbHeaders(extra = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`, ...extra };
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function mapEvent(type) {
  const value = String(type || '').toLowerCase();
  if (value.includes('delivered')) return 'delivered';
  if (value.includes('bounced')) return 'failed';
  if (value.includes('complained')) return 'failed';
  if (value.includes('opened')) return 'opened';
  if (value.includes('clicked')) return 'clicked';
  return value || 'unknown';
}

async function updateQueue(providerId, deliveryStatus, rawEvent) {
  if (!providerId) return;
  const update = {
    delivery_status: deliveryStatus,
    meta: { resend_event: rawEvent }
  };
  if (deliveryStatus === 'failed') update.status = 'failed';
  if (['delivered', 'opened', 'clicked'].includes(deliveryStatus)) update.status = 'sent';

  const res = await fetch(`${SUPABASE_URL}/rest/v1/notification_queue?provider_message_id=eq.${encodeURIComponent(providerId)}`, {
    method: 'PATCH',
    headers: dbHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify(update)
  });
  if (!res.ok) throw new Error(`Resend delivery update failed: ${await res.text()}`);
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  try {
    const body = await readJson(req);
    const eventType = body.type || body.event || '';
    const providerId = body.data && (body.data.email_id || body.data.id);
    await updateQueue(providerId, mapEvent(eventType), body);
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: true }));
  } catch (err) {
    console.error('Resend webhook error:', err);
    res.statusCode = 500;
    return res.end(JSON.stringify({ ok: false }));
  }
};
