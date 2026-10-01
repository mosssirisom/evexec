'use strict';

const { sendSMS, sendEmail, normaliseUkPhone } = require('./channels');
const { renderQueued, NEEDS_DRIVER, NEEDS_EXPENSES } = require('./messages');
const { singleLineSubject } = require('./format');

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

// Due rows: pending ones whose time has come, plus any left in 'sending' by a
// run that died mid-send (claim() pushes next_attempt_at 10 minutes ahead, so
// those come back round on their own).
async function listDue(limit = 25) {
  const now = encodeURIComponent(new Date().toISOString());
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/notification_queue?status=in.(pending,sending)&next_attempt_at=lte.${now}&attempts=lt.5&select=*&order=next_attempt_at.asc&limit=${limit}`,
    { headers: headers() }
  );
  if (!res.ok) throw new Error(`Notification queue fetch failed: ${await res.text()}`);
  return res.json();
}

// Take ownership of a row before sending it. The update only matches if
// nobody else has claimed it since we read it, so two overlapping runs (the
// per-minute sweep and an immediate kick) can never send the same message.
async function claim(item) {
  const filter = `id=eq.${encodeURIComponent(item.id)}&status=eq.${encodeURIComponent(item.status)}&next_attempt_at=eq.${encodeURIComponent(item.next_attempt_at)}`;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/notification_queue?${filter}`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=representation' }),
    body: JSON.stringify({ status: 'sending', next_attempt_at: new Date(Date.now() + 10 * 60000).toISOString() })
  });
  if (!res.ok) throw new Error(`Notification queue claim failed: ${await res.text()}`);
  const rows = await res.json();
  return rows.length > 0;
}

async function markSent(item, rawProviderResponse, rendered) {
  const providerId = parseProviderId(item.channel, rawProviderResponse);
  const update = {
    status: 'sent',
    delivery_status: 'sent',
    sent_at: new Date().toISOString(),
    last_error: null
  };
  if (providerId) update.provider_message_id = providerId;
  if (rendered) { update.subject = rendered.subject; update.recipient = rendered.recipient; }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/notification_queue?id=eq.${encodeURIComponent(item.id)}`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify(update)
  });
  if (!res.ok) throw new Error(`Notification queue sent update failed: ${await res.text()}`);
  if (rendered && item.booking_id) {
    await fetch(`${SUPABASE_URL}/rest/v1/notification_log`, {
      method: 'POST',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ booking_id: item.booking_id, type: item.type, channel: item.channel, recipient: rendered.recipient, sent_at: update.sent_at })
    }).catch(err => console.error('notification_log insert failed:', err));
  }
}

// A rendered request that should no longer be sent (booking gone, cancelled,
// driver changed...). Kept for the record rather than deleted.
async function markSkipped(item, reason) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/notification_queue?id=eq.${encodeURIComponent(item.id)}`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ status: 'cancelled', delivery_status: 'skipped', next_attempt_at: null, last_error: reason })
  });
  if (!res.ok) throw new Error(`Notification queue skip update failed: ${await res.text()}`);
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

async function getOne(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: headers() });
  if (!res.ok) throw new Error(`Lookup failed (${path.split('?')[0]}): ${await res.text()}`);
  const rows = await res.json();
  return rows[0] || null;
}

const CANCEL_NOTICES = new Set(['status_cancelled', 'booking_rejected', 'driver_job_cancelled', 'driver_sms_task']);
const DRIVER_TEMPLATES = new Set(['driver_new_job', 'driver_job_updated', 'driver_job_cancelled', 'driver_reminder', 'driver_confirm_job', 'driver_sms_task']);

