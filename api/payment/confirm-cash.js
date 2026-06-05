'use strict';

const { dbGet, dbUpdate, isValidUUID } = require('../../lib/supabase');
const { sendConfirmations } = require('../../lib/notify');
const { parseBody } = require('../../lib/parse');

function isUnpaid(status) {
  return status === null || status === undefined || status === 'pending' || status === 'Unpaid';
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  const body      = await parseBody(req);
  const bookingId = body.bookingId;

  if (!bookingId || !isValidUUID(bookingId)) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'Invalid booking ID' }));
  }

  try {
    const booking = await dbGet('bookings', bookingId);
    if (!booking) {
      res.statusCode = 404;
      return res.end(JSON.stringify({ error: 'Booking not found' }));
    }
    const readyForPayment =
      booking.status === 'Dispatched' &&
      isUnpaid(booking.payment_status);
    if (!readyForPayment) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: 'Booking cannot be confirmed in its current state' }));
    }

    await dbUpdate('bookings', bookingId, {
      payment_method: 'cash',
      payment_status: 'Invoiced'
    });

    const confirmed = { ...booking, payment_method: 'cash', payment_status: 'Invoiced' };
    await sendConfirmations(confirmed);

    res.statusCode = 200;
    res.end(JSON.stringify({ success: true }));
  } catch (err) {
    console.error('Cash confirm error:', err);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Failed to confirm booking. Please try again.' }));
  }
};