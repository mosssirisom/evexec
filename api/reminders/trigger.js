'use strict';

const { sendSMS, sendEmail } = require('../../lib/notify');
const { sendPushToCustomer } = require('../../lib/push');
const { emailLayout } = require('../../lib/emailLayout');
const { journeyLine, fmtDate, fmtTime, emailJourneyHtml, refBadgeHtml } = require('../../lib/format');
const { logMany } = require('../../lib/notifyLog');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yoltkmhtxwluqxxpewbl.supabase.co';

function dbHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    'Content-Type': 'application/json',
    'apikey': key,
    'Authorization': `Bearer ${key}`
  };
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Travel dates/times are stored as UK local wall-clock time. Resolve the
// actual UTC instant they refer to, accounting for BST/GMT, so reminder
// windows are correct year-round rather than off by an hour in summer.
function londonOffsetMinutes(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/London', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(date).reduce((a, p) => { a[p.type] = p.value; return a; }, {});
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return (asUtc - date.getTime()) / 60000;
}

function travelDateTimeUtc(dateStr, timeStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const match = String(timeStr || '00:00').match(/^(\d{1,2}):(\d{2})/);
  const hh = match ? Number(match[1]) : 0, mm = match ? Number(match[2]) : 0;
  const guessUtc = Date.UTC(y, m - 1, d, hh, mm);
  const offset = londonOffsetMinutes(new Date(guessUtc));
  return new Date(guessUtc - offset * 60000);
}

async function getBookingsInRange(fromDateStr, toDateStr) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?travel_date=gte.${fromDateStr}&travel_date=lte.${toDateStr}&status=eq.Dispatched&select=*`,
    { headers: dbHeaders() }
  );
  if (!res.ok) return [];
  return res.json();
}

// Bookings that already have a logged reminder of this type never get a
// second one, even if they match the window on more than one cron run.
async function alreadyReminded(bookingIds, type) {
  if (!bookingIds.length) return new Set();
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/notification_log?booking_id=in.(${bookingIds.join(',')})&type=eq.${type}&select=booking_id`,
    { headers: dbHeaders() }
  );
  if (!res.ok) return new Set();
  const rows = await res.json();
  return new Set(rows.map(r => r.booking_id));
}

// Widen the calendar-date scan well beyond the target window, then use the
// real travel datetime (with hoursOut) to decide who's actually due. This
// means a booking created at any time still gets caught on the very next
// cron run once it enters the window — nothing depends on when it was made.
function dueForReminder(list, now, minHours, maxHours) {
  return list
    .map(booking => {
      const dt = travelDateTimeUtc(booking.travel_date, booking.travel_time);
      const hoursOut = dt ? (dt.getTime() - now.getTime()) / 3600000 : null;
      return { booking, hoursOut };
    })
    .filter(({ hoursOut }) => hoursOut !== null && hoursOut > 0 && hoursOut >= minHours && hoursOut <= maxHours);
}

async function sendReminders(due, type) {
  let sent = 0;
  for (const { booking, hoursOut } of due) {
    // Strip return leg so reminders only show details for this specific journey
    const leg       = { ...booking, return_journey: false };
    const route     = journeyLine(leg);
    const date      = fmtDate(booking.travel_date);
    const time      = fmtTime(booking.travel_time, booking.travel_date);
    const firstName = (booking.customer_name || 'there').split(' ')[0];
    const method    = booking.payment_method === 'cash' ? 'Cash on the day' : 'Paid by card';
    const daysText  = type === '7day' ? 'in 7 days' : (hoursOut <= 15 ? 'today' : 'tomorrow');

    const smsBody = type === '7day'
      ? `Hi ${firstName}, reminder: your EV Exec transfer is in 7 days.\n\n${route}\n${date} at ${time}\nPayment: ${method}\n\nQuestions: 07721 070370`
      : `Hi ${firstName}, reminder: your EV Exec transfer is ${daysText.toUpperCase()}!\n\n${route}\n${date} at ${time}\nPayment: ${method}\n\nQuestions: 07721 070370`;

    const pushTitle = type === '7day' ? 'Transfer in 7 Days' : `Transfer ${daysText === 'today' ? 'Today' : 'Tomorrow'}`;
    const pushBody  = `${route} ${daysText} at ${time}.`;

    const emailSubject = type === '7day'
      ? `Reminder: Your Transfer in 7 Days`
      : `Reminder: Your Transfer is ${daysText === 'today' ? 'Today' : 'Tomorrow'}`;

    const emailHtml = emailLayout({ title: 'Upcoming Transfer', body: `<p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:15px;color:#fff">Hi ${firstName},</p><p style="margin:0 0 20px;font-family:Inter,Arial,sans-serif;font-size:15px;color:rgba(255,255,255,.65);line-height:1.6">This is a friendly reminder that your airport transfer is <strong style="color:#fff">${daysText}</strong>.</p>${refBadgeHtml(booking.ref)}${emailJourneyHtml(leg)}<p style="margin:0 0 20px;font-family:Inter,Arial,sans-serif;font-size:14px;color:rgba(255,255,255,.65)">Payment: <strong style="color:#fff">${method}</strong></p><p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:13px;color:rgba(255,255,255,.5)">Questions? Call or WhatsApp: <a href="tel:07721070370" style="color:#d5a538;text-decoration:none">07721 070370</a></p>` });

    const logType = type === '7day' ? 'reminder_7d' : 'reminder_24h';
    const hasEmail = Boolean(booking.customer_email);
    const hasPhone = Boolean(booking.customer_phone);
    const logEntries = [];
    if (hasEmail) logEntries.push(['email', booking.customer_email]);
    else if (hasPhone) logEntries.push(['sms', booking.customer_phone]);
    logEntries.push(['push', booking.customer_email || booking.customer_phone]);

    await Promise.allSettled([
      // Email primary, SMS fallback only when there's no email on file
      hasEmail
        ? sendEmail({ to: booking.customer_email, subject: emailSubject, html: emailHtml })
        : (hasPhone ? sendSMS(booking.customer_phone, smsBody) : null),
      sendPushToCustomer(booking, pushTitle, pushBody, '/booking?id=' + booking.id),
      logMany(booking.id, logType, logEntries)
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
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    // Scan windows are deliberately wider than the target offset — with a
    // once-a-day cron, a booking made just after today's run must still be
    // caught by tomorrow's run instead of falling out of an exact-date match.
    const [candidates7, candidates1] = await Promise.all([
      getBookingsInRange(addDays(today, 5), addDays(today, 8)),   // ~5-8 days out
      getBookingsInRange(today, addDays(today, 2))                // up to ~48h out
    ]);

    const due7 = dueForReminder(candidates7, now, 24 * 5, 24 * 8);
    const due1 = dueForReminder(candidates1, now, 0, 48);

    const [sentIds7, sentIds1] = await Promise.all([
      alreadyReminded(due7.map(({ booking }) => booking.id), 'reminder_7d'),
      alreadyReminded(due1.map(({ booking }) => booking.id), 'reminder_24h')
    ]);

    const pending7 = due7.filter(({ booking }) => !sentIds7.has(booking.id));
    const pending1 = due1.filter(({ booking }) => !sentIds1.has(booking.id));

    const [sent7, sent1] = await Promise.all([
      sendReminders(pending7, '7day'),
      sendReminders(pending1, '24hr')
    ]);

    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true, week7: sent7, day1: sent1 }));
  } catch (err) {
    console.error('Reminder trigger error:', err);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Internal error' }));
  }
};