// Build a queued request (meta.render) from the booking as it is now.
// Returns { subject, html, recipient } or { skip: reason }.
async function renderRequest(item) {
  const meta = item.meta || {};
  const template = meta.render;
  if (!item.booking_id) return { skip: 'No booking on request' };
  const booking = await getOne(`bookings?id=eq.${encodeURIComponent(item.booking_id)}&select=*`);
  if (!booking) return { skip: 'Booking no longer exists' };

  const cancelled = /^cancel/i.test(String(booking.status || ''));
  if (cancelled && !CANCEL_NOTICES.has(template)) return { skip: `Booking is ${booking.status}` };

  const extras = { ...meta };
  if (NEEDS_DRIVER.has(template)) {
    const driverId = meta.driver_id || booking.assigned_driver_id || booking.driver_id;
    if (DRIVER_TEMPLATES.has(template) && template !== 'driver_job_cancelled'
        && meta.driver_id && meta.driver_id !== (booking.assigned_driver_id || booking.driver_id)) {
      return { skip: 'Job has been reassigned to another driver' };
    }
    if (driverId) {
      extras.driver = await getOne(`drivers?id=eq.${encodeURIComponent(driverId)}&select=id,full_name,email,vehicle_model,vehicle_registration`);
    }
  }
  if (NEEDS_EXPENSES.has(template)) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/booking_expenses?booking_id=eq.${encodeURIComponent(booking.id)}&select=type,amount,notes`, { headers: headers() });
    extras.expenses = res.ok ? await res.json() : [];
  }

  let recipient = item.recipient;
  if (recipient === '__operator__') recipient = (process.env.OPERATOR_EMAIL || '').trim();
  if (recipient === '__driver__') recipient = extras.driver && extras.driver.email;
  if (!recipient) return { skip: 'No recipient email' };

  const msg = renderQueued(template, booking, extras);
  return { subject: singleLineSubject(msg.subject), html: msg.html, recipient };
}

async function processItem(item) {
  let providerResponse;
  let rendered = null;
  if (item.meta && item.meta.render) {
    if (item.channel !== 'email') throw new Error(`Rendered requests only support email, got ${item.channel}`);
    rendered = await renderRequest(item);
    if (rendered.skip) {
      await markSkipped(item, rendered.skip);
      return { id: item.id, channel: item.channel, ok: true, skipped: rendered.skip };
    }
    providerResponse = await sendEmail({ to: rendered.recipient, subject: rendered.subject, html: rendered.html });
  } else if (item.channel === 'sms') {
    providerResponse = await sendSMS(item.recipient, item.body || 'EV Exec notification');
  } else if (item.channel === 'email') {
    providerResponse = await sendEmail({ to: item.recipient, subject: item.subject || 'EV Exec notification', html: item.html || item.body || '' });
  } else {
    throw new Error(`Unsupported notification channel: ${item.channel}`);
  }
  await markSent(item, providerResponse, rendered);
  return { id: item.id, channel: item.channel, ok: true };
}

async function processDue(limit = 25) {
  const items = await listDue(limit);
  const results = [];
  for (const item of items) {
    try {
      if (!(await claim(item))) continue; // another run has it
      results.push(await processItem({ ...item, status: 'sending' }));
    } catch (err) {
      console.error('Notification retry failed:', item.id, err);
      await markFailed(item, err).catch(updateErr => console.error('Notification retry markFailed error:', updateErr));
      results.push({ id: item.id, channel: item.channel, ok: false, error: err.message || String(err) });
    }
  }
  return { processed: results.length, results };
}

// Send now; if it fails, queue it for the retry cron instead of losing it.
// queueItem is the same shape enqueueNotification takes.
async function sendOrQueue(sendFn, queueItem) {
  try {
    return await sendFn();
  } catch (err) {
    console.error(`Send failed (${queueItem.type}/${queueItem.channel}), queuing for retry:`, err.message || err);
    try {
      await enqueueNotification(queueItem);
    } catch (queueErr) {
      console.error('Failed to queue retry:', queueErr.message || queueErr);
    }
    throw err;
  }
}

module.exports = { enqueueNotification, processDue, sendOrQueue, renderRequest };
