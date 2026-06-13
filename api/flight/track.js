'use strict';

// Cron: checks AviationStack for live status of today's bookings with a flight
// number, and pushes the travel_time back if the inbound flight is delayed.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yoltkmhtxwluqxxpewbl.supabase.co';
const DELAY_THRESHOLD_MINS = 15;

function dbHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };
}

async function getFlightStatus(flightNumber) {
  const key = process.env.AVIATIONSTACK_API_KEY;
  if (!key || !flightNumber) return null;
  try {
    const params = new URLSearchParams({
      access_key: key,
      flight_iata: flightNumber.toUpperCase().replace(/\s+/g, ''),
    });
    const res = await fetch(`http://api.aviationstack.com/v1/flights?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    const flight = data?.data?.[0];
    if (!flight) return null;
    return {
      status: flight.flight_status,
      delayMins: flight.arrival?.delay || 0,
    };
  } catch {
    return null;
  }
}

function addMinutesToTime(timeStr, minutes) {
  if (!timeStr) return timeStr;
  const [h, m] = timeStr.split(':').map(Number);
  const total = ((h * 60 + (m || 0)) + minutes + 1440) % 1440;
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  const auth = req.headers['authorization'] || '';
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: 'Unauthorised' }));
  }

  try {
    const today = new Date().toISOString().slice(0, 10);

    const bookingsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/bookings?travel_date=eq.${today}&journey_type=eq.From Airport&flight_number=not.is.null&status=not.in.(Cancelled,Completed,No Show,cancelled,rejected)&select=id,flight_number,travel_time`,
      { headers: dbHeaders() }
    );
    if (!bookingsRes.ok) throw new Error('Failed to load bookings');
    const bookings = await bookingsRes.json();

    const results = [];
    for (const booking of bookings) {
      if (!booking.flight_number) continue;
      const info = await getFlightStatus(booking.flight_number);
      if (!info) { results.push({ id: booking.id, skipped: true }); continue; }

      if (info.delayMins > DELAY_THRESHOLD_MINS) {
        const newTime = addMinutesToTime(booking.travel_time, info.delayMins);
        await fetch(
          `${SUPABASE_URL}/rest/v1/bookings?id=eq.${booking.id}`,
          {
            method: 'PATCH',
            headers: { ...dbHeaders(), Prefer: 'return=minimal' },
            body: JSON.stringify({ travel_time: newTime, updated_at: new Date().toISOString() }),
          }
        );
        results.push({ id: booking.id, updated: true, delayMins: info.delayMins, newTime });
      } else {
        results.push({ id: booking.id, status: info.status, delayMins: info.delayMins });
      }
    }

    res.statusCode = 200;
    res.end(JSON.stringify({ date: today, processed: results.length, results }));
  } catch (err) {
    console.error('Flight tracking error:', err);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Internal error' }));
  }
};
