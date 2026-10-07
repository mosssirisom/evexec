'use strict';


const crypto = require('crypto');
const { dbGet, dbUpdate, isValidUUID } = require('../../lib/supabase');
const { sendConfirmations } = require('../../lib/notify');
const { getPrice, journeyLine } = require('../../lib/format');
const { parseBody, getRawBody } = require('../../lib/parse');
const { reconcileCheckoutSession, getStripeSession, expireStripeSession, expectedPence, PAID_OUTCOMES } = require('../../lib/payments');
const stripeEvents = require('../../lib/stripeEvents');

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

function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.end(JSON.stringify(payload));
}

function text(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.end(body);
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

  const siteUrl = process.env.SITE_URL || 'https://evexec.co.uk';
  const successUrl = `${siteUrl}/booking?id=${bookingId}&payment=success`;

  // The checkout already started for this booking: reuse it while it is open
  // (so the customer can't end up with two payable checkouts and pay twice),
  // and if it was already paid, send them to the success page, which records it.
  if (booking.stripe_session_id) {
    const existing = await getStripeSession(booking.stripe_session_id);
    if (existing && existing.metadata?.bookingId === bookingId) {
      if (existing.payment_status === 'paid') return json(res, 200, { url: `${successUrl}&session_id=${encodeURIComponent(existing.id)}` });
      if (existing.status === 'open' && readyForPayment(booking) && existing.amount_total === expectedPence(booking) && existing.url) {
        return json(res, 200, { url: existing.url });
      }
      if (existing.status === 'open') await expireStripeSession(existing.id);
    }
  }

  if (!readyForPayment(booking)) return json(res, 400, { error: 'Booking is not ready for payment' });

  const price = getPrice(booking);
  if (!price) return json(res, 400, { error: 'Price not available yet. Please contact EV Exec.' });

  const session = await createStripeSession({
    price,
    description: journeyLine(booking),
    bookingId,
    customerEmail: booking.customer_email,
    // Stripe fills in {CHECKOUT_SESSION_ID}, so the return check knows exactly
    // which checkout was paid.
    successUrl: `${successUrl}&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${siteUrl}/booking?id=${bookingId}&payment=cancelled`
  });

  await dbUpdate('bookings', bookingId, { stripe_session_id: session.id });
  return json(res, 200, { url: session.url });
}

// Called by the booking page when the customer returns from Stripe
// (?payment=success). Asks Stripe whether the checkout is paid and, if so,
// records it through the same reconcileCheckoutSession() the webhook uses, so
// the payment is recorded even if the webhook is late or fails. Safe to call
// any number of times (page refreshes, alongside the webhook).
async function handleVerify(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const body = await parseBody(req);
  const bookingId = body.bookingId;
  if (!bookingId || !isValidUUID(bookingId)) return json(res, 400, { error: 'Invalid booking ID' });
  const booking = await dbGet('bookings', bookingId);
  if (!booking) return json(res, 404, { error: 'Booking not found' });
  if (booking.payment_status === 'Paid') return json(res, 200, { paid: true });

  const sessionId = typeof body.sessionId === 'string' && body.sessionId ? body.sessionId : booking.stripe_session_id;
  if (!sessionId) return json(res, 200, { paid: false });
  const session = await getStripeSession(sessionId);
  // Only a checkout created for this booking can mark it paid.
  if (!session || session.metadata?.bookingId !== bookingId) return json(res, 200, { paid: false });
  const out = await reconcileCheckoutSession(session);
  return json(res, 200, { paid: PAID_OUTCOMES.has(out.outcome) });
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

  // Close any card checkout still open for this booking so it can't also be paid.
  if (booking.stripe_session_id) {
    const open = await getStripeSession(booking.stripe_session_id);
    if (open && open.status === 'open') await expireStripeSession(open.id);
  }

  // Cash is recorded the way the Operator app records it: method Cash, still
  // Unpaid until the driver collects it. Never marked Paid here.
  await dbUpdate('bookings', bookingId, { payment_method: 'Cash', payment_status: 'Unpaid' });
  await sendConfirmations({ ...booking, payment_method: 'Cash', payment_status: 'Unpaid' });
  return json(res, 200, { success: true });
}

const SIGNATURE_TOLERANCE_SECONDS = 300;

// Stripe's scheme: HMAC-SHA256 of "<t>.<raw body>" with the endpoint's signing
// secret, hex, in a v1= entry. While a secret is being rolled Stripe sends one
// v1 entry per active secret, so every entry is checked. Several secrets can be
// configured, comma separated, for the same reason.
function verifyStripeSignature(rawBody, sigHeader, secrets) {
  let timestamp = null;
  const signatures = [];
  String(sigHeader).split(',').forEach(part => {
    const idx = part.indexOf('=');
    if (idx < 0) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key === 't') timestamp = value;
    else if (key === 'v1') signatures.push(value);
  });
  if (!timestamp || !signatures.length) throw new Error('Malformed stripe-signature header');
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp, 10)) > SIGNATURE_TOLERANCE_SECONDS) throw new Error('Timestamp outside the tolerance window');

  const payload = Buffer.concat([Buffer.from(`${timestamp}.`, 'utf8'), rawBody]);
  const ok = secrets.some(secret => {
    const expected = crypto.createHmac('sha256', secret).update(payload).digest();
    return signatures.some(sig => {
      const got = Buffer.from(sig, 'hex');
      return got.length === expected.length && crypto.timingSafeEqual(got, expected);
    });
  });
  if (!ok) throw new Error('Signature mismatch');
  return JSON.parse(rawBody.toString('utf8'));
}

