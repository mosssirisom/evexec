'use strict';

const { sendPushToCustomer } = require('./push');

function normaliseUkPhone(input) {
  if (!input) return '';
  let phone = String(input).trim().replace(/[\s().-]/g, '');
  if (phone.startsWith('00')) phone = '+' + phone.slice(2);
  if (phone.startsWith('07')) phone = '+44' + phone.slice(1);
  if (phone.startsWith('447')) phone = '+' + phone;
  return phone;
}

async function sendSMS(to, body) {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from  = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from) throw new Error('Twilio not configured — SMS not sent');

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`
      },
      body: new URLSearchParams({ To: normaliseUkPhone(to), From: normaliseUkPhone(from) || from, Body: body }).toString()
    }
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`Twilio SMS error ${res.status}: ${text}`);
  return text;
}

async function sendWhatsApp(to, body) {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from  = process.env.WHATSAPP_FROM;
  if (!sid || !token || !from) throw new Error('WhatsApp not configured — message not sent');

  const normTo = normaliseUkPhone(to);
  const waTo   = normTo.startsWith('whatsapp:') ? normTo : `whatsapp:${normTo}`;
  const waFrom = from.startsWith('whatsapp:') ? from : `whatsapp:${from}`;

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`
      },
      body: new URLSearchParams({ To: waTo, From: waFrom, Body: body }).toString()
    }
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`Twilio WhatsApp error ${res.status}: ${text}`);
  return text;
}

async function sendEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) throw new Error('Resend not configured — email not sent');

  const from = (process.env.RESEND_FROM || 'EV Exec <bookings@evexec.co.uk>').trim();
  const recipients = (Array.isArray(to) ? to : [to]).map(addr => String(addr).trim()).filter(Boolean);
  if (!recipients.length) throw new Error('sendEmail: no valid recipient');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from, to: recipients, subject, html })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Email send error ${res.status}: ${text}`);
  return text;
}

async function sendPush(booking, title, body, url) {
  return sendPushToCustomer(booking, title, body, url);
}

// Returns true when WhatsApp can be used for this booking
function whatsAppReady(booking) {
  return Boolean(
    booking.customer_phone &&
    booking.contact_method === 'WhatsApp' &&
    process.env.WHATSAPP_FROM
  );
}

module.exports = { sendEmail, sendSMS, sendWhatsApp, sendPush, whatsAppReady, normaliseUkPhone };
