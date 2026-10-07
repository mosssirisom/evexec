'use strict';

const { sendEmail } = require('../../lib/notify');
const { sendPushToCustomer } = require('../../lib/push');
const { emailLayout } = require('../../lib/emailLayout');
const { journeyLine, fmtDate, fmtTime, emailJourneyHtml, refBadgeHtml, paymentLine } = require('../../lib/format');
const { logMany } = require('../../lib/notifyLog');
const { sendOrQueue } = require('../../lib/notificationQueue');

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

// UK calendar date ('YYYY-MM-DD') for an instant.
function londonDateStr(date) {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  return `${p.year}-${p.month}-${p.day}`;
}

function daysBetween(fromDateStr, toDateStr) {
  return Math.round((Date.parse(toDateStr + 'T00:00:00Z') - Date.parse(fromDateStr + 'T00:00:00Z')) / 86400000);
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

// Batch-fetch driver name/vehicle for every assigned driver across a set of
// bookings, so reminders can say who's picking the customer up (this is the
// single reminder pipeline for every booking regardless of source -- see
// the removed duplicate in enqueue_operator_customer_notifications()).
async function getDriversByIds(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/drivers?id=in.(${unique.join(',')})&select=id,full_name,vehicle_registration,vehicle_model`,
    { headers: dbHeaders() }
  );
  if (!res.ok) return new Map();
  const rows = await res.json();
  return new Map(rows.map(d => [d.id, d]));
}

function driverClause(driversById, booking) {
  const driver = booking.assigned_driver_id ? driversById.get(booking.assigned_driver_id) : null;
  const first = driver?.full_name ? driver.full_name.trim().split(' ')[0] : null;
  if (!first) return '';
  const vehicle = driver.vehicle_model || 'vehicle';
  const reg = driver.vehicle_registration ? ` (registration ${driver.vehicle_registration})` : '';
  return ` Your driver, ${first}, will be in a ${vehicle}${reg}.`;
}

// Bookings that already have a logged reminder of this type never get a
// second one, even if they match the window on more than one cron run.
// Exception: a 24h reminder logged two or more UK days before travel doesn't
// count — it was sent too early (the old 0–48h window labelled those
// "tomorrow"), or the booking has since moved to a later date — so the
// customer still gets one on the day before. Rows with no timestamp count,
// so a missing column can never cause repeat sends.
async function alreadyReminded(due, type) {
  if (!due.length) return new Set();
  const travelDateById = new Map(due.map(({ booking }) => [booking.id, booking.travel_date]));
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/notification_log?booking_id=in.(${[...travelDateById.keys()].join(',')})&type=eq.${type}&select=*`,
    { headers: dbHeaders() }
  );
  if (!res.ok) return new Set();
  const rows = await res.json();
  const reminded = new Set();
  for (const row of rows) {
    const loggedAt = row.sent_at || row.created_at;
    const travelDate = travelDateById.get(row.booking_id);
    if (type === 'reminder_24h' && loggedAt && travelDate
        && daysBetween(londonDateStr(new Date(loggedAt)), travelDate) > 1) continue;
    reminded.add(row.booking_id);
  }
  return reminded;
}

// Due when the pickup is between minDays and maxDays away by UK calendar
// date (0 = today, 1 = tomorrow) and hasn't happened yet. Using dates, not
// hours, matters for a once-a-day cron: an early-morning pickup two days out
// is less than 48 hours away but is not "tomorrow".
function dueForReminder(list, now, todayLondon, minDays, maxDays) {
  return list
    .map(booking => {
      const dt = travelDateTimeUtc(booking.travel_date, booking.travel_time);
      const daysAway = booking.travel_date ? daysBetween(todayLondon, booking.travel_date) : null;
      return { booking, daysAway, upcoming: Boolean(dt) && dt.getTime() > now.getTime() };
    })
    .filter(({ daysAway, upcoming }) => upcoming && daysAway !== null && daysAway >= minDays && daysAway <= maxDays);
}

// Customer reminder SMS no longer goes through Twilio. Every customer with a
// phone number gets one (alongside the email, when there is one): the
// generated message is handed off to the assigned driver instead: a row is
// written here (status='pending'), a pg_cron
// sweep (send-customer-sms-reminder-push) push-notifies the driver, and
// the driver reviews + sends the SMS themselves from their own phone via
// the native Messages app on a dedicated reminder screen in the driver app.
// `Prefer: resolution=ignore-duplicates` against the (booking_id,
// reminder_type) unique constraint means a re-run of this cron within the
// same window never creates a second handoff for the same reminder.
async function handOffSmsToDriver(booking, message, type) {
  if (!booking.assigned_driver_id) {
    console.warn(`Reminder due for booking ${booking.id} has no assigned driver -- customer will not be reminded by SMS.`);
    return;
  }
  const reminderType = type === '7day' ? '7day' : '24hr';
  const res = await fetch(`${SUPABASE_URL}/rest/v1/driver_sms_reminders`, {
    method: 'POST',
    headers: dbHeaders({ Prefer: 'resolution=ignore-duplicates,return=minimal' }),
    body: JSON.stringify({
      booking_id: booking.id,
      driver_id: booking.assigned_driver_id,
      reminder_type: reminderType,
      customer_name: booking.customer_name || null,
      customer_phone: booking.customer_phone,
      travel_date: booking.travel_date || null,
      travel_time: booking.travel_time || null,
      message,
      status: 'pending'
    })
  });
  if (!res.ok) console.error(`Failed to create driver SMS reminder handoff for booking ${booking.id}:`, await res.text());
}

