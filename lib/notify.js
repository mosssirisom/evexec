'use strict';

const { getPrice } = require('./format');
const { buildConfirmEmail, buildRejectEmail } = require('./email-templates');

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
  const price = getPrice(booking);
  const { journeyLine } = require('./format');
  const route = journeyLine(booking);

  if (booking.customer_email) {
    await sendEmail({
      to: booking.customer_email,
      subject: `Booking Confirmed — EV Exec Transfer`,
      html: buildConfirmEmail(booking, notes, price)
    });
  }
}

async function sendRejectionNotice(booking) {
  const { journeyLine } = require('./format');
  const route = journeyLine(booking);

  if (booking.customer_email) {
    await sendEmail({
      to: booking.customer_email,
      subject: 'EV Exec — Journey Unavailable',
      html: buildRejectEmail(booking)
    });
  }
}

module.exports = { sendEmail, sendConfirmations, sendRejectionNotice };
