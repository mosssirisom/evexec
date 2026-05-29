'use strict';

const { dbGet, dbUpdate, isValidUUID } = require('../../lib/supabase');
const { sendEmail } = require('../../lib/notify');
const { verifyToken } = require('../../lib/token');
const { journeyLine, fmtDate, getPrice } = require('../../lib/format');
const { operatorPage, esc } = require('../../lib/pages');

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
    const firstName  = (booking.customer_name || 'there').split(' ')[0];

    const emailHtml = `
<div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto">
  <div style="background:#d5a538;padding:20px 28px;border-radius:12px 12px 0 0">
    <h1 style="margin:0;color:#06101c;font-size:1.2rem">Your EV Exec Transfer is Accepted</h1>
  </div>
  <div style="background:#020813;color:#fff;padding:28px;border-radius:0 0 12px 12px">
    <p style="margin:0 0 6px">Hi ${firstName},</p>
    <p style="margin:0 0 20px;color:rgba(255,255,255,.65)">Your airport transfer has been accepted. Please choose your payment method.</p>
    <h2 style="margin:0 0 4px;color:#fff">${route}</h2>
    <p style="margin:0 0 ${price ? '8px' : '20px'};color:rgba(255,255,255,.65)">${date} at ${booking.travel_time || 'TBC'} &nbsp;·&nbsp; ${booking.passengers} passenger(s)</p>
    ${price ? `<p style="margin:0 0 20px;font-size:1.4rem;font-weight:900;color:#d5a538">£${price}</p>` : ''}
    <a href="${paymentUrl}" style="display:block;text-align:center;background:#d5a538;color:#06101c;padding:16px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:1rem">Choose Payment Method</a>
    <p style="margin-top:20px;color:rgba(255,255,255,.5);font-size:13px">
      <a href="tel:+447721070370" style="color:#d5a538;text-decoration:none">📞 Call: 07721 070370</a>
      &nbsp;&nbsp;|&nbsp;&nbsp;
      <a href="https://wa.me/447721070370" style="color:#25d366;text-decoration:none">💬 WhatsApp us</a>
    </p>
  </div>
</div>`;

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
