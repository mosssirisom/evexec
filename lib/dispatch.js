'use strict';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yoltkmhtxwluqxxpewbl.supabase.co';
const BUFFER_MINS = 30;

function _headers() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };
}

function toMins(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + (m || 0);
}

// Returns true if two booking windows conflict (including BUFFER_MINS pad on each end)
function overlaps(aStart, aDur, bStart, bDur) {
  return (aStart - BUFFER_MINS) < (bStart + bDur + BUFFER_MINS) &&
         (aStart + aDur + BUFFER_MINS) > (bStart - BUFFER_MINS);
}

async function getOnlineDrivers() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/drivers?is_online=eq.true&select=id,name,email,phone,vehicle,plate,status`,
    { headers: _headers() }
  );
  return res.ok ? res.json() : [];
}

async function getBookingsOnDate(date) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?travel_date=eq.${date}&status=not.in.(Cancelled,rejected,cancelled,No Show)&select=id,assigned_driver_id,travel_time`,
    { headers: _headers() }
  );
  return res.ok ? res.json() : [];
}

async function _assignDriver(bookingId, driverId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?id=eq.${bookingId}`,
    {
      method: 'PATCH',
      headers: { ..._headers(), Prefer: 'return=minimal' },
      body: JSON.stringify({ assigned_driver_id: driverId, status: 'Dispatched', updated_at: new Date().toISOString() }),
    }
  );
  return res.ok;
}

// Returns { dispatched: bool, driverId?, available: Driver[] }
async function tryAutoDispatch(booking) {
  const { id, travel_date, travel_time } = booking;
  if (!travel_date || !travel_time) return { dispatched: false, available: [] };
  const startMins = toMins(travel_time);
  if (startMins === null) return { dispatched: false, available: [] };

  const estimatedDuration = booking.duration_mins || 90;

  const [drivers, dayBookings] = await Promise.all([
    getOnlineDrivers(),
    getBookingsOnDate(travel_date),
  ]);

  const available = drivers.filter(driver =>
    !dayBookings.some(b =>
      b.assigned_driver_id === driver.id &&
      b.id !== id &&
      overlaps(startMins, estimatedDuration, toMins(b.travel_time) ?? -9999, 90)
    )
  );

  if (available.length === 1) {
    const ok = await _assignDriver(id, available[0].id);
    if (ok) return { dispatched: true, driverId: available[0].id, available };
  }

  return { dispatched: false, available };
}

async function checkDriverAvailability(driverId, date, timeMins, durationMins = 90) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?assigned_driver_id=eq.${driverId}&travel_date=eq.${date}&status=not.in.(Cancelled,rejected,cancelled,No Show)&select=id,travel_time`,
    { headers: _headers() }
  );
  if (!res.ok) return false;
  const bookings = await res.json();
  return !bookings.some(b => overlaps(timeMins, durationMins, toMins(b.travel_time) ?? -9999, 90));
}

async function getCalendarAudit(startDate, endDate) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?travel_date=gte.${startDate}&travel_date=lte.${endDate}&status=not.in.(Cancelled,rejected,cancelled)&select=id,ref,travel_date,travel_time,assigned_driver_id,status,customer_name,pickup_location,airport,dropoff_address,quoted_price&order=travel_date.asc,travel_time.asc`,
    { headers: _headers() }
  );
  return res.ok ? res.json() : [];
}

module.exports = { tryAutoDispatch, checkDriverAvailability, getCalendarAudit, toMins, overlaps, BUFFER_MINS };
