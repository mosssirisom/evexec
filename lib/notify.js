'use strict';

const { journeyLine, fmtDate, fmtTime, getPrice } = require('./format');
const { generateToken } = require('./token');
const { logMany } = require('./notifyLog');
const { sendEmail, sendSMS, sendWhatsApp, sendPush, whatsAppReady, normaliseUkPhone } = require('./channels');

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

  const customerEmailHtml = `
<div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto">
  <div style="background:#d5a538;padding:20px 28px;border-radius:12px 12px 0 0">
    <h1 style="margin:0;color:#06101c;font-size:1.2rem">Booking Confirmed — EV Exec</h1>
  </div>
  <div style="background:#020813;color:#fff;padding:28px;border-radius:0 0 12px 12px">
    <p style="margin:0 0 6px">Hi ${firstName},</p>
    <p style="margin:0 0 20px;color:rgba(255,255,255,.65)">Your airport transfer is confirmed. We look forward to seeing you.</p>
    <h2 style="margin:0 0 4px;color:#fff">${route}</h2>
    <p style="margin:0 0 ${price ? '8px' : '16px'};color:rgba(255,255,255,.65)">${date} at ${time} &nbsp;·&nbsp; ${booking.passengers} passenger(s)</p>
    ${price ? `<p style="margin:0 0 16px;font-size:1.3rem;font-weight:900;color:#d5a538">£${price}</p>` : ''}
    <p style="margin:0 0 ${receiptUrl ? '8px' : '20px'};color:rgba(255,255,255,.65)">Payment: <strong style="color:#fff">${method}</strong></p>
    ${receiptUrl ? `<p style="margin:0 0 20px"><a href="${receiptUrl}" style="color:#d5a538;font-size:14px;text-decoration:none">View payment receipt →</a></p>` : ''}
    ${notes ? `<p style="margin:0 0 20px;color:rgba(255,255,255,.65)">${notes}</p>` : ''}
    <p style="color:rgba(255,255,255,.5);font-size:13px">Questions? Call or WhatsApp: <a href="tel:07721070370" style="color:#d5a538">07721 070370</a></p>
  </div>
</div>`;

  const operatorSms = `CONFIRMED (${booking.payment_method || 'cash'}) — ${booking.customer_name}\n${route}\n${date} at ${time}\nPhone: ${booking.customer_phone}`;

  const operatorEmailHtml = `
<div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto">
  <div style="background:#d5a538;padding:20px 28px;border-radius:12px 12px 0 0">
    <h1 style="margin:0;color:#06101c;font-size:1.2rem">Payment Confirmed — EV Exec</h1>
  </div>
  <div style="background:#020813;color:#fff;padding:28px;border-radius:0 0 12px 12px">
    <p style="margin:0 0 4px;color:rgba(255,255,255,.65)">Customer: <strong style="color:#fff">${booking.customer_name}</strong></p>
    <p style="margin:0 0 16px;color:rgba(255,255,255,.65)">Phone: <strong style="color:#fff">${booking.customer_phone}</strong></p>
    <h2 style="margin:0 0 4px;color:#fff">${route}</h2>
    <p style="margin:0 0 16px;color:rgba(255,255,255,.65)">${date} at ${time} &nbsp;·&nbsp; ${booking.passengers} passenger(s)</p>
    <p style="margin:0 0 8px">Payment: <strong style="color:#d5a538">${method}</strong></p>
    ${price ? `<p style="margin:0 0 ${receiptUrl ? '8px' : '0'};font-size:1.2rem;font-weight:900;color:#d5a538">£${price}</p>` : ''}
    ${receiptUrl ? `<p style="margin:0"><a href="${receiptUrl}" style="color:#d5a538;font-size:14px;text-decoration:none">View Stripe receipt →</a></p>` : ''}
  </div>
</div>`;

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
      ? sendEmail({ to: booking.customer_email, subject: `Booking Confirmed — EV Exec Transfer`, html: customerEmailHtml })
      : (hasCustomerPhone ? sendSMS(booking.customer_phone, customerSms) : null),
    // Operator: unchanged — always SMS + email
    process.env.OPERATOR_PHONE ? sendSMS(process.env.OPERATOR_PHONE, operatorSms) : null,
    opEmail ? sendEmail({ to: opEmail, subject: `Payment Confirmed: ${route} — ${date}`, html: operatorEmailHtml }) : null,
    sendPush(booking, 'Transfer Confirmed — EV Exec', `${route} on ${date}. ${method}.`, '/booking?id=' + booking.id),
    logMany(booking.id, 'confirmation', logEntries)
  ].filter(Boolean));
}

async function sendRejectionNotice(booking) {
  const route = journeyLine(booking);
  const firstName = (booking.customer_name || 'there').split(' ')[0];
  const date = fmtDate(booking.travel_date);

  const customerSms = `Hi ${firstName}, unfortunately EV Exec is unavailable for your journey on ${date}.\n\nNo payment has been taken. Sorry for any inconvenience.\n\nQuestions: 07721 070370`;

  const customerEmailHtml = `
<div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto">
  <div style="background:#374151;padding:20px 28px;border-radius:12px 12px 0 0">
    <h1 style="margin:0;color:#fff;font-size:1.2rem">Journey Unavailable — EV Exec</h1>
  </div>
  <div style="background:#020813;color:#fff;padding:28px;border-radius:0 0 12px 12px">
    <p style="margin:0 0 6px">Hi ${firstName},</p>
    <p style="margin:0 0 16px;color:rgba(255,255,255,.65)">Unfortunately, EV Exec is unable to cover your requested journey. We're sorry for any inconvenience caused.</p>
    <p style="margin:0 0 4px;color:rgba(255,255,255,.5);font-size:13px">Requested journey</p>
    <p style="margin:0 0 16px">${route} &nbsp;·&nbsp; ${date}</p>
    <p style="color:rgba(255,255,255,.65);font-size:14px">No payment has been taken. If you have any questions, please don't hesitate to get in touch.</p>
    <p style="margin-top:20px;color:rgba(255,255,255,.5);font-size:13px">Call or WhatsApp: <a href="tel:07721070370" style="color:#d5a538">07721 070370</a></p>
  </div>
</div>`;

  const hasEmail = Boolean(booking.customer_email);
  const hasPhone = Boolean(booking.customer_phone);

  const logEntries = [];
  if (hasEmail) logEntries.push(['email', booking.customer_email]);
  else if (hasPhone) logEntries.push(['sms', normaliseUkPhone(booking.customer_phone)]);

  await Promise.allSettled([
    hasEmail
      ? sendEmail({ to: booking.customer_email, subject: 'EV Exec — Journey Unavailable', html: customerEmailHtml })
      : (hasPhone ? sendSMS(booking.customer_phone, customerSms) : null),
    logMany(booking.id, 'rejection', logEntries)
  ].filter(Boolean));
}

// Re-export channel primitives for backward compatibility
module.exports = { sendSMS, sendEmail, sendWhatsApp, sendPush, whatsAppReady, sendConfirmations, sendRejectionNotice, normaliseUkPhone };
