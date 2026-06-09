'use strict';

const crypto = require('crypto');
const { parseBody, getRawBody } = require('../../lib/parse');

const SUPABASE_URL = () => process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://yoltkmhtxwluqxxpewbl.supabase.co';
const SERVICE_KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const STRIPE_SECRET = () => process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = () => process.env.STRIPE_WEBHOOK_SECRET || '';
const SITE_URL = () => (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://evexec.co.uk').replace(/\/$/, '');

function headers(extra = {}) {
  const key = SERVICE_KEY();
  return { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`, ...extra };
}
function validUuid(id) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || '')); }
function readyForPayment(b) {
  const status = String(b.status || '').toLowerCase();
  const paymentStatus = String(b.payment_status || '').toLowerCase();
  return ['dispatched', 'accepted', 'confirmed'].includes(status) && !['paid', 'cash_on_day'].includes(paymentStatus);
}
async function dbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL()}/rest/v1/${path}`, { ...opts, headers: headers(opts.headers || {}) });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(typeof data === 'string' ? data : (data && data.message) || 'Database request failed');
  return data;
}
async function getBooking(id) {
  const rows = await dbFetch(`bookings?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  return Array.isArray(rows) ? rows[0] : null;
}
async function patchBooking(id, payload) {
  const rows = await dbFetch(`bookings?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ ...payload, updated_at: new Date().toISOString() })
  });
  return Array.isArray(rows) ? rows[0] : rows;
}
function json(res, code, payload) {
  res.statusCode = code;
  res.end(JSON.stringify(payload));
}

async function handleCreateCheckout(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const body = await parseBody(req);
  const bookingId = body.bookingId || body.booking_id;
  if (!validUuid(bookingId)) return json(res, 400, { error: 'Invalid booking ID.' });

  const booking = await getBooking(bookingId);
  if (!booking) return json(res, 404, { error: 'Booking not found.' });
  if (!readyForPayment(booking)) return json(res, 400, { error: 'Booking is not ready for payment' });

  const amount = Math.round(Number(booking.quoted_price || booking.price || 0) * 100);
  if (!amount || amount < 50) return json(res, 400, { error: 'Booking price is missing. Please contact EV Exec.' });
  if (!STRIPE_SECRET()) return json(res, 500, { error: 'Card payment is temporarily unavailable. Please choose cash or contact EV Exec.' });

  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('success_url', `${SITE_URL()}/booking?id=${encodeURIComponent(bookingId)}&payment=success`);
  params.set('cancel_url', `${SITE_URL()}/booking?id=${encodeURIComponent(bookingId)}&payment=cancelled`);
  params.set('customer_email', booking.customer_email || '');
  params.set('metadata[booking_id]', bookingId);
  params.set('metadata[ref]', booking.ref || '');
  params.set('line_items[0][quantity]', '1');
  params.set('line_items[0][price_data][currency]', 'gbp');
  params.set('line_items[0][price_data][unit_amount]', String(amount));
  params.set('line_items[0][price_data][product_data][name]', `EV Exec Transfer ${booking.ref || ''}`.trim());
  params.set('line_items[0][price_data][product_data][description]', `${booking.airport || 'Airport transfer'} · ${booking.travel_date || ''} ${booking.travel_time || ''}`.trim());

  const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${STRIPE_SECRET()}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  const data = await stripeRes.json().catch(() => ({}));
  if (!stripeRes.ok) return json(res, 500, { error: data.error?.message || 'Payment setup failed.' });

  await patchBooking(bookingId, { payment_status: 'payment_link_created', stripe_checkout_session_id: data.id || null }).catch(() => null);
  return json(res, 200, { url: data.url, sessionId: data.id });
}

async function handleConfirmCash(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const body = await parseBody(req);
  const bookingId = body.bookingId || body.booking_id;
  if (!validUuid(bookingId)) return json(res, 400, { error: 'Invalid booking ID.' });

  const booking = await getBooking(bookingId);
  if (!booking) return json(res, 404, { error: 'Booking not found.' });
  if (!readyForPayment(booking) && String(booking.payment_status || '').toLowerCase() !== 'payment_link_created') {
    return json(res, 400, { error: 'Booking is not ready for payment' });
  }

  const updated = await patchBooking(bookingId, { payment_status: 'cash_on_day', payment_method: 'cash', status: booking.status || 'Dispatched' });
  return json(res, 200, { success: true, booking: updated });
}

function verifyStripeSignature(raw, sigHeader, secret) {
  if (!secret || !sigHeader) return false;
  const parts = Object.fromEntries(String(sigHeader).split(',').map(p => p.split('=')));
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

async function handleWebhook(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  let raw;
  try { raw = await getRawBody(req); } catch (err) { return json(res, 400, { error: err.message }); }
  const sig = req.headers['stripe-signature'];
  if (STRIPE_WEBHOOK_SECRET() && !verifyStripeSignature(raw.toString('utf8'), sig, STRIPE_WEBHOOK_SECRET())) {
    return json(res, 400, { error: 'Invalid Stripe signature' });
  }

  let event;
  try { event = JSON.parse(raw.toString('utf8')); } catch { return json(res, 400, { error: 'Invalid JSON' }); }
  if (event.type === 'checkout.session.completed') {
    const session = event.data && event.data.object;
    const bookingId = session && session.metadata && session.metadata.booking_id;
    if (validUuid(bookingId)) {
      await patchBooking(bookingId, {
        payment_status: 'paid',
        payment_method: 'card',
        stripe_checkout_session_id: session.id || null,
        stripe_payment_intent_id: session.payment_intent || null
      }).catch(() => null);
    }
  }
  return json(res, 200, { received: true });
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const path = (req.url || '').split('?')[0];
  try {
    if (path.endsWith('/create-checkout-session')) return handleCreateCheckout(req, res);
    if (path.endsWith('/confirm-cash')) return handleConfirmCash(req, res);
    if (path.endsWith('/stripe-webhook')) return handleWebhook(req, res);
    return json(res, 404, { error: 'Not found' });
  } catch (err) {
    return json(res, 500, { error: err.message || 'Server error' });
  }
};
