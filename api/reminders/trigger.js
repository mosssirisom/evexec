'use strict';

const { sendSMS, sendEmail } = require('../../lib/notify');
const { sendPushToCustomer } = require('../../lib/push');
const { journeyLine, fmtDate } = require('../../lib/format');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yoltkmhtxwluqxxpewbl.supabase.co';

function dbHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    'Content-Type': 'application/json',
    'apikey': key,
    'Authorization': `Bearer ${key}`
  };
}

async function getBookingsForDate(dateStr) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?travel_date=eq.${dateStr}&status=eq.Dispatched&select=*`,
    { headers: dbHeaders() }
  );
  if (!res.ok) return [];
  return res.json();
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function sendReminders(bookings, type) {
  let sent = 0;
  for (const booking of bookings) {
    const route     = journeyLine(booking);
    const date      = fmtDate(booking.travel_date);
    const firstName = (booking.customer_name || 'there').split(' ')[0];
    const method    = booking.payment_method === 'cash' ? 'Cash on the day' : 'Paid by card';
    const daysText  = type === '7day' ? 'in 7 days' : 'tomorrow';

    const smsBody = type === '7day'
      ? `Hi ${firstName}, reminder: your EV Exec transfer is in 7 days.\n\n${route}\n${date} at ${booking.travel_time || 'TBC'}\nPayment: ${method}\n\nQuestions: 07721 070370`
      : `Hi ${firstName}, reminder: your EV Exec transfer is TOMORROW!\n\n${route}\n${date} at ${booking.travel_time || 'TBC'}\nPayment: ${method}\n\nQuestions: 07721 070370`;

    const pushTitle = type === '7day' ? 'Transfer in 7 Days — EV Exec' : 'Transfer Tomorrow — EV Exec';
    const pushBody  = `${route} ${daysText} at ${booking.travel_time || 'TBC'}.`;

    const emailSubject = type === '7day'
      ? `Reminder: Your Transfer in 7 Days — EV Exec`
      : `Reminder: Your Transfer is Tomorrow — EV Exec`;

    const emailHtml = `
<div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto">
  <div style="background:#d5a538;padding:20px 28px;border-radius:12px 12px 0 0">
    <h1 style="margin:0;color:#06101c;font-size:1.2rem">Upcoming Transfer — EV Exec</h1>
  </div>
  <div style="background:#020813;color:#fff;padding:28px;border-radius:0 0 12px 12px">
    <p style="margin:0 0 6px">Hi ${firstName},</p>
    <p style="margin:0 0 20px;color:rgba(255,255,255,.65)">This is a friendly reminder that your airport transfer is <strong style="color:#fff">${daysText}</strong>.</p>
    <h2 style="margin:0 0 4px;color:#fff">${route}</h2>
    <p style="margin:0 0 16px;color:rgba(255,255,255,.65)">${date} at ${booking.travel_time || 'TBC'} &nbsp;·&nbsp; ${booking.passengers} passenger(s)</p>
    <p style="margin:0 0 20px;color:rgba(255,255,255,.65)">Payment: <strong style="color:#fff">${method}</strong></p>
    <p style="color:rgba(255,255,255,.5);font-size:13px">Questions? Call or WhatsApp: <a href="tel:07721070370" style="color:#d5a538">07721 070370</a></p>
  </div>
</div>`;

    await Promise.allSettled([
      booking.customer_phone ? sendSMS(booking.customer_phone, smsBody) : null,
      booking.customer_email ? sendEmail({ to: booking.customer_email, subject: emailSubject, html: emailHtml }) : null,
      sendPushToCustomer(booking, pushTitle, pushBody, '/booking?id=' + booking.id)
    ].filter(Boolean));
    sent++;
  }
  return sent;
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  const auth = req.headers['authorization'] || '';
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: 'Unauthorised' }));
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const in7   = addDays(today, 7);
    const in1   = addDays(today, 1);

    const [bookings7, bookings1] = await Promise.all([
      getBookingsForDate(in7),
      getBookingsForDate(in1)
    ]);

    const [sent7, sent1] = await Promise.all([
      sendReminders(bookings7, '7day'),
      sendReminders(bookings1, '24hr')
    ]);

    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true, week7: sent7, day1: sent1 }));
  } catch (err) {
    console.error('Reminder trigger error:', err);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Internal error' }));
  }
};
