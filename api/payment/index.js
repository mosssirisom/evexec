'use strict';


const crypto = require('crypto');
const { dbGet, dbUpdate, dbUpdateWhere, isValidUUID } = require('../../lib/supabase');
const { sendConfirmations } = require('../../lib/notify');
const { getPrice, journeyLine } = require('../../lib/format');
const { parseBody, getRawBody } = require('../../lib/parse');

function isUnpaid(status) {
  return status !== 'Paid' && status !== 'Invoiced';
}

// Confirmed = the operator accepted it (in the Operator app, which records
// operator_response, or from the email link, which also sets Dispatched) and
// it hasn't been cancelled or completed.
function isConfirmed(b) {
  if (!b) return false;
  if (['Cancelled', 'Completed', 'No Show'].includes(b.status)) return false;
  if (b.operator_response === 'rejected') return false;
  return b.operator_response === 'accepted' || ['Dispatched', 'En Route', 'Arrived', 'Passenger On Board'].includes(b.status);
}
function readyForPayment(b) { return isConfirmed(b) && isUnpaid(b.payment_status); }

// Records a Stripe card payment once. The update only matches a booking that
// isn't already Paid, so a repeated webhook, or the webhook and the return
// check both arriving, can't double-record or re-send the notifications.
async function recordCardPayment(bookingId, session) {
  const rows = await dbUpdateWhere('bookings', bookingId, 'or=(payment_status.is.null,payment_status.neq.Paid)', {
    payment_status: 'Paid',
    payment_method: 'Card',
    stripe_session_id: session.id
  });
  const booking = rows && rows[0];
  if (!booking) return { recorded: false };
  const receiptUrl = session.payment_intent ? await getStripeReceiptUrl(session.payment_intent) : null;
  await sendConfirmations(booking, '', receiptUrl);
  return { recorded: true };
}

async function getStripeSession(sessionId) {
  const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` }
  });
  if (!res.ok) return null;
  return res.json();
}

function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.end(JSON.stringify(payload));
}

function routeName(req) {
  const path = (req.url || '').split('?')[0];
  if (path.endsWith('/create-checkout-session')) return 'create-checkout-session';
  if (path.endsWith('/confirm-cash')) return 'confirm-cash';
  if (path.endsWith('/stripe-webhook')) return 'stripe-webhook';
  if (path.endsWith('/verify')) return 'verify';
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

  if (!readyForPayment(booking)) return json(res, 400, { error: 'Booking is not ready for payment' });

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

// Called by the booking page when the customer returns from Stripe
// (?payment=success). Asks Stripe for the booking's Checkout Session and, if
// it is paid, records it the same way as the webhook. So the payment is
// recorded even if a webhook is delayed or fails.
async function handleVerify(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const body = await parseBody(req);
  const bookingId = body.bookingId;
  if (!bookingId || !isValidUUID(bookingId)) return json(res, 400, { error: 'Invalid booking ID' });
  const booking = await dbGet('bookings', bookingId);
  if (!booking) return json(res, 404, { error: 'Booking not found' });
  if (booking.payment_status === 'Paid') return json(res, 200, { paid: true });
  if (!booking.stripe_session_id) return json(res, 200, { paid: false });
  const session = await getStripeSession(booking.stripe_session_id);
  if (!session || session.payment_status !== 'paid' || session.metadata?.bookingId !== bookingId) return json(res, 200, { paid: false });
  await recordCardPayment(bookingId, session);
  return json(res, 200, { paid: true });
}

async function handleConfirmCash(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const body = await parseBody(req);
  const bookingId = body.bookingId;
  if (!bookingId || !isValidUUID(bookingId)) return json(res, 400, { error: 'Invalid booking ID' });

  const booking = await dbGet('bookings', bookingId);
  if (!booking) return json(res, 404, { error: 'Booking not found' });

  if (!readyForPayment(booking)) return json(res, 400, { error: 'Booking cannot be confirmed in its current state' });
  // Already chose cash: nothing to change, don't send the notices again.
  if (String(booking.payment_method || '').toLowerCase() === 'cash') return json(res, 200, { success: true });

  // Cash is recorded the way the Operator app records it: method Cash, still
  // Unpaid until the driver collects it. Never marked Paid here.
  await dbUpdate('bookings', bookingId, { payment_method: 'Cash', payment_status: 'Unpaid' });
  await sendConfirmations({ ...booking, payment_method: 'Cash', payment_status: 'Unpaid' });
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

async function getStripeReceiptUrl(paymentIntentId) {
  try {
    const res = await fetch(
      `https://api.stripe.com/v1/payment_intents/${paymentIntentId}?expand[]=latest_charge`,
      { headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` } }
    );
    if (!res.ok) return null;
    const pi = await res.json();
    return pi.latest_charge?.receipt_url || null;
  } catch { return null; }
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

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('STRIPE_WEBHOOK_SECRET is not configured — webhook rejected');
    res.statusCode = 400;
    return res.end('Webhook Error: missing configuration');
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

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object;
    const bookingId = session.metadata?.bookingId;

    if (bookingId && isValidUUID(bookingId)) {
      if (session.payment_status !== 'paid') {
        console.log(`Webhook: session ${session.id} completed but payment_status is '${session.payment_status}' — skipping`);
        return json(res, 200, { received: true });
      }
      try {
        // Money has been taken, so it is recorded whatever the booking's
        // status (an operator may need to refund a cancelled one).
        const out = await recordCardPayment(bookingId, session);
        if (!out.recorded) console.log(`Webhook: booking ${bookingId} already Paid — duplicate event ignored`);
      } catch (err) {
        console.error('Webhook processing error:', err);
        res.statusCode = 500;
        return res.end('Webhook processing error — Stripe should retry');
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
    if (route === 'verify') return handleVerify(req, res);
    return json(res, 200, { ok: true, service: 'payment' });
  } catch (err) {
    console.error('Payment router error:', err);
    return json(res, 500, { error: err.message || 'Payment request failed. Please try again.' });
  }
};

// Set after the handler: assigning module.exports above replaced an earlier
// config export, so body parsing was never actually turned off. Stripe's
// signature needs the raw bytes.
module.exports.config = { api: { bodyParser: false } };
