'use strict';

// Tell @vercel/node not to pre-parse the body — Stripe signature verification
// requires the raw bytes exactly as received.
module.exports.config = { api: { bodyParser: false } };

const crypto = require('crypto');
const { dbGet, dbUpdate, isValidUUID } = require('../../lib/supabase');
const { sendConfirmations } = require('../../lib/notify');
const { getRawBody } = require('../../lib/parse');

function verifyStripeSignature(rawBody, sigHeader, secret) {
  // Parse t=timestamp,v1=signature
  const parts = {};
  sigHeader.split(',').forEach(part => {
    const idx = part.indexOf('=');
    if (idx > -1) parts[part.slice(0, idx)] = part.slice(idx + 1);
  });

  const timestamp = parts.t;
  const v1        = parts.v1;
  if (!timestamp || !v1) throw new Error('Malformed stripe-signature header');

  // Reject events older than 5 minutes
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp, 10)) > 300) {
    throw new Error('Timestamp too old — possible replay attack');
  }

  const payload  = `${timestamp}.${rawBody.toString('utf8')}`;
  const expected    = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  const v1Buf       = Buffer.from(v1, 'hex');
  if (expectedBuf.length !== v1Buf.length || !crypto.timingSafeEqual(expectedBuf, v1Buf)) {
    throw new Error('Signature mismatch');
  }
  return JSON.parse(rawBody.toString('utf8'));
}

module.exports = async function handler(req, res) {
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
    const session   = event.data.object;
    const bookingId = session.metadata?.bookingId;

    if (bookingId && isValidUUID(bookingId)) {
      try {
        const booking = await dbGet('bookings', bookingId);
        const readyForPayment =
          booking && booking.status === 'Dispatched' &&
          (booking.payment_status === null || booking.payment_status === 'pending');
        if (readyForPayment) {
          await dbUpdate('bookings', bookingId, {
            payment_status:   'paid',
            payment_method:   'card',
            stripe_session_id: session.id
          });
          const confirmed = {
            ...booking,
            payment_method: 'card',
            payment_status: 'paid'
          };
          await sendConfirmations(confirmed);
        }
      } catch (err) {
        // Log but return 200 so Stripe doesn't retry — avoid duplicate processing
        console.error('Webhook processing error:', err);
      }
    }
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ received: true }));
};
