'use strict';

const { dbInsert, isValidUUID } = require('../../lib/supabase');
const { sendSMS, sendEmail } = require('../../lib/notify');
const { generateToken } = require('../../lib/token');
const { journeyLine, fmtDate, lookupPrice, getPrice } = require('../../lib/format');
const { parseBody } = require('../../lib/parse');

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  let body;
  try { body = await parseBody(req); } catch {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'Invalid request body' }));
  }

  const name  = (body.customer_name  || '').trim();
  const phone = (body.customer_phone || '').trim();
  if (!name || !phone) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'Name and phone number are required.' }));
  }

  try {
    const airport = body.airport || null;

    const booking = await dbInsert('bookings', {
      journey_type:      body.journey_type     || 'To Airport',
      pickup_location:   body.pickup_location  || null,
      airport,
      flight_number:     body.flight_number    || null,
      dropoff_address:   body.dropoff_address  || null,
      travel_date:       body.travel_date      || null,
      travel_time:       body.travel_time      || null,
      passengers:        parseInt(body.passengers) || 1,
      luggage:           body.luggage          || null,
      return_journey:    Boolean(body.return_journey),
      return_pickup:     body.return_pickup    || null,
      return_airport:    body.return_airport   || null,
      return_flight:     body.return_flight    || null,
      return_date:       body.return_date      || null,
      return_time:       body.return_time      || null,
      return_destination: body.return_destination || null,
      contact_method:    body.contact_method   || 'WhatsApp',
      customer_name:     name,
      customer_phone:    phone,
      customer_email:    body.customer_email ? body.customer_email.trim() : null,
      status:            'pending',
      quoted_price:      lookupPrice(airport)
    });

    const id        = booking.id;
    const siteUrl   = process.env.SITE_URL || 'https://evexec.co.uk';
    const acceptUrl = `${siteUrl}/api/operator/accept?id=${id}&token=${generateToken(id, 'accept')}`;
    const rejectUrl = `${siteUrl}/api/operator/reject?id=${id}&token=${generateToken(id, 'reject')}`;

    const route = journeyLine(booking);
    const date  = fmtDate(booking.travel_date);
    const price = getPrice(booking);

    const returnLine = booking.return_journey
      ? `Return: ${fmtDate(booking.return_date)} at ${booking.return_time || 'TBC'}` + (booking.return_flight ? ` (flight ${booking.return_flight})` : '')
      : null;

    const smsTxt = [
      'New EV Exec booking:',
      route,
      `${date} at ${booking.travel_time || 'TBC'}`,
      `${booking.passengers} passenger(s)${booking.luggage ? `, ${booking.luggage}` : ''}`,
      returnLine,
      '',
      `Customer: ${name}`,
      `Phone: ${phone}`,
      booking.customer_email ? `Email: ${booking.customer_email}` : '',
      '',
      `Accept: ${acceptUrl}`,
      '',
      `Reject: ${rejectUrl}`
    ].filter(l => l !== null).join('\n');

    const emailHtml = `
<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:580px;margin:0 auto;background:#07111f;border-radius:16px;overflow:hidden;border:1px solid rgba(213,165,56,.25)">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#b8891f 0%,#e8b84b 45%,#c49328 100%);padding:22px 30px">
    <p style="margin:0 0 3px;font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:rgba(6,16,28,.55);font-weight:700">EV Exec &nbsp;·&nbsp; New Request</p>
    <h1 style="margin:0;color:#06101c;font-size:1.25rem;font-weight:800;letter-spacing:-.2px">Booking Request</h1>
  </div>

  <!-- Journey card -->
  <div style="padding:24px 30px 0">
    <div style="background:rgba(213,165,56,.07);border:1px solid rgba(213,165,56,.18);border-radius:12px;padding:18px 20px;margin-bottom:22px">
      <p style="margin:0 0 8px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.3);font-weight:700">Journey</p>
      <h2 style="margin:0 0 7px;color:#fff;font-size:1.2rem;font-weight:800;line-height:1.35">${route}</h2>
      <p style="margin:0${price ? ' 0 10px' : ''};color:rgba(255,255,255,.55);font-size:13.5px">${date} &nbsp;·&nbsp; ${booking.travel_time || 'TBC'} &nbsp;·&nbsp; ${booking.passengers} pax${booking.luggage ? ` &nbsp;·&nbsp; ${booking.luggage}` : ''}</p>
      ${price ? `<p style="margin:0;font-size:1.75rem;font-weight:900;color:#d5a538;letter-spacing:-1px">£${price}</p>` : ''}
    </div>

    <!-- Customer details -->
    <p style="margin:0 0 10px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.3);font-weight:700">Customer</p>
    <table style="border-collapse:collapse;width:100%;margin-bottom:24px">
      <tr style="border-bottom:1px solid rgba(255,255,255,.06)">
        <td style="padding:9px 0;color:rgba(255,255,255,.4);font-size:12.5px;width:100px;vertical-align:top">Name</td>
        <td style="padding:9px 0;color:#fff;font-size:14px;font-weight:600">${name}</td>
      </tr>
      <tr style="border-bottom:1px solid rgba(255,255,255,.06)">
        <td style="padding:9px 0;color:rgba(255,255,255,.4);font-size:12.5px">Phone</td>
        <td style="padding:9px 0"><a href="tel:${phone}" style="color:#d5a538;font-size:14px;font-weight:600;text-decoration:none">${phone}</a></td>
      </tr>
      ${booking.customer_email ? `<tr style="border-bottom:1px solid rgba(255,255,255,.06)"><td style="padding:9px 0;color:rgba(255,255,255,.4);font-size:12.5px">Email</td><td style="padding:9px 0"><a href="mailto:${booking.customer_email}" style="color:#d5a538;font-size:14px;text-decoration:none">${booking.customer_email}</a></td></tr>` : ''}
      <tr style="border-bottom:1px solid rgba(255,255,255,.06)">
        <td style="padding:9px 0;color:rgba(255,255,255,.4);font-size:12.5px">Contact via</td>
        <td style="padding:9px 0;color:#fff;font-size:14px">${booking.contact_method}</td>
      </tr>
      ${booking.return_journey ? `<tr><td style="padding:9px 0;color:rgba(255,255,255,.4);font-size:12.5px;vertical-align:top">Return</td><td style="padding:9px 0;color:#fff;font-size:14px">${fmtDate(booking.return_date)} at ${booking.return_time || 'TBC'}${booking.return_airport ? ` &nbsp;·&nbsp; ${booking.return_airport}` : ''}${booking.return_flight ? ` &nbsp;·&nbsp; flight ${booking.return_flight}` : ''}${booking.return_destination ? `<br><span style="color:rgba(255,255,255,.4);font-size:12px">Drop-off: ${booking.return_destination}</span>` : ''}</td></tr>` : ''}
    </table>

    <!-- Action buttons -->
    <table style="border-collapse:collapse;width:100%;margin-bottom:28px"><tr>
      <td style="padding-right:6px"><a href="${acceptUrl}" style="display:block;text-align:center;background:linear-gradient(135deg,#15803d,#22c55e);color:#fff;padding:15px 10px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14.5px">Accept Booking</a></td>
      <td style="padding-left:6px"><a href="${rejectUrl}" style="display:block;text-align:center;background:linear-gradient(135deg,#991b1b,#ef4444);color:#fff;padding:15px 10px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14.5px">Reject Booking</a></td>
    </tr></table>
  </div>

  <!-- Footer -->
  <div style="padding:14px 30px 18px;border-top:1px solid rgba(255,255,255,.05)">
    <p style="margin:0;font-size:11px;color:rgba(255,255,255,.18)">Booking ID: ${id}</p>
  </div>
</div>`;

    await Promise.allSettled([
      process.env.OPERATOR_PHONE
        ? sendSMS(process.env.OPERATOR_PHONE, smsTxt)
        : null,
      process.env.OPERATOR_EMAIL
        ? sendEmail({ to: process.env.OPERATOR_EMAIL, subject: `New Booking: ${route} — ${date}`, html: emailHtml })
        : null
    ].filter(Boolean));

    res.statusCode = 200;
    res.end(JSON.stringify({ success: true, bookingId: id }));
  } catch (err) {
    console.error('Booking create error:', err);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Failed to save booking. Please contact us directly.' }));
  }
};
