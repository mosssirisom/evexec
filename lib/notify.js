'use strict';

const { singleLineSubject } = require('./format');
const { routeLine, ukWhen, paymentLine } = require('./correspondence');
const { customerConfirmed, operatorPaymentConfirmed } = require('./messages');
const { generateToken } = require('./token');
const { logMany } = require('./notifyLog');
const { sendOrQueue } = require('./notificationQueue');
const { sendEmail, sendSMS, sendWhatsApp, sendPush, sendPushToOperator, whatsAppReady, normaliseUkPhone } = require('./channels');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yoltkmhtxwluqxxpewbl.supabase.co';

function dbHeaders(extra = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    'Content-Type': 'application/json',
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    ...extra
  };
}

async function getPushWebhookSecret() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/push_config?select=webhook_secret&id=eq.true`, { headers: dbHeaders() });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0]?.webhook_secret || null;
}

// The "two-tap automation": customer-facing SMS that would otherwise go
// through Twilio (booking confirmation / rejection, email-primary, only
// reached when the customer has no email on file) is instead handed off to
// staff. The generated message is stored on operator_sms_tasks, every
// subscribed operator device gets a push notification deep-linking to it,
// and a staff member reviews + sends it themselves from their own phone via
// the native Messages app -- two taps (open the push, tap Open Messages)
// plus pressing Send. No Twilio API call is made for this flow.
//
// `Prefer: resolution=ignore-duplicates` against the (booking_id, kind)
// unique constraint means a retried send never creates (or re-pushes) a
// second task for the same booking/kind.
async function handOffSmsToOperator(booking, message, kind) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/operator_sms_tasks`, {
    method: 'POST',
    headers: dbHeaders({ Prefer: 'resolution=ignore-duplicates,return=representation' }),
    body: JSON.stringify({
      booking_id: booking.id,
      kind,
      customer_name: booking.customer_name || null,
      customer_phone: booking.customer_phone,
      message,
      status: 'pending'
    })
  });
  if (!res.ok) { console.error(`Failed to create operator SMS task for booking ${booking.id}:`, await res.text()); return; }
  const rows = await res.json();
  const task = rows[0];
  if (!task) return; // already has a task for this booking/kind -- don't re-push

  const secret = await getPushWebhookSecret();
  if (!secret) { console.error('push_config.webhook_secret not set -- cannot push-notify operator for SMS task'); return; }

  const opUrl = process.env.OPERATOR_APP_URL || 'https://evexecoperator.vercel.app';
  const title = kind === 'confirmation' ? 'SMS confirmation needed' : 'SMS notice needed';
  await fetch(`${opUrl}/api/push/notify-operators`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-webhook-secret': secret },
    body: JSON.stringify({ title, body: `Tap to send to ${booking.customer_name || 'the customer'}`, url: `/operator/sms-tasks/${task.id}` })
  }).catch(err => console.error('Failed to push-notify operator for SMS task:', err));
}

// Customer + operator notice once a website booking's payment is settled
// (card paid via Stripe, or cash on the day chosen). Wording comes from
// lib/messages.js, so the payment line always reflects the booking's real
// payment_method/payment_status.
async function sendConfirmations(booking, _notes = '', receiptUrl = null) {
  const site = process.env.SITE_URL || 'https://evexec.co.uk';
  const opEmail = (process.env.OPERATOR_EMAIL || '').trim();
  const cancelUrl = `${site}/api/booking/cancel?id=${booking.id}&token=${generateToken(booking.id, 'cancel')}`;
  const customer = customerConfirmed(booking, { receiptUrl, cancelUrl });
  const operator = operatorPaymentConfirmed(booking, { receiptUrl });
  const when = ukWhen(booking.travel_date, booking.travel_time);
  const route = routeLine(booking);
  const payment = paymentLine(booking);
  const title = /^Paid/.test(payment) ? 'Payment Confirmed' : 'Booking Confirmed';

  const hasCustomerEmail = Boolean(booking.customer_email);
  const hasCustomerPhone = Boolean(booking.customer_phone);

  const logEntries = [];
  if (hasCustomerEmail) logEntries.push(['email', booking.customer_email]);
  else if (hasCustomerPhone) logEntries.push(['two_tap_operator_sms', 'operator']);
  logEntries.push(['push', booking.customer_email || booking.customer_phone]);
  if (opEmail) logEntries.push(['email', opEmail]);

  await Promise.allSettled([
    // Customer: email-first. No email on file -> hand the SMS off to staff
    // via the two-tap automation instead of sending through Twilio.
    hasCustomerEmail
      ? sendOrQueue(() => sendEmail({ to: booking.customer_email, subject: customer.subject, html: customer.html }), { booking_id: booking.id, type: 'confirmation', channel: 'email', recipient: booking.customer_email, subject: customer.subject, html: customer.html })
      : (hasCustomerPhone ? handOffSmsToOperator(booking, customer.text, 'confirmation') : null),
    // Operator: push + email. (No SMS-to-operator fallback -- push already
    // covers the "no email configured" case for staff.)
    sendPushToOperator(title, `${booking.customer_name} · ${route}, ${when}. ${payment}.`, '/operator').catch(() => {}),
    opEmail ? sendOrQueue(() => sendEmail({ to: opEmail, subject: singleLineSubject(operator.subject), html: operator.html }), { booking_id: booking.id, type: 'confirmation', channel: 'email', recipient: opEmail, subject: singleLineSubject(operator.subject), html: operator.html }) : null,
    sendPush(booking, title, `${route}, ${when}. ${payment}.`, '/booking?id=' + booking.id),
    logMany(booking.id, 'confirmation', logEntries)
  ].filter(Boolean));
}

// Re-export channel primitives for backward compatibility
module.exports = { sendSMS, sendEmail, sendWhatsApp, sendPush, sendPushToOperator, whatsAppReady, sendConfirmations, normaliseUkPhone, handOffSmsToOperator };
