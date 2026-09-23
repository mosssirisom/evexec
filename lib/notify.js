'use strict';

const { journeyLine, fmtDate, fmtTime, getPrice, emailJourneyHtml, refBadgeHtml, singleLineSubject } = require('./format');
const { emailLayout } = require('./emailLayout');
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
    body: JSON.stringify({ title, body: `${booking.customer_name || 'Customer'} — tap to send`, url: `/operator/sms-tasks/${task.id}` })
  }).catch(err => console.error('Failed to push-notify operator for SMS task:', err));
}

async function sendConfirmations(booking, notes = '', receiptUrl = null) {
  const route = journeyLine(booking);
  const date = fmtDate(booking.travel_date);
  const time = fmtTime(booking.travel_time, booking.travel_date);
  const price = getPrice(booking);
  const method = booking.payment_method === 'cash' ? 'Cash on the day' : 'Paid by card';
  const firstName = (booking.customer_name || 'there').split(' ')[0];
  const site = process.env.SITE_URL || 'https://evexec.co.uk';
  const opEmail = (process.env.OPERATOR_EMAIL || '').trim();
  const cancelUrl = `${site}/api/booking/cancel?id=${booking.id}&token=${generateToken(booking.id, 'cancel')}`;

  const customerSms = [
    `Hi ${firstName}, your EV Exec transfer is confirmed!`,
    '',
    route,
    `${date} at ${time}`,
    `Payment: ${method}`,
    receiptUrl ? `Receipt: ${receiptUrl}` : null,
    notes,
    '',
    'See you then! Questions: 07721 070370',
    '',
    `Modify: https://wa.me/447721070370`,
    `Cancel: ${cancelUrl}`,
  ].filter(l => l !== null).join('\n');

  const customerEmailHtml = emailLayout({ title: 'Booking Confirmed', body: `<p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:15px;color:#fff">Hi ${firstName},</p><p style="margin:0 0 20px;font-family:Inter,Arial,sans-serif;font-size:15px;color:rgba(255,255,255,.65);line-height:1.6">Your airport transfer is confirmed. We look forward to seeing you.</p>${refBadgeHtml(booking.ref)}${emailJourneyHtml(booking)}${price ? `<p style="margin:0 0 16px;font-family:Inter,Arial,sans-serif;font-size:26px;font-weight:900;color:#d5a538">£${price}</p>` : ''}<p style="margin:0 0 ${receiptUrl ? '8px' : '20px'};font-family:Inter,Arial,sans-serif;font-size:14px;color:rgba(255,255,255,.65)">Payment: <strong style="color:#fff">${method}</strong></p>${receiptUrl ? `<p style="margin:0 0 20px"><a href="${receiptUrl}" style="color:#d5a538;font-family:Inter,Arial,sans-serif;font-size:14px;text-decoration:none">View payment receipt →</a></p>` : ''}${notes ? `<p style="margin:0 0 20px;font-family:Inter,Arial,sans-serif;font-size:14px;color:rgba(255,255,255,.65)">${notes}</p>` : ''}<p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:13px;color:rgba(255,255,255,.5)">Questions? Call or WhatsApp: <a href="tel:07721070370" style="color:#d5a538;text-decoration:none">07721 070370</a></p>` });

  const operatorEmailHtml = emailLayout({ title: 'Payment Confirmed', body: `<p style="margin:0 0 4px;font-family:Inter,Arial,sans-serif;font-size:13px;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.05em">Customer</p><p style="margin:0 0 20px;font-family:Inter,Arial,sans-serif;font-size:16px;font-weight:700;color:#fff">${booking.customer_name} &nbsp;&middot;&nbsp; <a href="tel:${booking.customer_phone}" style="color:#d5a538;text-decoration:none">${booking.customer_phone}</a></p><p style="margin:0 0 4px;font-family:Inter,Arial,sans-serif;font-size:13px;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.05em">Journey</p>${emailJourneyHtml(booking)}${price ? `<p style="margin:0 0 ${receiptUrl ? '8px' : '0'};font-family:Inter,Arial,sans-serif;font-size:26px;font-weight:900;color:#d5a538">£${price}</p>` : ''}${receiptUrl ? `<p style="margin:0 0 16px"><a href="${receiptUrl}" style="color:#d5a538;font-family:Inter,Arial,sans-serif;font-size:14px;text-decoration:none">View Stripe receipt →</a></p>` : ''}<p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:rgba(255,255,255,.65)">Payment: <strong style="color:#d5a538">${method}</strong></p>` });

  const hasCustomerEmail = Boolean(booking.customer_email);
  const hasCustomerPhone = Boolean(booking.customer_phone);
  const opConfirmSubject = singleLineSubject(`Payment Confirmed: ${route}, ${date}`);

  const logEntries = [];
  if (hasCustomerEmail) logEntries.push(['email', booking.customer_email]);
  else if (hasCustomerPhone) logEntries.push(['two_tap_operator_sms', 'operator']);
  logEntries.push(['push', booking.customer_email || booking.customer_phone]);
  if (opEmail) logEntries.push(['email', opEmail]);

  await Promise.allSettled([
    // Customer: email-first. No email on file -> hand the SMS off to staff
    // via the two-tap automation instead of sending through Twilio.
    hasCustomerEmail
      ? sendOrQueue(() => sendEmail({ to: booking.customer_email, subject: `Booking Confirmed: EV Exec Transfer`, html: customerEmailHtml }), { booking_id: booking.id, type: 'confirmation', channel: 'email', recipient: booking.customer_email, subject: `Booking Confirmed: EV Exec Transfer`, html: customerEmailHtml })
      : (hasCustomerPhone ? handOffSmsToOperator(booking, customerSms, 'confirmation') : null),
    // Operator: push + email. (No SMS-to-operator fallback -- push already
    // covers the "no email configured" case for staff, and it isn't a
    // customer-facing send that needs the two-tap review step.)
    sendPushToOperator('Payment Confirmed', `${booking.customer_name} · ${route} on ${date}`, '/operator').catch(() => {}),
    opEmail ? sendOrQueue(() => sendEmail({ to: opEmail, subject: opConfirmSubject, html: operatorEmailHtml }), { booking_id: booking.id, type: 'confirmation', channel: 'email', recipient: opEmail, subject: opConfirmSubject, html: operatorEmailHtml }) : null,
    sendPush(booking, 'Transfer Confirmed', `${route} on ${date}. ${method}.`, '/booking?id=' + booking.id),
    logMany(booking.id, 'confirmation', logEntries)
  ].filter(Boolean));
}

