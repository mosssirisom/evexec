'use strict';

const { journeyLine, fmtDate, fmtTime, getPrice, emailJourneyHtml } = require('./format');
const { emailLayout } = require('./emailLayout');
const { generateToken } = require('./token');
const { logMany } = require('./notifyLog');
const { sendEmail, sendSMS, sendWhatsApp, sendPush, sendPushToOperator, whatsAppReady, normaliseUkPhone } = require('./channels');

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

  const customerEmailHtml = emailLayout({ title: 'Booking Confirmed', body: `<p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:15px;color:#fff">Hi ${firstName},</p><p style="margin:0 0 20px;font-family:Inter,Arial,sans-serif;font-size:15px;color:rgba(255,255,255,.65);line-height:1.6">Your airport transfer is confirmed. We look forward to seeing you.</p>${emailJourneyHtml(booking)}${price ? `<p style="margin:0 0 16px;font-family:Inter,Arial,sans-serif;font-size:26px;font-weight:900;color:#d5a538">£${price}</p>` : ''}<p style="margin:0 0 ${receiptUrl ? '8px' : '20px'};font-family:Inter,Arial,sans-serif;font-size:14px;color:rgba(255,255,255,.65)">Payment: <strong style="color:#fff">${method}</strong></p>${receiptUrl ? `<p style="margin:0 0 20px"><a href="${receiptUrl}" style="color:#d5a538;font-family:Inter,Arial,sans-serif;font-size:14px;text-decoration:none">View payment receipt →</a></p>` : ''}${notes ? `<p style="margin:0 0 20px;font-family:Inter,Arial,sans-serif;font-size:14px;color:rgba(255,255,255,.65)">${notes}</p>` : ''}<p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:13px;color:rgba(255,255,255,.5)">Questions? Call or WhatsApp: <a href="tel:07721070370" style="color:#d5a538;text-decoration:none">07721 070370</a></p>` });

  const operatorSms = `CONFIRMED (${booking.payment_method || 'cash'}) ${booking.customer_name}\n${route}\n${date} at ${time}\nPhone: ${booking.customer_phone}`;

  const operatorEmailHtml = emailLayout({ title: 'Payment Confirmed', body: `<p style="margin:0 0 4px;font-family:Inter,Arial,sans-serif;font-size:13px;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.05em">Customer</p><p style="margin:0 0 20px;font-family:Inter,Arial,sans-serif;font-size:16px;font-weight:700;color:#fff">${booking.customer_name} &nbsp;&middot;&nbsp; <a href="tel:${booking.customer_phone}" style="color:#d5a538;text-decoration:none">${booking.customer_phone}</a></p><p style="margin:0 0 4px;font-family:Inter,Arial,sans-serif;font-size:13px;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.05em">Journey</p>${emailJourneyHtml(booking)}${price ? `<p style="margin:0 0 ${receiptUrl ? '8px' : '0'};font-family:Inter,Arial,sans-serif;font-size:26px;font-weight:900;color:#d5a538">£${price}</p>` : ''}${receiptUrl ? `<p style="margin:0 0 16px"><a href="${receiptUrl}" style="color:#d5a538;font-family:Inter,Arial,sans-serif;font-size:14px;text-decoration:none">View Stripe receipt →</a></p>` : ''}<p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:rgba(255,255,255,.65)">Payment: <strong style="color:#d5a538">${method}</strong></p>` });

  const hasCustomerEmail = Boolean(booking.customer_email);
  const hasCustomerPhone = Boolean(booking.customer_phone);

  const logEntries = [];
  if (hasCustomerEmail) logEntries.push(['email', booking.customer_email]);
  else if (hasCustomerPhone) logEntries.push(['sms', normaliseUkPhone(booking.customer_phone)]);
  logEntries.push(['push', booking.customer_email || booking.customer_phone]);
  if (opEmail) logEntries.push(['email', opEmail]);

  await Promise.allSettled([
    // Customer: email-first, SMS fallback only if no email
    hasCustomerEmail
      ? sendEmail({ to: booking.customer_email, subject: `Booking Confirmed: EV Exec Transfer`, html: customerEmailHtml })
      : (hasCustomerPhone ? sendSMS(booking.customer_phone, customerSms) : null),
    // Operator: push + email primary, SMS fallback only if no email
    sendPushToOperator('Payment Confirmed', `${booking.customer_name} · ${route} on ${date}`, '/operator').catch(() => {}),
    opEmail ? sendEmail({ to: opEmail, subject: `Payment Confirmed: ${route}, ${date}`, html: operatorEmailHtml }) : null,
    !opEmail && process.env.OPERATOR_PHONE ? sendSMS(process.env.OPERATOR_PHONE, operatorSms) : null,
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
  else if (hasPhone) logEntries.push(['sms', normaliseUkPhone(booking.customer_phone)]);

  await Promise.allSettled([
    hasEmail
      ? sendEmail({ to: booking.customer_email, subject: 'EV Exec: Journey Unavailable', html: customerEmailHtml })
      : (hasPhone ? sendSMS(booking.customer_phone, customerSms) : null),
    logMany(booking.id, 'rejection', logEntries)
  ].filter(Boolean));
}

// Re-export channel primitives for backward compatibility
module.exports = { sendSMS, sendEmail, sendWhatsApp, sendPush, sendPushToOperator, whatsAppReady, sendConfirmations, sendRejectionNotice, normaliseUkPhone };
