'use strict';

const { dbInsert } = require('../../lib/supabase');
const { sendSMS, sendEmail, normaliseUkPhone } = require('../../lib/notify');
const { logMany } = require('../../lib/notifyLog');
const { generateToken } = require('../../lib/token');
const { journeyLine, fmtDate, lookupPrice, getPrice } = require('../../lib/format');
const { parseBody } = require('../../lib/parse');
const { verifyAuth } = require('../../lib/auth');

async function awardPrivilegePoint(userId) {
  const base = process.env.SUPABASE_URL;
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !sk || !userId) return;
  const h = { 'Content-Type': 'application/json', apikey: sk, Authorization: `Bearer ${sk}` };
  const cur = await fetch(`${base}/rest/v1/profiles?id=eq.${userId}&select=privilege_points&limit=1`, { headers: h });
  if (!cur.ok) return;
  const rows = await cur.json();
  const pts = rows[0] ? (rows[0].privilege_points || 0) + 1 : 1;
  await fetch(`${base}/rest/v1/profiles?id=eq.${userId}`, {
    method: 'PATCH',
    headers: { ...h, Prefer: 'return=minimal' },
    body: JSON.stringify({ privilege_points: pts, updated_at: new Date().toISOString() })
  });
}

function compactResult(label, result) {
  if (result.status === 'fulfilled') return { label, ok: true };
  return { label, ok: false, error: result.reason && result.reason.message ? result.reason.message : String(result.reason || 'Unknown error') };
}

async function sendReceivedNotifications(booking) {
  const siteUrl = process.env.SITE_URL || 'https://evexec.co.uk';
  const route = journeyLine(booking);
  const date = fmtDate(booking.travel_date);
  const price = getPrice(booking);
  const firstName = (booking.customer_name || 'there').split(' ')[0];
  const acceptUrl = `${siteUrl}/api/operator/accept?id=${booking.id}&token=${generateToken(booking.id, 'accept')}`;
  const rejectUrl = `${siteUrl}/api/operator/reject?id=${booking.id}&token=${generateToken(booking.id, 'reject')}`;

  const operatorText = [
    'New EV Exec booking:',
    route,
    `${date} at ${booking.travel_time || 'TBC'}`,
    price ? `Price: £${price}` : '',
    `Customer: ${booking.customer_name}`,
    `Phone: ${booking.customer_phone}`,
    booking.customer_email ? `Email: ${booking.customer_email}` : '',
    `Accept: ${acceptUrl}`,
    `Reject: ${rejectUrl}`
  ].filter(Boolean).join('\n');

  const customerText = `Hi ${firstName}, your EV Exec booking request has been received!\n\n${route}\n${date} at ${booking.travel_time || 'TBC'}\n\nWe'll confirm availability shortly. Questions: 07721 070370`;

  const operatorHtml = `<div><h1>New EV Exec Booking</h1><p>${route}</p><p>${date} at ${booking.travel_time || 'TBC'}</p><p>${booking.customer_name} - ${booking.customer_phone}</p><p><a href="${acceptUrl}">Accept</a> | <a href="${rejectUrl}">Reject</a></p></div>`;
  const customerHtml = `<div><h1>EV Exec Booking Received</h1><p>Hi ${firstName}, your request has been received.</p><p>${route}</p><p>${date} at ${booking.travel_time || 'TBC'}</p><p>Reference: ${booking.ref}</p></div>`;

  const tasks = [
    process.env.OPERATOR_PHONE ? sendSMS(process.env.OPERATOR_PHONE, operatorText) : Promise.resolve('operator sms not configured'),
    process.env.OPERATOR_EMAIL ? sendEmail({ to: process.env.OPERATOR_EMAIL, subject: `New Booking: ${route} — ${date}`, html: operatorHtml }) : Promise.resolve('operator email not configured'),
    booking.customer_phone ? sendSMS(booking.customer_phone, customerText) : Promise.resolve('customer sms missing'),
    booking.customer_email ? sendEmail({ to: booking.customer_email, subject: 'Booking Request Received — EV Exec', html: customerHtml }) : Promise.resolve('customer email missing')
  ];

  const settled = await Promise.allSettled(tasks);
  const statuses = [
    compactResult('operator_sms', settled[0]),
    compactResult('operator_email', settled[1]),
    compactResult('customer_sms', settled[2]),
    compactResult('customer_email', settled[3])
  ];

  const sent = [];
  if (statuses[0].ok && process.env.OPERATOR_PHONE) sent.push(['sms', normaliseUkPhone(process.env.OPERATOR_PHONE)]);
  if (statuses[1].ok && process.env.OPERATOR_EMAIL) sent.push(['email', process.env.OPERATOR_EMAIL]);
  if (statuses[2].ok && booking.customer_phone) sent.push(['sms', normaliseUkPhone(booking.customer_phone)]);
  if (statuses[3].ok && booking.customer_email) sent.push(['email', booking.customer_email]);
  if (sent.length) await logMany(booking.id, 'received', sent);

  statuses.filter(s => !s.ok).forEach(s => console.error('Booking notification failed:', s.label, s.error));
  return statuses;
}

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

  const name = (body.customer_name || '').trim();
  const phone = normaliseUkPhone(body.customer_phone || '');
  if (!name || !phone) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'Name and phone number are required.' }));
  }

  try {
    const authUser = await verifyAuth(req).catch(() => null);
    const airport = body.airport || null;

    const booking = await dbInsert('bookings', {
      journey_type: body.journey_type || 'To Airport',
      pickup_location: body.pickup_location || null,
      airport,
      flight_number: body.flight_number || null,
      dropoff_address: body.dropoff_address || null,
      travel_date: body.travel_date || null,
      travel_time: body.travel_time || null,
      passengers: parseInt(body.passengers) || 1,
      luggage: body.luggage || null,
      return_journey: Boolean(body.return_journey),
      return_pickup: body.return_pickup || null,
      return_airport: body.return_airport || null,
      return_flight: body.return_flight || null,
      return_date: body.return_date || null,
      return_time: body.return_time || null,
      return_destination: body.return_destination || null,
      contact_method: body.contact_method || 'WhatsApp',
      customer_name: name,
      customer_phone: phone,
      customer_email: body.customer_email ? body.customer_email.trim() : null,
      user_id: authUser ? authUser.id : null,
      status: 'Unassigned',
      payment_status: 'Unpaid',
      quoted_price: lookupPrice(airport, Boolean(body.return_journey)),
      ref: 'EVX-' + (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).toUpperCase()
    });

    const notifications = await sendReceivedNotifications(booking).catch(err => {
      console.error('Booking notification batch error:', err);
      return [{ label: 'notification_batch', ok: false, error: err.message || String(err) }];
    });

    if (authUser) awardPrivilegePoint(authUser.id).catch(err => console.error('Privilege point error:', err));

    res.statusCode = 200;
    return res.end(JSON.stringify({ success: true, bookingId: booking.id, notifications }));
  } catch (err) {
    console.error('Booking create error:', err);
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: 'Failed to save booking. Please contact us directly.' }));
  }
};
