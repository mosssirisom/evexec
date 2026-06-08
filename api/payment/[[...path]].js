'use strict';

module.exports.config = { api: { bodyParser: false } };

const crypto = require('crypto');
const { dbGet, dbUpdate, isValidUUID } = require('../../lib/supabase');
const { sendConfirmations } = require('../../lib/notify');
const { getPrice, journeyLine } = require('../../lib/format');
const { parseBody, getRawBody } = require('../../lib/parse');

function isUnpaid(status) {
  return status === null || status === undefined || status === 'pending' || status === 'Unpaid';
}

function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify(payload));
}

function routeName(req) {
  const path = (req.url || '').split('?')[0];
  if (path.endsWith('/create-checkout-session')) return 'create-checkout-session';
  if (path.endsWith('/confirm-cash')) return 'confirm-cash';
  if (path.endsWith('/stripe-webhook')) return 'stripe-webhook';
  return 'index';
}

async function createStripeSession({ price, description, bookingId, customerEmail, successUrl, cancelUrl }) {
  const params = new URLSearchParams();
  params.set('payment_method_types[]', 'card');
  params.set('line_items[0][price_data][currency]', 'gbp');
  params.set('line_items[0][price_data][product_data][name]', 'EV Exec Airport Transfer');
  params.set('line_items[0][price_data][product_data][description]', description);
  params.set('line_items[0][price_data][unit_amount]', String(Math.round(price * 100)));
  params.set('line_items[0][quantity]', '1');
  params.set('mode', 'payment');
  params.set('success_url', successUrl);
  params.set('cancel_url', cancelUrl);
  params.set('metadata[bookingId]', bookingId);
  if (customerEmail) params.set('customer_email', customerEmail);

  const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  if (!stripeRes.ok) {
    const err = await stripeRes.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Stripe error');
  }
  return stripeRes.json();
}

async function handleCreateCheckoutSession(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const body = await parseBody(req);
  const bookingId = body.bookingId;
  if (!bookingId || !isValidUUID(bookingId)) return json(res, 400, { error: 'Invalid booking ID' });

  const booking = await dbGet('bookings', bookingId);
  if (!booking) return json(res, 404, { error: 'Booking not found' });

  const readyForPayment = booking.status === 'Dispatched' && isUnpaid(booking.payment_status);
  if (!readyForPayment) return json(res, 400, { error: 'Booking is not ready for payment' });

  const price = getPrice(booking);
  if (!price) return json(res, 400, { error: 'Price not available yet. Please contact EV Exec.' });

  const siteUrl = process.env.SITE_URL || 'https://evexec.co.uk';
  const session = await createStripeSession({
    price,
    description: journeyLine(booking),
    bookingId,
    customerEmail: booking.customer_email,
    successUrl: `${siteUrl}/booking?id=${bookingId}&payment=success`,
    cancelUrl: `${siteUrl}/booking?id=${bookingId}&payment=cancelled`
  });

  await dbUpdate('bookings', bookingId, { stripe_session_id: session.id });
  return json(res, 200, { url: session.url });
}

async function handleConfirmCash(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const body = await parseBody(req);
  const bookingId = body.bookingId;
  if (!bookingId || !isValidUUID(bookingId)) return json(res, 400, { error: 'Invalid booking ID' });

  const booking = await dbGet('bookings', bookingId);
  if (!booking) return json(res, 404, { error: 'Booking not found' });

  const readyForPayment = booking.status === 'Dispatched' && isUnpaid(booking.payment_status);
  if (!readyForPayment) return json(res, 400, { error: 'Booking cannot be confirmed in its current state' });

  await dbUpdate('bookings', bookingId, { payment_method: 'cash', payment_status: 'Invoiced' });
  await sendConfirmations({ ...booking, payment_method: 'cash', payment_status: 'Invoiced' });
  return json(res, 200, { success: true });
}

function verifyStripeSignature(rawBody, sigHeader, secret) {
  const parts = {};
  sigHeader.split(',').forEach(part => {
    const idx = part.indexOf('=');
    if (idx > -1) parts[part.slice(0, idx)] = part.slice(idx + 1);
  });

  const timestamp = parts.t;
  const v1 = parts.v1;
  if (!timestamp || !v1) throw new Error('Malformed stripe-signature header');
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp, 10)) > 300) throw new Error('Timestamp too old — possible replay attack');

  const payload = `${timestamp}.${rawBody.toString('utf8')}`;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  const v1Buf = Buffer.from(v1, 'hex');
  if (expectedBuf.length !== v1Buf.length || !crypto.timingSafeEqual(expectedBuf, v1Buf)) throw new Error('Signature mismatch');
  return JSON.parse(rawBody.toString('utf8'));
}

async function handleStripeWebhook(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end('Method not allowed');
  }

  const sigHeader = req.headers['stripe-signature'];
  if (!sigHeader) {
    res.statusCode = 400;
    return res.end('Missing stripe-signature header');
  }

  let event;
  try {
    const rawBody = await getRawBody(req);
    event = verifyStripeSignature(rawBody, sigHeader, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature error:', err.message);
    res.statusCode = 400;
    return res.end(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const bookingId = session.metadata?.bookingId;

    if (bookingId && isValidUUID(bookingId)) {
      try {
        const booking = await dbGet('bookings', bookingId);
        const readyForPayment = booking && booking.status === 'Dispatched' && isUnpaid(booking.payment_status);

        if (readyForPayment) {
          await dbUpdate('bookings', bookingId, {
            payment_status: 'Paid',
            payment_method: 'card',
            stripe_session_id: session.id
          });
          await sendConfirmations({ ...booking, payment_method: 'card', payment_status: 'Paid' });
        }
      } catch (err) {
        console.error('Webhook processing error:', err);
      }
    }
  }

  return json(res, 200, { received: true });
}

module.exports = async function handler(req, res) {
  try {
    const route = routeName(req);
    if (route === 'create-checkout-session') return handleCreateCheckoutSession(req, res);
    if (route === 'confirm-cash') return handleConfirmCash(req, res);
    if (route === 'stripe-webhook') return handleStripeWebhook(req, res);
    return json(res, 200, { ok: true, service: 'payment' });
  } catch (err) {
    console.error('Payment router error:', err);
    return json(res, 500, { error: err.message || 'Payment request failed. Please try again.' });
  }
};
