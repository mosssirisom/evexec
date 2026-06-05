'use strict';

const { dbGet, dbUpdate, isValidUUID } = require('../../lib/supabase');
const { getPrice, journeyLine } = require('../../lib/format');
const { parseBody } = require('../../lib/parse');

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

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Stripe error');
  }
  return res.json();
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  const body       = await parseBody(req);
  const bookingId  = body.bookingId;

  if (!bookingId || !isValidUUID(bookingId)) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'Invalid booking ID' }));
  }

  try {
    const booking = await dbGet('bookings', bookingId);
    if (!booking) {
      res.statusCode = 404;
      return res.end(JSON.stringify({ error: 'Booking not found' }));
    }
    // Status is 'Dispatched' after operator accepts; payment must not yet be taken
    const readyForPayment =
      booking.status === 'Dispatched' && !booking.payment_status;
    if (!readyForPayment) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: 'Booking is not ready for payment' }));
    }

    const price = getPrice(booking);
    if (!price) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: 'Price not available yet. Please contact EV Exec.' }));
    }

    const siteUrl = process.env.SITE_URL || 'https://evexec.co.uk';
    const session = await createStripeSession({
      price,
      description:   journeyLine(booking),
      bookingId,
      customerEmail: booking.customer_email,
      successUrl:    `${siteUrl}/booking?id=${bookingId}&payment=success`,
      cancelUrl:     `${siteUrl}/booking?id=${bookingId}&payment=cancelled`
    });

    await dbUpdate('bookings', bookingId, { stripe_session_id: session.id });

    res.statusCode = 200;
    res.end(JSON.stringify({ url: session.url }));
  } catch (err) {
    console.error('Checkout session error:', err);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: err.message || 'Payment setup failed. Please try again.' }));
  }
};
