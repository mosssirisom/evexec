'use strict';

const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yoltkmhtxwluqxxpewbl.supabase.co';

function dbHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { 'Content-Type': 'application/json', 'apikey': key, 'Authorization': `Bearer ${key}` };
}

function authOk(req) {
  const secret   = req.headers['x-operator-secret'];
  const expected = process.env.OPERATOR_ACTION_SECRET;
  return expected && secret && secret.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(expected));
}

// ── GET /api/operator/bookings ─────────────────────────────────────────────

async function listBookings(req, res) {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const [bookingsRes, logsRes] = await Promise.all([
      fetch(
        `${SUPABASE_URL}/rest/v1/bookings?travel_date=gte.${cutoffStr}&select=id,ref,customer_name,customer_phone,customer_email,travel_date,travel_time,status,payment_method,payment_status,journey_type,pickup_location,airport,dropoff_address&order=travel_date.asc&limit=200`,
        { headers: dbHeaders() }
      ),
      fetch(
        `${SUPABASE_URL}/rest/v1/notification_log?select=booking_id,type,channel,recipient,sent_at&order=sent_at.desc&limit=2000`,
        { headers: dbHeaders() }
      )
    ]);

    if (!bookingsRes.ok) throw new Error('Failed to load bookings');

    const bookings = await bookingsRes.json();
    let logs = [];
    if (logsRes.ok) logs = await logsRes.json();

    const logsByBooking = {};
    for (const log of logs) {
      if (!logsByBooking[log.booking_id]) logsByBooking[log.booking_id] = [];
      logsByBooking[log.booking_id].push(log);
    }

    const result = bookings.map(b => ({ ...b, notifications: logsByBooking[b.id] || [] }));
    res.statusCode = 200;
    res.end(JSON.stringify(result));
  } catch (err) {
    console.error('Operator bookings error:', err);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Failed to load bookings' }));
  }
}

// ── POST /api/operator/notify ──────────────────────────────────────────────

const { dbGet } = require('../../lib/supabase');
const { sendSMS, sendEmail } = require('../../lib/notify');
const { sendPushToCustomer } = require('../../lib/push');
const { logMany } = require('../../lib/notifyLog');
const { journeyLine, fmtDate } = require('../../lib/format');
const { parseBody } = require('../../lib/parse');

async function sendNotification(req, res) {
  let body;
  try { body = await parseBody(req); }
  catch { res.statusCode = 400; return res.end(JSON.stringify({ error: 'Invalid body' })); }

  const { booking_id, channels, message_type } = body;
  if (!booking_id || !channels || !channels.length) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'booking_id and channels required' }));
  }

  const booking = await dbGet('bookings', booking_id);
  if (!booking) {
    res.statusCode = 404;
    return res.end(JSON.stringify({ error: 'Booking not found' }));
  }

  const route      = journeyLine(booking);
  const date       = fmtDate(booking.travel_date);
  const firstName  = (booking.customer_name || 'there').split(' ')[0];
  const method     = booking.payment_method === 'cash' ? 'Cash on the day' : 'Paid by card';
  const type       = message_type || 'manual';
  const isReminder = type === 'manual_reminder';

  const smsText = isReminder
    ? `Hi ${firstName}, a reminder from EV Exec about your upcoming transfer.\n\n${route}\n${date} at ${booking.travel_time || 'TBC'}\nPayment: ${method}\n\nQuestions: 07721 070370`
    : `Hi ${firstName}, your EV Exec transfer is confirmed!\n\n${route}\n${date} at ${booking.travel_time || 'TBC'}\nPayment: ${method}\n\nQuestions: 07721 070370`;

  const emailSubject = isReminder
    ? `Reminder: Your EV Exec Transfer — ${date}`
    : `Transfer Confirmed — EV Exec`;

  const emailHtml = `
<div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto">
  <div style="background:#d5a538;padding:20px 28px;border-radius:12px 12px 0 0">
    <h1 style="margin:0;color:#06101c;font-size:1.2rem">${isReminder ? 'Upcoming Transfer — EV Exec' : 'Transfer Confirmed — EV Exec'}</h1>
  </div>
  <div style="background:#020813;color:#fff;padding:28px;border-radius:0 0 12px 12px">
    <p style="margin:0 0 6px">Hi ${firstName},</p>
    <p style="margin:0 0 20px;color:rgba(255,255,255,.65)">${isReminder ? 'This is a reminder about your upcoming airport transfer.' : 'Your airport transfer is confirmed. We look forward to seeing you.'}</p>
    <h2 style="margin:0 0 4px;color:#fff">${route}</h2>
    <p style="margin:0 0 16px;color:rgba(255,255,255,.65)">${date} at ${booking.travel_time || 'TBC'} &nbsp;·&nbsp; ${booking.passengers || 1} passenger(s)</p>
    <p style="margin:0 0 20px;color:rgba(255,255,255,.65)">Payment: <strong style="color:#fff">${method}</strong></p>
    <p style="color:rgba(255,255,255,.5);font-size:13px">Questions? Call or WhatsApp: <a href="tel:07721070370" style="color:#d5a538">07721 070370</a></p>
  </div>
</div>`;

  const pushTitle = isReminder ? 'Upcoming Transfer — EV Exec' : 'Transfer Confirmed — EV Exec';
  const pushBody  = `${route} on ${date} at ${booking.travel_time || 'TBC'}.`;

  const tasks = [];
  const logEntries = [];

  if (channels.includes('sms') && booking.customer_phone) {
    tasks.push(sendSMS(booking.customer_phone, smsText));
    logEntries.push(['sms', booking.customer_phone]);
  }
  if (channels.includes('email') && booking.customer_email) {
    tasks.push(sendEmail({ to: booking.customer_email, subject: emailSubject, html: emailHtml }));
    logEntries.push(['email', booking.customer_email]);
  }
  if (channels.includes('push')) {
    tasks.push(sendPushToCustomer(booking, pushTitle, pushBody, '/booking?id=' + booking.id));
    logEntries.push(['push', booking.customer_email || booking.customer_phone]);
  }

  if (!tasks.length) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'No valid channels for this booking (missing phone/email?)' }));
  }

  tasks.push(logMany(booking_id, type, logEntries));
  await Promise.allSettled(tasks);

  res.statusCode = 200;
  res.end(JSON.stringify({ ok: true, sent: logEntries.map(([ch]) => ch) }));
}

// ── Router ─────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (!authOk(req)) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: 'Unauthorised' }));
  }

  if (req.method === 'GET') return listBookings(req, res);
  if (req.method === 'POST') return sendNotification(req, res);

  res.statusCode = 405;
  res.end(JSON.stringify({ error: 'Method not allowed' }));
};
