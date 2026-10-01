'use strict';

// Handles: /api/operator/accept, /api/operator/reject (retired: points to the operator app)
//          /api/operator/bookings (GET — admin list)
//          /api/operator/notify   (POST — retired, returns 410)
//          /api/operator/manage   (GET/POST — legacy alias)

const crypto = require('crypto');
const { dbGet, dbUpdate, isValidUUID } = require('../../lib/supabase');
const { parseBody } = require('../../lib/parse');
const { operatorPage } = require('../../lib/pages');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yoltkmhtxwluqxxpewbl.supabase.co';

function dbHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };
}

function authOk(req) {
  const secret = req.headers['x-operator-secret'];
  const expected = process.env.OPERATOR_ACTION_SECRET;
  return expected && secret && secret.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(expected));
}

// ── Accept / Reject (retired) ──────────────────────────────────────────────
// Bookings are accepted and rejected in the EV Exec operator app, which sends
// the customer's confirmation/rejection through the shared correspondence
// queue. These old one-click links (still present in emails sent before the
// change) no longer change the booking or message the customer; they point
// staff to the operator app instead, so a booking can't get two competing
// confirmations.

async function handleAction(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const dispatchUrl = `${process.env.OPERATOR_APP_URL || 'https://evexecoperator.vercel.app'}/operator/dispatch`;
  return res.end(operatorPage('Use the operator app',
    `<p>Bookings are now accepted and rejected in the EV Exec operator app. The customer is notified automatically from there.</p><p><a href="${dispatchUrl}" style="color:#d5a538">Open dispatch &rarr;</a></p>`, false));
}

// ── Bookings list ──────────────────────────────────────────────────────────

async function listBookings(req, res) {
  res.setHeader('Content-Type', 'application/json');
  try {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const [bookingsRes, logsRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/bookings?travel_date=gte.${cutoffStr}&select=id,ref,customer_name,customer_phone,customer_email,travel_date,travel_time,status,payment_method,payment_status,journey_type,pickup_location,airport,dropoff_address,assigned_driver_id&order=travel_date.asc&limit=200`, { headers: dbHeaders() }),
      fetch(`${SUPABASE_URL}/rest/v1/notification_log?select=booking_id,type,channel,recipient,sent_at&order=sent_at.desc&limit=2000`, { headers: dbHeaders() })
    ]);
    if (!bookingsRes.ok) throw new Error('Failed to load bookings');
    const bookings = await bookingsRes.json();
    let logs = []; if (logsRes.ok) logs = await logsRes.json();
    const logsByBooking = {};
    for (const log of logs) { if (!logsByBooking[log.booking_id]) logsByBooking[log.booking_id] = []; logsByBooking[log.booking_id].push(log); }
    res.end(JSON.stringify(bookings.map(b => ({ ...b, notifications: logsByBooking[b.id] || [] }))));
  } catch (err) { console.error('Operator bookings error:', err); res.statusCode = 500; res.end(JSON.stringify({ error: 'Failed to load bookings' })); }
}

// ── Drivers list ───────────────────────────────────────────────────────────

async function listDrivers(req, res) {
  res.setHeader('Content-Type', 'application/json');
  try {
    const driversRes = await fetch(`${SUPABASE_URL}/rest/v1/drivers?select=id,name,vehicle,plate,is_online,status&order=name.asc`, { headers: dbHeaders() });
    if (!driversRes.ok) throw new Error('Failed to load drivers');
    const drivers = await driversRes.json();
    res.end(JSON.stringify(drivers));
  } catch (err) { console.error('Operator drivers error:', err); res.statusCode = 500; res.end(JSON.stringify({ error: 'Failed to load drivers' })); }
}

// ── Assign driver to booking ──────────────────────────────────────────────

async function assignDriver(req, res) {
  res.setHeader('Content-Type', 'application/json');
  let body; try { body = await parseBody(req); } catch { res.statusCode = 400; return res.end(JSON.stringify({ error: 'Invalid body' })); }
  const { booking_id, driver_id } = body;
  if (!booking_id || !isValidUUID(booking_id)) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'Valid booking_id required' })); }
  if (driver_id && !isValidUUID(driver_id)) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'Invalid driver_id' })); }
  try {
    const booking = await dbGet('bookings', booking_id);
    if (!booking) { res.statusCode = 404; return res.end(JSON.stringify({ error: 'Booking not found' })); }
    const driverIdValue = driver_id || null;
    await dbUpdate('bookings', booking_id, { assigned_driver_id: driverIdValue, driver_id: driverIdValue });
    res.end(JSON.stringify({ ok: true, booking_id, driver_id: driverIdValue }));
  } catch (err) { console.error('Operator assign error:', err); res.statusCode = 500; res.end(JSON.stringify({ error: 'Failed to assign driver' })); }
}

// ── Send notification (retired) ────────────────────────────────────────────
// The old dashboard's manual "send confirmation/reminder" action composed its
// own messages (and texted through Twilio). Customer confirmations and
// reminders are now sent automatically from the shared templates, so this
// action is switched off to avoid duplicate or inconsistent messages.

async function sendNotification(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = 410;
  res.end(JSON.stringify({ error: 'Manual customer messages have moved to the EV Exec operator app. Confirmations and reminders are sent automatically.' }));
}

// ── Router ─────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  const path = (req.url || '').split('?')[0];

  if (path.endsWith('/accept') || path.endsWith('/reject')) return handleAction(req, res);

  res.setHeader('Content-Type', 'application/json');
  if (!authOk(req)) { res.statusCode = 401; return res.end(JSON.stringify({ error: 'Unauthorised' })); }

  if ((path.endsWith('/bookings') || path.endsWith('/manage')) && req.method === 'GET') return listBookings(req, res);
  if (path.endsWith('/drivers') && req.method === 'GET') return listDrivers(req, res);
  if (path.endsWith('/assign') && req.method === 'POST') return assignDriver(req, res);
  if ((path.endsWith('/notify') || path.endsWith('/manage')) && req.method === 'POST') return sendNotification(req, res);

  res.statusCode = 404; res.end(JSON.stringify({ error: 'Not found' }));
};
