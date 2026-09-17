'use strict';

// Daily "day before" flight re-verification (Requirement 7).
//
// Runs once a day via Vercel Cron (see vercel.json), finds every airport
// booking travelling tomorrow that has a flight number, and asks the
// evexecoperator Supabase Edge Function (verify-flight) to re-check it
// against AeroDataBox. That function is the single place flight-checking
// logic lives -- this endpoint is only the "which bookings are due today"
// scheduler, calling it once per booking, the same way this file's sibling
// api/reminders/trigger.js already schedules customer reminders.
//
// Auth: Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically
// when CRON_SECRET is set on the project -- same check as reminders/trigger.js.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yoltkmhtxwluqxxpewbl.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function dbHeaders() {
  return {
    'Content-Type': 'application/json',
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  };
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const NOT_DUE = "not.in.(Cancelled,Rejected,Completed,\"No Show\")";

async function getDueBookings(dateField, flightField, tomorrow) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?${dateField}=eq.${tomorrow}&${flightField}=not.is.null&status=${NOT_DUE}&select=id,${flightField}`,
    { headers: dbHeaders() }
  );
  if (!res.ok) {
    console.error(`Flight reverify: failed to query bookings (${dateField}):`, await res.text().catch(() => ''));
    return [];
  }
  const rows = await res.json();
  return rows.filter((r) => r[flightField] && String(r[flightField]).trim());
}

async function callVerify(bookingId, leg) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-flight`, {
    method: 'POST',
    headers: dbHeaders(),
    body: JSON.stringify({ bookingId, leg, source: 'auto_day_before' }),
  });
  const json = await res.json().catch(() => ({}));
  return { bookingId, leg, ok: res.ok && json.ok, error: json.error || (res.ok ? null : `HTTP ${res.status}`) };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  const auth = req.headers['authorization'] || '';
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: 'Unauthorised' }));
  }

  if (!SERVICE_ROLE_KEY) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' }));
  }

  try {
    const tomorrow = addDays(new Date().toISOString().slice(0, 10), 1);

    const [outbound, returns] = await Promise.all([
      getDueBookings('travel_date', 'flight_number', tomorrow),
      getDueBookings('return_date', 'return_flight', tomorrow),
    ]);

    const jobs = [
      ...outbound.map((b) => ({ bookingId: b.id, leg: 'outbound' })),
      ...returns.map((b) => ({ bookingId: b.id, leg: 'return' })),
    ];

    // Sequential with a short gap between calls -- a small regional
    // operator's daily volume never needs concurrency here, and this is
    // gentler on AeroDataBox's rate limit than firing everything at once.
    const results = [];
    for (const { bookingId, leg } of jobs) {
      results.push(await callVerify(bookingId, leg));
      await sleep(250);
    }

    const failed = results.filter((r) => !r.ok);
    if (failed.length) console.error('Flight reverify: some verifications failed:', failed);

    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true, checked: results.length, failed: failed.length }));
  } catch (err) {
    console.error('Flight reverify error:', err);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Internal error' }));
  }
};
