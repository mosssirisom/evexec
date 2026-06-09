'use strict';

const { verifyAuth } = require('../../lib/auth');
const { parseBody } = require('../../lib/parse');

const SUPABASE_URL = () => process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://yoltkmhtxwluqxxpewbl.supabase.co';
const SERVICE_KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

const AIRPORT_PRICES = {
  'Manchester Airport': { oneWay: 90, ret: 160 },
  'Liverpool Airport': { oneWay: 95, ret: 170 },
  'Leeds Bradford Airport': { oneWay: 135, ret: 250 },
  'Birmingham Airport': { oneWay: 215, ret: 410 },
  'Newcastle Airport': { oneWay: 250, ret: 480 }
};

function headers(extra = {}) {
  const key = SERVICE_KEY();
  return { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`, ...extra };
}
function clean(v) { return typeof v === 'string' ? v.trim() : v; }
function validUuid(id) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || '')); }
function makeRef() { return 'EV-' + Math.random().toString(36).slice(2, 6).toUpperCase() + '-' + Date.now().toString().slice(-4); }
function quotedPrice(airport, isReturn) {
  const price = AIRPORT_PRICES[airport];
  if (!price) return null;
  return isReturn ? price.ret : price.oneWay;
}

async function dbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL()}/rest/v1/${path}`, { ...opts, headers: headers(opts.headers || {}) });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(typeof data === 'string' ? data : (data && data.message) || 'Database request failed');
  return data;
}

async function handleCreate(req, res) {
  if (req.method !== 'POST') { res.statusCode = 405; return res.end(JSON.stringify({ error: 'Method not allowed' })); }
  const body = await parseBody(req);
  const name = clean(body.customer_name);
  const phone = clean(body.customer_phone || body.phone);
  const airport = clean(body.airport);
  const journeyType = clean(body.journey_type) || 'To Airport';
  const travelDate = clean(body.travel_date);
  const travelTime = clean(body.travel_time);

  if (!name || !phone) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'Name and phone number are required.' })); }
  if (!airport) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'Please select an airport.' })); }
  if (!travelDate || !travelTime) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'Travel date and time are required.' })); }

  const isFromAirport = journeyType === 'From Airport';
  const address = clean(isFromAirport ? body.dropoff_address : body.pickup_location);
  if (!address) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'Please enter the journey address.' })); }

  const user = await verifyAuth(req).catch(() => null);
  const isReturn = Boolean(body.return_journey);
  const payload = {
    ref: makeRef(),
    user_id: user ? user.id : null,
    journey_type: journeyType,
    pickup_location: isFromAirport ? null : address,
    dropoff_address: isFromAirport ? address : null,
    airport,
    flight_number: clean(body.flight_number) || null,
    travel_date: travelDate,
    travel_time: travelTime,
    passengers: Number(body.passengers || 1),
    luggage: clean(body.luggage) || null,
    return_journey: isReturn,
    return_pickup: clean(body.return_pickup) || null,
    return_airport: clean(body.return_airport) || null,
    return_flight: clean(body.return_flight) || null,
    return_date: clean(body.return_date) || null,
    return_time: clean(body.return_time) || null,
    return_destination: clean(body.return_destination) || null,
    contact_method: clean(body.contact_method) || 'WhatsApp',
    customer_name: name,
    customer_phone: phone,
    customer_email: clean(body.customer_email) || (user ? user.email : null) || null,
    quoted_price: quotedPrice(airport, isReturn),
    status: 'Unassigned',
    payment_status: 'pending',
    payment_method: null,
    created_at: new Date().toISOString()
  };

  try {
    const rows = await dbFetch('bookings', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) });
    const booking = Array.isArray(rows) ? rows[0] : rows;
    res.statusCode = 200;
    return res.end(JSON.stringify({ success: true, bookingId: booking.id, booking }));
  } catch (err) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: err.message || 'Failed to create booking.' }));
  }
}

async function handleGet(req, res) {
  if (req.method !== 'GET') { res.statusCode = 405; return res.end(JSON.stringify({ error: 'Method not allowed' })); }
  const url = new URL(req.url, 'https://evexec.co.uk');
  const id = url.searchParams.get('id');
  if (!validUuid(id)) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'Invalid booking link.' })); }
  try {
    const rows = await dbFetch(`bookings?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
    if (!Array.isArray(rows) || !rows[0]) { res.statusCode = 404; return res.end(JSON.stringify({ error: 'Booking not found.' })); }
    res.statusCode = 200;
    return res.end(JSON.stringify(rows[0]));
  } catch (err) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: err.message || 'Failed to load booking.' }));
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const path = (req.url || '').split('?')[0];
  if (path.endsWith('/create')) return handleCreate(req, res);
  if (path.endsWith('/get')) return handleGet(req, res);
  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Not found' }));
};
