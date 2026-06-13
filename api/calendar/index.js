'use strict';

// Handles: /api/calendar/availability  (GET  — driver availability for a date)
//          /api/calendar/audit         (GET  — booking calendar for a date range)
//          /api/calendar/assign        (POST — manually assign a driver to a booking)
//          /api/calendar/dispatch      (POST — trigger auto-dispatch for a booking)

const crypto = require('crypto');
const { dbGet, dbUpdate, isValidUUID } = require('../../lib/supabase');
const { parseBody } = require('../../lib/parse');
const { tryAutoDispatch, getCalendarAudit } = require('../../lib/dispatch');

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

function j(res, c, p) {
  res.statusCode = c;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.end(JSON.stringify(p));
}

function getQuery(req) {
  return new URL(req.url || '', 'http://internal').searchParams;
}

// ── GET /api/calendar/availability?date=YYYY-MM-DD ─────────────────────────

async function handleAvailability(req, res) {
  if (req.method !== 'GET') return j(res, 405, { error: 'Method not allowed' });

  const date = getQuery(req).get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return j(res, 400, { error: 'Invalid or missing date (YYYY-MM-DD)' });

  const [driversRes, bookingsRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/drivers?select=id,name,phone,vehicle,plate,status,is_online`, { headers: dbHeaders() }),
    fetch(`${SUPABASE_URL}/rest/v1/bookings?travel_date=eq.${date}&status=not.in.(Cancelled,rejected,cancelled,No Show)&select=id,ref,assigned_driver_id,travel_time,status,customer_name`, { headers: dbHeaders() }),
  ]);

  if (!driversRes.ok || !bookingsRes.ok) return j(res, 500, { error: 'Failed to load calendar data' });

  const [drivers, bookings] = await Promise.all([driversRes.json(), bookingsRes.json()]);

  const result = drivers.map(d => ({
    ...d,
    bookings: bookings.filter(b => b.assigned_driver_id === d.id),
  }));

  return j(res, 200, { date, drivers: result, unassigned: bookings.filter(b => !b.assigned_driver_id) });
}

// ── GET /api/calendar/audit?start=YYYY-MM-DD&end=YYYY-MM-DD ────────────────

async function handleAudit(req, res) {
  if (req.method !== 'GET') return j(res, 405, { error: 'Method not allowed' });

  const q = getQuery(req);
  const start = q.get('start');
  const end = q.get('end') || start;
  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return j(res, 400, { error: 'Invalid or missing start date (YYYY-MM-DD)' });

  const bookings = await getCalendarAudit(start, end);
  return j(res, 200, { start, end, bookings });
}

// ── POST /api/calendar/assign  { bookingId, driverId } ─────────────────────

async function handleAssign(req, res) {
  if (req.method !== 'POST') return j(res, 405, { error: 'Method not allowed' });

  let body;
  try { body = await parseBody(req); } catch { return j(res, 400, { error: 'Invalid body' }); }

  const { bookingId, driverId } = body;
  if (!bookingId || !isValidUUID(bookingId)) return j(res, 400, { error: 'Invalid bookingId' });
  if (!driverId || !isValidUUID(driverId)) return j(res, 400, { error: 'Invalid driverId' });

  const booking = await dbGet('bookings', bookingId);
  if (!booking) return j(res, 404, { error: 'Booking not found' });

  await dbUpdate('bookings', bookingId, {
    assigned_driver_id: driverId,
    status: 'Dispatched',
    updated_at: new Date().toISOString(),
  });

  return j(res, 200, { ok: true, bookingId, driverId });
}

// ── POST /api/calendar/dispatch  { bookingId } ─────────────────────────────

async function handleDispatch(req, res) {
  if (req.method !== 'POST') return j(res, 405, { error: 'Method not allowed' });

  let body;
  try { body = await parseBody(req); } catch { return j(res, 400, { error: 'Invalid body' }); }

  const { bookingId } = body;
  if (!bookingId || !isValidUUID(bookingId)) return j(res, 400, { error: 'Invalid bookingId' });

  const booking = await dbGet('bookings', bookingId);
  if (!booking) return j(res, 404, { error: 'Booking not found' });

  const result = await tryAutoDispatch(booking);
  return j(res, 200, result);
}

// ── Router ──────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  if (!authOk(req)) return j(res, 401, { error: 'Unauthorised' });

  const path = (req.url || '').split('?')[0];
  try {
    if (path.endsWith('/availability')) return handleAvailability(req, res);
    if (path.endsWith('/audit'))        return handleAudit(req, res);
    if (path.endsWith('/assign'))       return handleAssign(req, res);
    if (path.endsWith('/dispatch'))     return handleDispatch(req, res);
    return j(res, 200, { ok: true, service: 'calendar' });
  } catch (err) {
    console.error('Calendar error:', err);
    return j(res, 500, { error: 'Internal error' });
  }
};
