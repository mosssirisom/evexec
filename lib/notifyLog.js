'use strict';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yoltkmhtxwluqxxpewbl.supabase.co';

function headers() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    'Content-Type': 'application/json',
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Prefer': 'return=minimal'
  };
}

async function logNotification(bookingId, type, channel, recipient) {
  if (!bookingId) return;
  await fetch(`${SUPABASE_URL}/rest/v1/notification_log`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ booking_id: bookingId, type, channel, recipient: recipient || null })
  }).catch(err => console.error('notifyLog error:', err));
}

async function logMany(bookingId, type, entries) {
  if (!bookingId || !entries.length) return;
  await fetch(`${SUPABASE_URL}/rest/v1/notification_log`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(entries.map(([channel, recipient]) => ({ booking_id: bookingId, type, channel, recipient: recipient || null })))
  }).catch(err => console.error('notifyLog error:', err));
}

module.exports = { logNotification, logMany };