async function sendRejectionNotice(booking) {
  const route = journeyLine(booking);
  const firstName = (booking.customer_name || 'there').split(' ')[0];
  const date = fmtDate(booking.travel_date);

  const customerSms = `Hi ${firstName}, unfortunately EV Exec is unavailable for your journey on ${date}.\n\nNo payment has been taken. Sorry for any inconvenience.\n\nQuestions: 07721 070370`;

  const customerEmailHtml = emailLayout({ title: 'Journey Unavailable', accent: '#374151', accentText: '#fff', body: `<p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:15px;color:#fff">Hi ${firstName},</p><p style="margin:0 0 16px;font-family:Inter,Arial,sans-serif;font-size:15px;color:rgba(255,255,255,.65);line-height:1.6">Unfortunately, EV Exec is unable to cover your requested journey. We're sorry for any inconvenience caused.</p>${emailJourneyHtml(booking)}<p style="margin:0 0 20px;font-family:Inter,Arial,sans-serif;font-size:14px;color:rgba(255,255,255,.65)">No payment has been taken. If you have any questions, please don't hesitate to get in touch.</p><p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:13px;color:rgba(255,255,255,.5)">Call or WhatsApp: <a href="tel:07721070370" style="color:#d5a538;text-decoration:none">07721 070370</a></p>` });

  const hasEmail = Boolean(booking.customer_email);
  const hasPhone = Boolean(booking.customer_phone);

  const logEntries = [];
  if (hasEmail) logEntries.push(['email', booking.customer_email]);
  else if (hasPhone) logEntries.push(['two_tap_operator_sms', 'operator']);

  await Promise.allSettled([
    // Email-first. No email on file -> hand off to staff via the two-tap
    // automation instead of sending through Twilio.
    hasEmail
      ? sendOrQueue(() => sendEmail({ to: booking.customer_email, subject: 'EV Exec: Journey Unavailable', html: customerEmailHtml }), { booking_id: booking.id, type: 'rejection', channel: 'email', recipient: booking.customer_email, subject: 'EV Exec: Journey Unavailable', html: customerEmailHtml })
      : (hasPhone ? handOffSmsToOperator(booking, customerSms, 'rejection') : null),
    logMany(booking.id, 'rejection', logEntries)
  ].filter(Boolean));
}

// Re-export channel primitives for backward compatibility
module.exports = { sendSMS, sendEmail, sendWhatsApp, sendPush, sendPushToOperator, whatsAppReady, sendConfirmations, sendRejectionNotice, normaliseUkPhone };
