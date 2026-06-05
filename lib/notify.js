'use strict';

const { journeyLine, fmtDate, getPrice } = require('./format');
const { sendPushToCustomer } = require('./push');
const { logMany } = require('./notifyLog');

async function sendSMS(to, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from) { console.warn('Twilio not configured — SMS skipped'); return; }

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }).toString()
    }
  );
  if (!res.ok) console.error('SMS send error:', await res.text());
}

async function sendEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) { console.warn('Resend not configured — email skipped'); return; }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'EV Exec <bookings@evexec.co.uk>',
      to: Array.isArray(to) ? to : [to],
      subject,
      html
    })
  });
  if (!res.ok) console.error('Email send error:', await res.text());
}

async function sendConfirmations(booking, notes = '') {
  const route = journeyLine(booking);
  const date = fmtDate(booking.travel_date);
  const price = getPrice(booking);
  const method = booking.payment_method === 'cash' ? 'Cash on the day' : 'Paid by card';
  const firstName = (booking.customer_name || 'there').split(' ')[0];

  const customerSms = [
    `Hi ${firstName}, your EV Exec transfer is confirmed!`,
    '',
    route,
    `${date} at ${booking.travel_time || 'TBC'}`,
    `Payment: ${method}`,
    notes,
    '',
    'See you then! Questions: 07721 070370'
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
    <p style="margin:0 0 ${price ? '8px' : '16px'};color:rgba(255,255,255,.65)">${date} at ${booking.travel_time || 'TBC'} &nbsp;·&nbsp; ${booking.passengers} passenger(s)</p>
    ${price ? `<p style="margin:0 0 16px;font-size:1.3rem;font-weight:900;color:#d5a538">£${price}</p>` : ''}
    <p style="margin:0 0 20px;color:rgba(255,255,255,.65)">Payment: <strong style="color:#fff">${method}</strong></p>
    ${notes ? `<p style="margin:0 0 20px;color:rgba(255,255,255,.65)">${notes}</p>` : ''}
    <p style="color:rgba(255,255,255,.5);font-size:13px">Questions? Call or WhatsApp: <a href="tel:07721070370" style="color:#d5a538">07721 070370</a></p>
  </div>
</div>`;

  const operatorSms = `CONFIRMED (${booking.payment_method || 'cash'}) — ${booking.customer_name}\n${route}\n${date} at ${booking.travel_time || 'TBC'}\nPhone: ${booking.customer_phone}`;

  const logEntries = [];
  if (booking.customer_phone) logEntries.push(['sms', booking.customer_phone]);
  if (booking.customer_email) logEntries.push(['email', booking.customer_email]);
  logEntries.push(['push', booking.customer_email || booking.customer_phone]);

  await Promise.allSettled([
    booking.customer_phone ? sendSMS(booking.customer_phone, customerSms) : null,
    booking.customer_email ? sendEmail({
      to: booking.customer_email,
      subject: `Booking Confirmed — EV Exec Transfer`,
      html: customerEmailHtml
    }) : null,
    process.env.OPERATOR_PHONE ? sendSMS(process.env.OPERATOR_PHONE, operatorSms) : null,
    sendPushToCustomer(
      booking,
      'Transfer Confirmed — EV Exec',
      `${route} on ${date}. ${method}.`,
      '/booking?id=' + booking.id
    ),
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

  const logEntries = [];
  if (booking.customer_phone) logEntries.push(['sms', booking.customer_phone]);
  if (booking.customer_email) logEntries.push(['email', booking.customer_email]);

  await Promise.allSettled([
    booking.customer_phone ? sendSMS(booking.customer_phone, customerSms) : null,
    booking.customer_email ? sendEmail({
      to: booking.customer_email,
      subject: 'EV Exec — Journey Unavailable',
      html: customerEmailHtml
    }) : null,
    logMany(booking.id, 'rejection', logEntries)
  ].filter(Boolean));
}

module.exports = { sendSMS, sendEmail, sendConfirmations, sendRejectionNotice };