function webhookSecrets() {
  return String(process.env.STRIPE_WEBHOOK_SECRET || '').split(',').map(s => s.trim()).filter(Boolean);
}

// What a rejected delivery looked like, without any secret or payload content,
// so a signature problem can be diagnosed after the fact.
function rejectionDiagnostics(req, rawBody, sigHeader) {
  const raw = String(process.env.STRIPE_WEBHOOK_SECRET || '');
  let claimed = null;
  try {
    const parsed = rawBody ? JSON.parse(rawBody.toString('utf8')) : null;
    if (parsed && /^evt_[A-Za-z0-9]{6,64}$/.test(parsed.id || '')) claimed = parsed.id;
  } catch { /* not JSON */ }
  return {
    claimed_event_id: claimed,
    body_bytes: rawBody ? rawBody.length : null,
    content_type: String(req.headers['content-type'] || '').slice(0, 80),
    user_agent: String(req.headers['user-agent'] || '').slice(0, 80),
    v1_signatures: (String(sigHeader || '').match(/(^|,)\s*v1=/g) || []).length,
    signature_age_seconds: (() => { const m = /(?:^|,)\s*t=(\d+)/.exec(String(sigHeader || '')); return m ? Math.round(Date.now() / 1000 - Number(m[1])) : null; })(),
    secrets_configured: webhookSecrets().length,
    secret_has_surrounding_whitespace: raw !== raw.trim(),
    secrets_have_whsec_prefix: webhookSecrets().every(s => s.startsWith('whsec_'))
  };
}

// A webhook for a booking we can't find is retried by Stripe for this long (in
// case it arrived before the booking was saved), then acknowledged and logged.
const UNKNOWN_BOOKING_RETRY_SECONDS = 3600;

async function handleStripeWebhook(req, res) {
  if (req.method !== 'POST') return text(res, 405, 'Method not allowed');

  const sigHeader = req.headers['stripe-signature'];
  const secrets = webhookSecrets();
  if (!secrets.length) {
    console.error('STRIPE_WEBHOOK_SECRET is not configured — webhook rejected');
    return text(res, 400, 'Webhook Error: missing configuration');
  }

  let rawBody = null;
  let event;
  try {
    rawBody = await getRawBody(req);
    if (!sigHeader) throw new Error('Missing stripe-signature header');
    event = verifyStripeSignature(rawBody, sigHeader, secrets);
  } catch (err) {
    console.error('Stripe webhook rejected:', err.message);
    const diagnostics = rejectionDiagnostics(req, rawBody, sigHeader);
    console.error('Stripe webhook rejection details:', JSON.stringify(diagnostics));
    // Only keep a record for deliveries that look like they came from Stripe,
    // so random requests to the URL can't fill the table.
    if (diagnostics.claimed_event_id || /^Stripe\//.test(diagnostics.user_agent)) await stripeEvents.rejection(err.message, diagnostics);
    return text(res, 400, `Webhook Error: ${err.message}`);
  }

  const isCheckout = event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded';
  const session = isCheckout ? event.data?.object : null;
  const seen = await stripeEvents.eventSeen(event, session?.id);

  if (!isCheckout) {
    if (seen && seen.status !== 'ignored') await stripeEvents.eventResult(event.id, { status: 'ignored', detail: 'event type not handled' });
    return json(res, 200, { received: true });
  }

  // Already handled: answer at once, change nothing, send nothing.
  if (seen && seen.attempts > 1 && stripeEvents.FINAL.has(seen.status)) {
    console.log(`Webhook: ${event.id} already handled (${seen.status}) — repeat delivery acknowledged`);
    return json(res, 200, { received: true, duplicate: true });
  }

  let out;
  try {
    out = await reconcileCheckoutSession(session);
  } catch (err) {
    console.error(`Webhook ${event.id} processing error:`, err);
    await stripeEvents.eventResult(event.id, { status: 'failed', detail: String(err.message || err).slice(0, 500) });
    return text(res, 500, 'Webhook processing error — Stripe should retry');
  }

  if (out.outcome === 'unknown_booking' && Date.now() / 1000 - Number(event.created || 0) < UNKNOWN_BOOKING_RETRY_SECONDS) {
    await stripeEvents.eventResult(event.id, { status: 'retrying', detail: out.detail || null });
    return text(res, 503, 'Booking not found yet — Stripe should retry');
  }

  if (out.outcome === 'recorded') console.log(`Webhook: ${event.id} recorded payment for ${out.booking.ref}`);
  else console.log(`Webhook: ${event.id} ${out.outcome}${out.detail ? ` (${out.detail})` : ''}`);
  await stripeEvents.eventResult(event.id, {
    status: out.outcome,
    booking_id: out.booking?.id || null,
    detail: out.detail || null,
    notified_at: out.notified ? new Date().toISOString() : null
  });
  return json(res, 200, { received: true });
}

// Awaited so an error inside a route is caught here and answered with a 500.
module.exports = async function handler(req, res) {
  try {
    const route = routeName(req);
    if (route === 'create-checkout-session') return await handleCreateCheckoutSession(req, res);
    if (route === 'confirm-cash') return await handleConfirmCash(req, res);
    if (route === 'stripe-webhook') return await handleStripeWebhook(req, res);
    if (route === 'verify') return await handleVerify(req, res);
    return json(res, 200, { ok: true, service: 'payment' });
  } catch (err) {
    console.error('Payment router error:', err);
    return json(res, 500, { error: err.message || 'Payment request failed. Please try again.' });
  }
};

// Body handling: vercel.json turns Vercel's request helpers off for this
// function (config.helpers = false), so req is the untouched request stream and
// getRawBody() reads the exact bytes Stripe signed.
