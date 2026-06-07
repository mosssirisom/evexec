'use strict';

const { sendSMS, sendEmail, normaliseUkPhone } = require('./notify');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yoltkmhtxwluqxxpewbl.supabase.co';

function headers(extra = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    'Content-Type': 'application/json',
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...extra
  };
}

function nextAttemptDelay(attempts) {
  const mins = [2, 5, 15, 60, 240];
  return mins[Math.min(Math.max(attempts, 0), mins.length - 1)];
}

function parseProviderId(channel, raw) {
  if (!raw) return null;
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (channel === 'sms') return data.sid || null;
    if (channel === 'email') return data.id || null;
  } catch (_) {}
  return null;
}

async function enqueueNotification({ booking_id = null, type = 'manual', channel, recipient, subject = null, body = null, html = null, meta = {} }) {
  if (!channel || !recipient) return null;
  const payload = {
    booking_id,
    type,
    channel,
    recipient: channel === 'sms' ? normaliseUkPhone(recipient) : recipient,
    subject,
    body,
    html,
    meta,
    status: 'pending',
    delivery_status: null,
    provider_message_id: null,
    attempts: 0,
    next_attempt_at: new Date().toISOString(),
    last_error: null
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/notification_queue`, {
    method: 'POST',
    headers: headers({ Prefer: 'return=representation' }),
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`Notification queue insert failed: ${await res.text()}`);
  const rows = await res.json();
  return rows[0];
}

async function listDue(limit = 25) {
  const now = encodeURIComponent(new Date().toISOString());
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/notification_queue?status=eq.pending&next_attempt_at=lte.${now}&attempts=lt.5&select=*&order=next_attempt_at.asc&limit=${limit}`,
    { headers: headers() }
  );
  if (!res.ok) throw new Error(`Notification queue fetch failed: ${await res.text()}`);
  return res.json();
}

async function markSent(item, rawProviderResponse) {
  const providerId = parseProviderId(item.channel, rawProviderResponse);
  const update = {
    status: 'sent',
    delivery_status: 'sent',
    sent_at: new Date().toISOString(),
    last_error: null
  };
  if (providerId) update.provider_message_id = providerId;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/notification_queue?id=eq.${encodeURIComponent(item.id)}`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify(update)
  });
  if (!res.ok) throw new Error(`Notification queue sent update failed: ${await res.text()}`);
}

async function markFailed(item, error) {
  const attempts = (item.attempts || 0) + 1;
  const permanentlyFailed = attempts >= 5;
  const next = new Date(Date.now() + nextAttemptDelay(attempts) * 60000).toISOString();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/notification_queue?id=eq.${encodeURIComponent(item.id)}`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify({
      attempts,
      status: permanentlyFailed ? 'failed' : 'pending',
      delivery_status: permanentlyFailed ? 'failed' : 'retrying',
      next_attempt_at: permanentlyFailed ? null : next,
      last_error: error && error.message ? error.message : String(error || 'Unknown error')
    })
  });
  if (!res.ok) throw new Error(`Notification queue failed update failed: ${await res.text()}`);
}

async function processItem(item) {
  let providerResponse;
  if (item.channel === 'sms') {
    providerResponse = await sendSMS(item.recipient, item.body || 'EV Exec notification');
  } else if (item.channel === 'email') {
    providerResponse = await sendEmail({ to: item.recipient, subject: item.subject || 'EV Exec notification', html: item.html || item.body || '' });
  } else {
    throw new Error(`Unsupported notification channel: ${item.channel}`);
  }
  await markSent(item, providerResponse);
  return { id: item.id, channel: item.channel, ok: true };
}

async function processDue(limit = 25) {
  const items = await listDue(limit);
  const results = [];
  for (const item of items) {
    try {
      results.push(await processItem(item));
    } catch (err) {
      console.error('Notification retry failed:', item.id, err);
      await markFailed(item, err).catch(updateErr => console.error('Notification retry markFailed error:', updateErr));
      results.push({ id: item.id, channel: item.channel, ok: false, error: err.message || String(err) });
    }
  }
  return { processed: items.length, results };
}

module.exports = { enqueueNotification, processDue };