async function sendReminders(due, type, driversById) {
  let sent = 0;
  for (const { booking, daysAway } of due) {
    // Strip return leg so reminders only show details for this specific journey
    const leg       = { ...booking, return_journey: false };
    const route     = journeyLine(leg);
    const date      = fmtDate(booking.travel_date);
    const time      = fmtTime(booking.travel_time, booking.travel_date);
    const firstName = (booking.customer_name || 'there').split(' ')[0];
    const method    = paymentLine(booking);
    const daysText  = type === '7day' ? `in ${daysAway} days` : (daysAway === 0 ? 'today' : 'tomorrow');
    const driverTxt = driverClause(driversById, booking);

    const smsBody = type === '7day'
      ? `Hi ${firstName}, reminder: your EV Exec transfer is ${daysText}.\n\n${route}\n${date} at ${time}\nPayment: ${method}${driverTxt}\n\nQuestions: 07721 070370`
      : `Hi ${firstName}, reminder: your EV Exec transfer is ${daysText.toUpperCase()}!\n\n${route}\n${date} at ${time}\nPayment: ${method}${driverTxt}\n\nQuestions: 07721 070370`;

    const pushTitle = type === '7day' ? `Transfer in ${daysAway} Days` : `Transfer ${daysText === 'today' ? 'Today' : 'Tomorrow'}`;
    const pushBody  = `${route} ${daysText} at ${time}.`;

    const emailSubject = type === '7day'
      ? `Reminder: Your Transfer in ${daysAway} Days`
      : `Reminder: Your Transfer is ${daysText === 'today' ? 'Today' : 'Tomorrow'}`;

    const emailHtml = emailLayout({ title: 'Upcoming Transfer', body: `<p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:15px;color:#fff">Hi ${firstName},</p><p style="margin:0 0 20px;font-family:Inter,Arial,sans-serif;font-size:15px;color:rgba(255,255,255,.65);line-height:1.6">This is a friendly reminder that your airport transfer is <strong style="color:#fff">${daysText}</strong>.${driverTxt}</p>${refBadgeHtml(booking.ref)}${emailJourneyHtml(leg)}<p style="margin:0 0 20px;font-family:Inter,Arial,sans-serif;font-size:14px;color:rgba(255,255,255,.65)">Payment: <strong style="color:#fff">${method}</strong></p><p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:13px;color:rgba(255,255,255,.5)">Questions? Call or WhatsApp: <a href="tel:07721070370" style="color:#d5a538;text-decoration:none">07721 070370</a></p>` });

    const logType = type === '7day' ? 'reminder_7d' : 'reminder_24h';
    const hasEmail = Boolean(booking.customer_email);
    const hasPhone = Boolean(booking.customer_phone);
    const logEntries = [];
    if (hasEmail) logEntries.push(['email', booking.customer_email]);
    if (hasPhone && booking.assigned_driver_id) logEntries.push(['driver_sms_handoff', booking.assigned_driver_id]);
    logEntries.push(['push', booking.customer_email || booking.customer_phone]);

    await Promise.allSettled([
      // Both channels, independently: the email whenever there's an email on
      // file, and the SMS whenever there's a phone number, handed off to the
      // assigned driver to send from their own phone -- EV Exec no longer
      // sends customer reminder SMS via Twilio (see handOffSmsToDriver above).
      hasEmail
        ? sendOrQueue(() => sendEmail({ to: booking.customer_email, subject: emailSubject, html: emailHtml }), { booking_id: booking.id, type: logType, channel: 'email', recipient: booking.customer_email, subject: emailSubject, html: emailHtml })
        : null,
      hasPhone ? handOffSmsToDriver(booking, smsBody, type) : null,
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
    const today = londonDateStr(now);

    // Windows are ranges of UK calendar days rather than exact dates, so a
    // booking made just after today's run is still caught by the next run:
    // week-ahead reminders go out 5-7 days before travel, day-before
    // reminders on the day before (or the same day, if booked too late).
    const [candidates7, candidates1] = await Promise.all([
      getBookingsInRange(addDays(today, 5), addDays(today, 7)),
      getBookingsInRange(today, addDays(today, 1))
    ]);

    const due7 = dueForReminder(candidates7, now, today, 5, 7);
    const due1 = dueForReminder(candidates1, now, today, 0, 1);

    const [sentIds7, sentIds1] = await Promise.all([
      alreadyReminded(due7, 'reminder_7d'),
      alreadyReminded(due1, 'reminder_24h')
    ]);

    const pending7 = due7.filter(({ booking }) => !sentIds7.has(booking.id));
    const pending1 = due1.filter(({ booking }) => !sentIds1.has(booking.id));

    const driversById = await getDriversByIds([
      ...pending7.map(({ booking }) => booking.assigned_driver_id),
      ...pending1.map(({ booking }) => booking.assigned_driver_id)
    ]);

    const [sent7, sent1] = await Promise.all([
      sendReminders(pending7, '7day', driversById),
      sendReminders(pending1, '24hr', driversById)
    ]);

    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true, week7: sent7, day1: sent1 }));
  } catch (err) {
    console.error('Reminder trigger error:', err);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Internal error' }));
  }
};
