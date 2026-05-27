'use strict';

const { dbGet, dbUpdate, isValidUUID } = require('../../lib/supabase');
const { sendRejectionNotice } = require('../../lib/notify');
const { verifyToken } = require('../../lib/token');
const { journeyLine, fmtDate } = require('../../lib/format');
const { operatorPage, esc } = require('../../lib/pages');

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  const { id, token } = req.query || {};

  if (!id || !token) {
    res.statusCode = 400;
    return res.end(operatorPage('Invalid Link', '<p>This reject link is missing required parameters.</p>', false));
  }
  if (!isValidUUID(id)) {
    res.statusCode = 400;
    return res.end(operatorPage('Invalid Link', '<p>This link contains an invalid booking ID.</p>', false));
  }
  if (!verifyToken(id, 'reject', token)) {
    res.statusCode = 403;
    return res.end(operatorPage('Invalid Token', '<p>This link is invalid or has expired.</p>', false));
  }

  try {
    const booking = await dbGet('bookings', id);

    if (!booking) {
      res.statusCode = 404;
      return res.end(operatorPage('Not Found', '<p>No booking found with this ID.</p>', false));
    }
    if (booking.status !== 'pending') {
      return res.end(operatorPage(
        'Already Actioned',
        `<p>This booking has already been <strong>${booking.status}</strong>.</p>`,
        false
      ));
    }

    await dbUpdate('bookings', id, { status: 'rejected' });

    const route = journeyLine(booking);
    const date  = fmtDate(booking.travel_date);

    await sendRejectionNotice(booking);

    res.end(operatorPage('Booking Rejected', `
      <p>Booking for <strong>${esc(booking.customer_name)}</strong> has been rejected.</p>
      <p>${esc(route)}<br>${esc(date)}</p>
      <p>The customer has been notified. No payment has been taken.</p>
    `, false));
  } catch (err) {
    console.error('Reject error:', err);
    res.statusCode = 500;
    res.end(operatorPage('Error', '<p>Something went wrong. Please try again or contact support.</p>', false));
  }
};
