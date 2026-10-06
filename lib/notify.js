'use strict';

const { journeyLine, fmtDate, fmtTime, getPrice, singleLineSubject, paymentLine, bookingDetailsHtml, paymentSectionHtml } = require('./format');
const { sendPushToOperatorDevices } = require('./push');
const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
    body: JSON.stringify({ title, body: `Tap to send to ${booking.customer_name || 'the customer'}`, url: `/operator/sms-tasks/${task.id}` })
  }).catch(err => console.error('Failed to push-notify operator for SMS task:', err));
}

function siteUrl() { return process.env.SITE_URL || 'https://evexec.co.uk'; }
function payUrl(booking) { return `${siteUrl()}/booking?id=${booking.id}`; }
function isCash(b) { return String(b.payment_method || '').trim().toLowerCase() === 'cash'; }
function isPaid(b) { return String(b.payment_status || '').trim().toLowerCase() === 'paid'; }
const P = 'margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#334155';
const HI = 'margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#0f1b33';
const CLOSE = `<p style="margin:18px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#64748b">Questions? Call or WhatsApp <a href="tel:07721070370" style="color:#8a6416;text-decoration:none">07721 070370</a> or reply to this email.</p>`;

// Booking confirmed (operator accepted): full details, then the Payment
// section with the Pay Now link to the booking page (card or cash).
function bookingConfirmedEmail(booking) {
  const first = esc((booking.customer_name || 'there').split(' ')[0]);
  return emailLayout({ title: 'Booking Confirmed', accent: '#10b981', body:
    `<p style="${HI}">Hi ${first},</p><p style="${P}">Your booking is confirmed. Here are your journey details.</p>`
    + bookingDetailsHtml(booking) + paymentSectionHtml(booking, payUrl(booking)) + CLOSE });
}

async function sendBookingConfirmed(booking) {
  const subject = `Booking Confirmed: EV Exec Transfer (Ref ${booking.ref})`;
  const html = bookingConfirmedEmail(booking);
  if (booking.customer_email) {
    await sendOrQueue(() => sendEmail({ to: booking.customer_email, subject, html }), { booking_id: booking.id, type: 'accepted', channel: 'email', recipient: booking.customer_email, subject, html });
    await logMany(booking.id, 'accepted', [['email', booking.customer_email]]);
  } else if (booking.customer_phone) {
    const sms = [`Hi ${(booking.customer_name || 'there').split(' ')[0]}, your EV Exec booking ${booking.ref} is confirmed.`, journeyLine(booking), `${fmtDate(booking.travel_date)} at ${fmtTime(booking.travel_time)}`, '', `Pay by card or choose cash: ${payUrl(booking)}`, '', 'Questions? 07721 070370'].join('\n');
    await handOffSmsToOperator(booking, sms, 'confirmation');
  }
}

