'use strict';

const { journeyLine, fmtDate, getPrice } = require('./format');

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
    <p style="margin:0;color:rgba(255,255,255,.5);font-size:13px">Questions?
      <a href="tel:+447721070370" style="color:#d5a538;text-decoration:none">📞 Call: 07721 070370</a>
      &nbsp;&nbsp;|&nbsp;&nbsp;
      <a href="https://wa.me/447721070370" style="color:#25d366;text-decoration:none">💬 WhatsApp us</a>
    </p>
  </div>
</div>`;

  if (booking.customer_email) {
    await sendEmail({
      to: booking.customer_email,
      subject: `Booking Confirmed — EV Exec Transfer`,
      html: customerEmailHtml
    });
  }
}

async function sendRejectionNotice(booking) {
  const route = journeyLine(booking);
  const firstName = (booking.customer_name || 'there').split(' ')[0];
  const date = fmtDate(booking.travel_date);

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
    <p style="margin-top:20px;color:rgba(255,255,255,.5);font-size:13px">
      <a href="tel:+447721070370" style="color:#d5a538;text-decoration:none">📞 Call: 07721 070370</a>
      &nbsp;&nbsp;|&nbsp;&nbsp;
      <a href="https://wa.me/447721070370" style="color:#25d366;text-decoration:none">💬 WhatsApp us</a>
    </p>
  </div>
</div>`;

  if (booking.customer_email) {
    await sendEmail({
      to: booking.customer_email,
      subject: 'EV Exec — Journey Unavailable',
      html: customerEmailHtml
    });
  }
}

module.exports = { sendEmail, sendConfirmations, sendRejectionNotice };
