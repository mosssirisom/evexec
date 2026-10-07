'use strict';

// One place that turns a paid Stripe Checkout Session into a Paid booking.
// Used by the Stripe webhook and by the booking page's payment check
// (/api/payment/verify), so both follow exactly the same rules:
//
//  - The booking only moves to Paid through a conditional update that matches
//    rows not already Paid. Postgres row locking means only one caller can win
//    that update, however many webhook retries or page checks arrive at once.
//  - Only the caller that won the update sends the notifications (customer
//    email, operator email, operator push), so they go out exactly once.
//  - A notification failure never undoes or blocks the payment record: emails
//    that fail are queued for retry by sendOrQueue, and the caller still gets
//    a success result because the money is recorded.

const { dbGet, dbFindOne, dbUpdateWhere, isValidUUID } = require('./supabase');
const { sendConfirmations, sendDuplicatePaymentAlert } = require('./notify');
const { getPrice } = require('./format');

const NOT_PAID_FILTER = 'or=(payment_status.is.null,payment_status.neq.Paid)';

function stripeHeaders() {
  return { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` };
}

async function getStripeSession(sessionId) {
  if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(String(sessionId || ''))) return null;
  const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, { headers: stripeHeaders() });
  if (!res.ok) return null;
  return res.json();
}

async function expireStripeSession(sessionId) {
  try {
    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}/expire`, { method: 'POST', headers: stripeHeaders() });
    return res.ok;
  } catch { return false; }
}

async function getStripeReceiptUrl(paymentIntentId) {
  if (!paymentIntentId) return null;
  try {
    const res = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(paymentIntentId)}?expand[]=latest_charge`, { headers: stripeHeaders() });
    if (!res.ok) return null;
    const pi = await res.json();
    return pi.latest_charge?.receipt_url || null;
  } catch { return null; }
}

// Website checkouts carry metadata.bookingId. The Operator app's payment links
// carry the booking ref in metadata.booking_ref / client_reference_id.
async function findBookingForSession(session) {
  const id = session.metadata?.bookingId;
  if (id && isValidUUID(id)) return { booking: await dbGet('bookings', id), reference: id };
  const ref = session.metadata?.booking_ref || session.client_reference_id;
  if (ref && /^[A-Za-z0-9-]{3,40}$/.test(ref)) {
    if (isValidUUID(ref)) return { booking: await dbGet('bookings', ref), reference: ref };
    return { booking: await dbFindOne('bookings', { ref }), reference: ref };
  }
  return { booking: null, reference: null };
}

function expectedPence(booking) {
  const price = getPrice(booking);
  return price ? Math.round(Number(price) * 100) : null;
}

// Returns { outcome, booking?, detail?, notified? }. Outcomes:
//   not_paid          session isn't paid (nothing to record)
//   no_reference      session isn't linked to a booking (e.g. a Stripe dashboard payment link)
//   unknown_booking   linked booking doesn't exist
//   recorded          this call moved the booking to Paid and sent the notices
//   already_paid      booking was already Paid by this same session (repeat event / page refresh)
//   duplicate_payment booking was already Paid some other way; staff alerted to refund
// Throws only if the database can't be reached before the payment is recorded,
// so the webhook can return 500 and Stripe retries.
async function reconcileCheckoutSession(session) {
  if (!session || session.object !== 'checkout.session') return { outcome: 'not_paid', detail: 'not a checkout session' };
  if (session.payment_status !== 'paid') return { outcome: 'not_paid', detail: `payment_status ${session.payment_status}` };

  const { booking, reference } = await findBookingForSession(session);
  if (!reference) return { outcome: 'no_reference' };
  if (!booking) return { outcome: 'unknown_booking', detail: `no booking ${reference}` };

  const notes = [];
  const expected = expectedPence(booking);
  if (session.currency && session.currency !== 'gbp') notes.push(`currency ${session.currency}`);
  if (expected != null && session.amount_total != null && session.amount_total !== expected) {
    notes.push(`amount ${session.amount_total} pence, booking price ${expected} pence`);
  }

  const rows = await dbUpdateWhere('bookings', booking.id, NOT_PAID_FILTER, {
    payment_status: 'Paid',
    payment_method: 'Card',
    stripe_session_id: session.id
  });
  const updated = rows && rows[0];

  if (!updated) {
    // Re-read: another call may have just recorded this same session.
    const current = (await dbGet('bookings', booking.id)) || booking;
    if (current.stripe_session_id === session.id) {
      return { outcome: 'already_paid', booking: current, detail: notes.join('; ') || null };
    }
    // Paid twice (another checkout, or already marked Paid by staff).
    // Leave the booking alone; tell staff so they can refund.
    notes.unshift(`booking already Paid (session ${current.stripe_session_id || 'none'})`);
    let notified = false;
    try { await sendDuplicatePaymentAlert(current, session); notified = true; }
    catch (err) { console.error('Duplicate payment alert failed:', err.message || err); }
    return { outcome: 'duplicate_payment', booking: current, detail: notes.join('; '), notified };
  }

  if (notes.length) console.error(`Payment check for ${updated.ref}: ${notes.join('; ')}`);
  let notified = false;
  try {
    const receiptUrl = await getStripeReceiptUrl(session.payment_intent);
    await sendConfirmations(updated, '', receiptUrl);
    notified = true;
  } catch (err) {
    // The payment is recorded; a notice failing must not make Stripe retry
    // (a retry would find the booking Paid and send nothing anyway).
    console.error(`Payment recorded for ${updated.ref} but notifications failed:`, err.message || err);
  }
  return { outcome: 'recorded', booking: updated, detail: notes.join('; ') || null, notified };
}

const PAID_OUTCOMES = new Set(['recorded', 'already_paid', 'duplicate_payment']);

module.exports = {
  reconcileCheckoutSession,
  getStripeSession,
  expireStripeSession,
  getStripeReceiptUrl,
  expectedPence,
  PAID_OUTCOMES
};
