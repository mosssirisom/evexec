'use strict';

const { dbGet, dbUpdate, isValidUUID } = require('../../lib/supabase');
const { sendEmail } = require('../../lib/notify');
const { verifyToken } = require('../../lib/token');
const { journeyLine, fmtDate, getPrice } = require('../../lib/format');
const { operatorPage, esc } = require('../../lib/pages');
const { buildAcceptEmail } = require('../../lib/email-templates');

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  const { id, token } = req.query || {};

  if (!id || !token) {
    res.statusCode = 400;
    return res.end(operatorPage('Invalid Link', '<p>This accept link is missing required parameters.</p>', false));
  }
  if (!isValidUUID(id)) {
    res.statusCode = 400;
    return res.end(operatorPage('Invalid Link', '<p>This link contains an invalid booking ID.</p>', false));
  }
  if (!verifyToken(id, 'accept', token)) {
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
        ['accepted', 'confirmed'].includes(booking.status)
      ));
    }

    await dbUpdate('bookings', id, { status: 'accepted' });

    const siteUrl    = process.env.SITE_URL || 'https://evexec.co.uk';
    const paymentUrl = `${siteUrl}/booking?id=${id}`;
    const route      = journeyLine(booking);
    const date       = fmtDate(booking.travel_date);
    const price      = getPrice(booking);

    const emailHtml  = buildAcceptEmail(booking, paymentUrl, price);

    if (booking.customer_email) {
      await sendEmail({
        to: booking.customer_email,
        subject: `EV Exec Transfer Accepted — ${route}`,
        html: emailHtml
      });
    }

    res.end(operatorPage('Booking Accepted ✓', `
      <p>Booking for <strong>${esc(booking.customer_name)}</strong> accepted.</p>
      <p>${esc(route)}<br>${esc(date)} at ${esc(booking.travel_time || 'TBC')}</p>
      ${price ? `<p class="price">£${price}</p>` : ''}
      <p>The customer has been notified and sent a payment link.</p>
    `));
  } catch (err) {
    console.error('Accept error:', err);
    res.statusCode = 500;
    res.end(operatorPage('Error', '<p>Something went wrong. Please try again or contact support.</p>', false));
  }
};