// After the customer pays by card (Stripe) or chooses cash: the customer's
// confirmation, plus the staff notice (email + Operator app push).
async function sendConfirmations(booking, notes = '', receiptUrl = null) {
  const date = fmtDate(booking.travel_date);
  const time = fmtTime(booking.travel_time, booking.travel_date);
  const price = getPrice(booking);
  const amount = price ? `£${Number(price).toFixed(2)}` : 'TBC';
  const method = paymentLine(booking);
  const paid = isPaid(booking);
  const cash = !paid && isCash(booking);
  const first = esc((booking.customer_name || 'there').split(' ')[0]);
  const opEmail = (process.env.OPERATOR_EMAIL || '').trim();

  const custTitle = paid ? 'Payment Received' : 'Booking Confirmed';
  const lead = paid ? "Thank you, we've received your payment. Your booking is confirmed."
    : cash ? "Thank you, your booking is confirmed. You've chosen to pay cash on the day."
    : 'Your booking is confirmed.';
  const payBlock = `<div style="border-top:2px solid #C9A550;margin-top:6px"></div>`
    + `<p style="margin:22px 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:#8a6416;text-transform:uppercase;letter-spacing:.06em">Payment</p>`
    + `<p style="${P}">Payment: <strong style="color:#0f1b33">${esc(method)}</strong>${paid ? ` (${esc(amount)})` : ''}</p>`
    + (receiptUrl ? `<p style="${P}"><a href="${esc(receiptUrl)}" style="color:#8a6416;text-decoration:none;font-weight:700">View your Stripe receipt →</a></p>` : '')
    + (notes ? `<p style="${P}">${esc(notes)}</p>` : '');
  const customerEmailHtml = emailLayout({ title: custTitle, accent: '#10b981', body:
    `<p style="${HI}">Hi ${first},</p><p style="${P}">${lead}</p>` + bookingDetailsHtml(booking) + payBlock + CLOSE });
  const custSubject = `${custTitle}: EV Exec Transfer (Ref ${booking.ref})`;

  const opTitle = paid ? 'EV Exec Payment Received' : cash ? 'Customer Paying Cash' : 'Booking Confirmed';
  const OL = 'padding:9px 0;color:#64748b;width:118px;border-bottom:1px solid #eef0f3;font-size:12px;text-transform:uppercase;letter-spacing:.04em;vertical-align:top;font-family:Arial,Helvetica,sans-serif';
  const OV = 'padding:9px 0;font-weight:700;color:#0f1b33;border-bottom:1px solid #eef0f3;font-size:14px;vertical-align:top;font-family:Arial,Helvetica,sans-serif';
  const orow = (l, v) => `<tr><td style="${OL}">${esc(l)}</td><td style="${OV}">${esc(v)}</td></tr>`;
  const operatorEmailHtml = emailLayout({ title: opTitle, accent: paid ? '#10b981' : '#d5a538', body:
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin:0 0 18px">`
    + orow('Booking', booking.ref) + orow('Customer', [booking.customer_name, booking.customer_phone].filter(Boolean).join(' · '))
    + orow('Journey', journeyLine(booking)) + orow('Date & time', `${date} ${time}`)
    + orow('Amount', amount) + orow('Payment', method) + `</table>`
    + (receiptUrl ? `<p style="${P}"><a href="${esc(receiptUrl)}" style="color:#8a6416;text-decoration:none;font-weight:700">View Stripe receipt →</a></p>` : '') });
  const opSubject = singleLineSubject(`${opTitle}: ${booking.ref}, ${date} ${time}`);
  const pushBody = `${booking.ref} · ${booking.customer_name || 'Customer'} · ${date} ${time} · ${amount} · ${method}`;

  const hasCustomerEmail = Boolean(booking.customer_email);
  const logEntries = [];
  if (hasCustomerEmail) logEntries.push(['email', booking.customer_email]);
  if (opEmail) logEntries.push(['email', opEmail]);
  logEntries.push(['operator_push', 'operator']);

  await Promise.allSettled([
    hasCustomerEmail
      ? sendOrQueue(() => sendEmail({ to: booking.customer_email, subject: custSubject, html: customerEmailHtml }), { booking_id: booking.id, type: 'confirmation', channel: 'email', recipient: booking.customer_email, subject: custSubject, html: customerEmailHtml })
      : null,
    opEmail ? sendOrQueue(() => sendEmail({ to: opEmail, subject: opSubject, html: operatorEmailHtml }), { booking_id: booking.id, type: 'confirmation', channel: 'email', recipient: opEmail, subject: opSubject, html: operatorEmailHtml }) : null,
    sendPushToOperatorDevices(opTitle, pushBody, '/operator/dispatch', `payment-${booking.ref}`).catch(() => {}),
    sendPush(booking, custTitle, `${booking.ref}: ${date} ${time}. ${method}.`, '/booking?id=' + booking.id),
    logMany(booking.id, 'confirmation', logEntries)
  ].filter(Boolean));
}

async function sendRejectionNotice(booking) {
  const first = (booking.customer_name || 'there').split(' ')[0];
  const date = fmtDate(booking.travel_date);
  const customerSms = `Hi ${first}, unfortunately EV Exec cannot accommodate your requested journey on ${date} (Ref ${booking.ref}). We apologise for the inconvenience. No payment has been taken.\n\nQuestions: 07721 070370`;
  const customerEmailHtml = emailLayout({ title: 'Booking Unavailable', accent: '#ef4444', body:
    `<p style="${HI}">Hi ${esc(first)},</p>`
    + `<p style="${P}">Unfortunately, EV Exec cannot accommodate your requested journey. We apologise for the inconvenience.</p>`
    + bookingDetailsHtml(booking, { price: false })
    + `<p style="${P}">No payment has been taken. If you would like to discuss another time or option, please get in touch.</p>` + CLOSE });
  const subject = `EV Exec: Booking Unavailable (Ref ${booking.ref})`;
  const hasEmail = Boolean(booking.customer_email);
  const hasPhone = Boolean(booking.customer_phone);
  const logEntries = [];
  if (hasEmail) logEntries.push(['email', booking.customer_email]);
  else if (hasPhone) logEntries.push(['two_tap_operator_sms', 'operator']);
  await Promise.allSettled([
    hasEmail
      ? sendOrQueue(() => sendEmail({ to: booking.customer_email, subject, html: customerEmailHtml }), { booking_id: booking.id, type: 'rejection', channel: 'email', recipient: booking.customer_email, subject, html: customerEmailHtml })
      : (hasPhone ? handOffSmsToOperator(booking, customerSms, 'rejection') : null),
    logMany(booking.id, 'rejection', logEntries)
  ].filter(Boolean));
}

// Re-export channel primitives for backward compatibility
module.exports = { sendSMS, sendEmail, sendWhatsApp, sendPush, sendPushToOperator, whatsAppReady, sendConfirmations, sendBookingConfirmed, bookingConfirmedEmail, sendRejectionNotice, normaliseUkPhone, handOffSmsToOperator };
