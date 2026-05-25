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

    const smsTxt = [
      'New EV Exec booking:',
      route,
      `${date} at ${booking.travel_time || 'TBC'}`,
      `${booking.passengers} passenger(s)${booking.luggage ? `, ${booking.luggage}` : ''}`,
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
<div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto">
  <div style="background:#d5a538;padding:20px 28px;border-radius:12px 12px 0 0">
    <h1 style="margin:0;color:#06101c;font-size:1.2rem">New Booking Request — EV Exec</h1>
  </div>
  <div style="background:#020813;color:#fff;padding:28px;border-radius:0 0 12px 12px">
    <h2 style="margin:0 0 4px;color:#fff">${route}</h2>
    <p style="margin:0 0 ${price ? '8px' : '16px'};color:rgba(255,255,255,.65)">${date} at ${booking.travel_time || 'TBC'} &nbsp;·&nbsp; ${booking.passengers} passenger(s)${booking.luggage ? ` &nbsp;·&nbsp; ${booking.luggage}` : ''}</p>
    ${price ? `<p style="margin:0 0 20px;font-size:1.4rem;font-weight:900;color:#d5a538">£${price}</p>` : ''}
    <table style="border-collapse:collapse;margin-bottom:24px">
      <tr><td style="padding:5px 16px 5px 0;color:rgba(255,255,255,.5);font-size:13px;white-space:nowrap">Customer</td><td style="padding:5px 0">${name}</td></tr>
      <tr><td style="padding:5px 16px 5px 0;color:rgba(255,255,255,.5);font-size:13px">Phone</td><td style="padding:5px 0"><a href="tel:${phone}" style="color:#d5a538">${phone}</a></td></tr>
      ${booking.customer_email ? `<tr><td style="padding:5px 16px 5px 0;color:rgba(255,255,255,.5);font-size:13px">Email</td><td style="padding:5px 0"><a href="mailto:${booking.customer_email}" style="color:#d5a538">${booking.customer_email}</a></td></tr>` : ''}
      <tr><td style="padding:5px 16px 5px 0;color:rgba(255,255,255,.5);font-size:13px">Contact pref</td><td style="padding:5px 0">${booking.contact_method}</td></tr>
      ${booking.return_journey ? `<tr><td style="padding:5px 16px 5px 0;color:rgba(255,255,255,.5);font-size:13px">Return</td><td style="padding:5px 0">${fmtDate(booking.return_date)} at ${booking.return_time || 'TBC'}</td></tr>` : ''}
    </table>
    <table style="border-collapse:collapse;width:100%"><tr>
      <td style="padding-right:8px"><a href="${acceptUrl}" style="display:block;text-align:center;background:#22c55e;color:#fff;padding:14px;border-radius:8px;text-decoration:none;font-weight:bold">Accept Booking</a></td>
      <td style="padding-left:8px"><a href="${rejectUrl}" style="display:block;text-align:center;background:#ef4444;color:#fff;padding:14px;border-radius:8px;text-decoration:none;font-weight:bold">Reject Booking</a></td>
    </tr></table>
    <p style="margin-top:20px;font-size:11px;color:rgba(255,255,255,.25)">Booking ID: ${id}</p>
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
