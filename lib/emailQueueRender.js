'use strict';

// Queued emails (notification_queue rows written by database triggers, the
// driver app's edge functions and this site's own retries) are rendered again
// with the current email design at the moment they are sent, from the
// booking's current details. So every system sends the same layout, and a
// job that changed after the row was queued is described as it is now.
//
// Anything unrecognised, or any lookup failure, returns null and the row's
// stored HTML is sent as before: a rendering problem never stops an email.

const C = require('./emailContent');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yoltkmhtxwluqxxpewbl.supabase.co';
function headers() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { apikey: key, Authorization: `Bearer ${key}` };
}
async function one(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: headers() });
  if (!res.ok) throw new Error(`${path.split('?')[0]} lookup failed: ${res.status}`);
  const rows = await res.json();
  return rows[0] || null;
}

const DRIVER_COLS = 'id,full_name,phone,vehicle_model,vehicle_registration';

// What the database's status_update body says happened.
function statusKind(body) {
  const b = String(body || '').toLowerCase();
  if (b.includes('on the way')) return 'on_the_way';
  if (b.includes('has arrived')) return 'arrived';
  if (b.includes('cancelled')) return 'cancelled';
  return null;
}

const TYPES = {
  driver_allocated: (b) => C.driverNewJob(b),
  driver_reminder_24h: (b) => C.driverReminder(b, { type: '24h' }),
  driver_reminder_1h: (b) => C.driverReminder(b, { type: '1h' }),
  job_updated: (b) => C.driverJobUpdated(b),
  job_cancelled: (b) => C.driverJobCancelled(b),
  attestation_first: (b) => C.driverConfirmPickup(b),
  attestation_second_urgent: (b) => C.driverConfirmPickup(b, { urgent: true }),
  attestation_alert: (b, ctx) => C.staffDriverNotConfirmed(b, ctx),
  received: (b) => C.bookingConfirmed(b),
  reminder_24h: (b, ctx) => C.reminder(b, { type: '24hr', driver: ctx.driver }),
  reminder_7d: (b, ctx) => C.reminder(b, { type: '7day', driver: ctx.driver }),
  customer_sms_reminder: (b, ctx) => C.driverCustomerReminderDue(b, { message: ctx.message }),
  status_update: (b, ctx, item) => {
    const kind = statusKind(item.body);
    if (kind === 'on_the_way') return C.driverOnTheWay(b, ctx);
    if (kind === 'arrived') return C.driverArrived(b, ctx);
    if (kind === 'cancelled') return C.cancelledByUs(b);
    return null;
  },
};

async function renderQueued(item) {
  try {
    if (!item || item.channel !== 'email' || !item.booking_id) return null;
    // Retries of this site's own sends (they carry meta.label) already hold
    // the new design; only database and driver-app rows are re-rendered.
    if (item.meta && item.meta.label) return null;
    const make = TYPES[item.type];
    if (!make) return null;
    const b = await one(`bookings?id=eq.${encodeURIComponent(item.booking_id)}&select=*&limit=1`);
    if (!b) return null;
    // 'received' from the database is the confirmation for phone bookings only.
    if (item.type === 'received' && b.source !== 'operator') return null;
    const driverId = b.assigned_driver_id || b.driver_id;
    const driver = driverId ? await one(`drivers?id=eq.${encodeURIComponent(driverId)}&select=${DRIVER_COLS}&limit=1`).catch(() => null) : null;
    let message = null;
    if (item.type === 'customer_sms_reminder') {
      const r = await one(`driver_sms_reminders?booking_id=eq.${encodeURIComponent(b.id)}&reminder_type=eq.24hr&select=message&limit=1`).catch(() => null);
      message = r && r.message;
    }
    const out = make(b, { driver, message }, item);
    return out && out.html ? out : null;
  } catch (err) {
    console.error(`Queued email re-render failed (${item && item.type}), sending stored version:`, err.message || err);
    return null;
  }
}

module.exports = { renderQueued, statusKind };
