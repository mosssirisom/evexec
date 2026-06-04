'use strict';

const { dbGet, isValidUUID } = require('../../lib/supabase');

const SAFE_FIELDS = new Set([
  'id', 'ref', 'status', 'journey_type', 'pickup_location', 'airport', 'flight_number',
  'dropoff_address', 'travel_date', 'travel_time', 'passengers', 'luggage',
  'return_journey', 'return_airport', 'return_date', 'return_time',
  'quoted_price', 'payment_method', 'payment_status', 'customer_name'
]);

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  const id = req.query?.id;

  if (!id || !isValidUUID(id)) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'Invalid booking ID' }));
  }

  try {
    const booking = await dbGet('bookings', id);
    if (!booking) {
      res.statusCode = 404;
      return res.end(JSON.stringify({ error: 'Booking not found' }));
    }

    const safe = {};
    for (const key of SAFE_FIELDS) {
      if (key in booking) safe[key] = booking[key];
    }

    res.statusCode = 200;
    res.end(JSON.stringify(safe));
  } catch (err) {
    console.error('Booking get error:', err);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Failed to load booking' }));
  }
};
