'use strict';

const { dbInsert } = require('../lib/supabase');
const { sendSMS, sendEmail } = require('../lib/notify');
const { generateToken } = require('../lib/token');
const { journeyLine, fmtDate, lookupPrice, getPrice } = require('../lib/format');
const { parseBody } = require('../lib/parse');
const { verifyAuth } = require('../lib/auth');

const EV_EXEC_SUPABASE_URL = 'https://yoltkmhtxwluqxxpewbl.supabase.co';
const EV_EXEC_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvbHRrbWh0eHdsdXF4eHBld2JsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0ODMwNjgsImV4cCI6MjA5NTA1OTA2OH0.kLwJK13TsSNn4oK3NZj33awGigWfdKgPP-cbqpqrIbo';

function json(res, status, payload) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.statusCode = status;
  res.end(JSON.stringify(payload));
}

function publicConfig(req, res) {
  return json(res, 200, {
    supabaseUrl: EV_EXEC_SUPABASE_URL,
    supabaseAnon: EV_EXEC_SUPABASE_ANON_KEY,
    vapidPublic: process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '',
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''
  });
}

async function bookingSubmit(req, res) {
  let body;
  try { body = await parseBody(req); } catch {
    return json(res, 400, { error: 'Invalid request body' });
  }

  const name = (body.customer_name || '').trim();
  const phone = (body.customer_phone || '').trim();
  if (!name || !phone) return json(res, 400, { error: 'Name and phone number are required.' });

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
      status: 'Unassigned',
      quoted_price: lookupPrice(airport, Boolean(body.return_journey)),
      ref: 'EVX-' + (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).toUpperCase()
    });

    const id = booking.id;
    const siteUrl = process.env.SITE_URL || 'https://evexec.co.uk';
    const acceptUrl = `${siteUrl}/api/operator/accept?id=${id}&token=${generateToken(id, 'accept')}`;
    const rejectUrl = `${siteUrl}/api/operator/reject?id=${id}&token=${generateToken(id, 'reject')}`;
    const route = journeyLine(booking);
    const date = fmtDate(booking.travel_date);
    const price = getPrice(booking);
    const returnLine = booking.return_journey ? `Return: ${fmtDate(booking.return_date)} at ${booking.return_time || 'TBC'}` + (booking.return_flight ? ` (flight ${booking.return_flight})` : '') : null;

    const smsTxt = [
      'New EV Exec booking:', route, `${date} at ${booking.travel_time || 'TBC'}`,
      `${booking.passengers} passenger(s)${booking.luggage ? `, ${booking.luggage}` : ''}`,
      returnLine, '', `Customer: ${name}`, `Phone: ${phone}`,
      booking.customer_email ? `Email: ${booking.customer_email}` : '', '',
      `Accept: ${acceptUrl}`, '', `Reject: ${rejectUrl}`
    ].filter(l => l !== null).join('\n');

    const emailHtml = `<div style="font-family:Arial,sans-serif;background:#07111f;color:#fff;padding:24px;border-radius:16px"><h1 style="color:#d5a538">New EV Exec Booking Request</h1><p><strong>Journey:</strong> ${route}</p><p><strong>Date:</strong> ${date} at ${booking.travel_time || 'TBC'}</p><p><strong>Customer:</strong> ${name}</p><p><strong>Phone:</strong> ${phone}</p>${booking.customer_email ? `<p><strong>Email:</strong> ${booking.customer_email}</p>` : ''}${price ? `<p><strong>Price:</strong> £${price}</p>` : ''}<p><a href="${acceptUrl}">Accept Booking</a> · <a href="${rejectUrl}">Reject Booking</a></p></div>`;

    await Promise.allSettled([
      process.env.OPERATOR_PHONE ? sendSMS(process.env.OPERATOR_PHONE, smsTxt) : null,
      process.env.OPERATOR_EMAIL ? sendEmail({ to: process.env.OPERATOR_EMAIL, subject: `New Booking: ${route} — ${date}`, html: emailHtml }) : null
    ].filter(Boolean));

    return json(res, 200, { success: true, bookingId: id });
  } catch (err) {
    console.error('Booking submit error:', err);
    return json(res, 500, { error: 'Failed to save booking. Please contact us directly.' });
  }
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') return publicConfig(req, res);
  if (req.method === 'POST') return bookingSubmit(req, res);
  return json(res, 405, { error: 'Method not allowed' });
};
