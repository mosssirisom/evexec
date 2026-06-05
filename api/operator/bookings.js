'use strict';

const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yoltkmhtxwluqxxpewbl.supabase.co';

function dbHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    'Content-Type': 'application/json',
    'apikey': key,
    'Authorization': `Bearer ${key}`
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  const secret = req.headers['x-operator-secret'];
  const expected = process.env.OPERATOR_ACTION_SECRET;
  const valid = expected && secret && secret.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(expected));
  if (!valid) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: 'Unauthorised' }));
  }

  try {
    // Load bookings from last 30 days + all future bookings, with their notification logs
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const [bookingsRes, logsRes] = await Promise.all([
      fetch(
        `${SUPABASE_URL}/rest/v1/bookings?travel_date=gte.${cutoffStr}&select=id,ref,customer_name,customer_phone,customer_email,travel_date,travel_time,status,payment_method,payment_status,journey_type,pickup_location,airport,dropoff_address&order=travel_date.asc&limit=200`,
        { headers: dbHeaders() }
      ),
      fetch(
        `${SUPABASE_URL}/rest/v1/notification_log?select=booking_id,type,channel,recipient,sent_at&order=sent_at.desc&limit=2000`,
        { headers: dbHeaders() }
      )
    ]);

    if (!bookingsRes.ok) throw new Error('Failed to load bookings');

    const bookings = await bookingsRes.json();

    // Gracefully handle missing notification_log table
    let logs = [];
    if (logsRes.ok) {
      logs = await logsRes.json();
    }

    // Index logs by booking_id
    const logsByBooking = {};
    for (const log of logs) {
      if (!logsByBooking[log.booking_id]) logsByBooking[log.booking_id] = [];
      logsByBooking[log.booking_id].push(log);
    }

    const result = bookings.map(b => ({
      ...b,
      notifications: logsByBooking[b.id] || []
    }));

    res.statusCode = 200;
    res.end(JSON.stringify(result));
  } catch (err) {
    console.error('Operator bookings error:', err);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Failed to load bookings' }));
  }
};
