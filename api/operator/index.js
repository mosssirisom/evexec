'use strict';

// Handles: /api/operator/accept, /api/operator/reject (HTML pages)
//          /api/operator/bookings (GET — admin list)
//          /api/operator/notify   (POST — send notification)
//          /api/operator/manage   (GET/POST — legacy alias)

const crypto = require('crypto');
const { dbGet, dbUpdate, isValidUUID } = require('../../lib/supabase');
const { sendSMS, sendEmail, sendRejectionNotice, sendWhatsApp, whatsAppReady } = require('../../lib/notify');
const { sendPushToCustomer } = require('../../lib/push');
const { verifyToken } = require('../../lib/token');
const { journeyLine, fmtDate, fmtTime, getPrice, emailJourneyHtml } = require('../../lib/format');
const { parseBody } = require('../../lib/parse');
const { operatorPage } = require('../../lib/pages');
const { emailLayout } = require('../../lib/emailLayout');
const { logMany } = require('../../lib/notifyLog');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yoltkmhtxwluqxxpewbl.supabase.co';

function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function dbHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };
}

function authOk(req) {
  const secret = req.headers['x-operator-secret'];
  const expected = process.env.OPERATOR_ACTION_SECRET;
  return expected && secret && secret.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(expected));
}

// ── Accept / Reject ────────────────────────────────────────────────────────

async function handleAction(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const path = (req.url || '').split('?')[0];
  const isReject = path.endsWith('/reject');
  const action = isReject ? 'reject' : 'accept';
  const { id, token } = req.query || {};

  if (!id || !token) { res.statusCode = 400; return res.end(operatorPage('Invalid Link', `<p>This ${action} link is missing required parameters.</p>`, false)); }
  if (!isValidUUID(id)) { res.statusCode = 400; return res.end(operatorPage('Invalid Link', '<p>This link contains an invalid booking ID.</p>', false)); }
  if (!verifyToken(id, action, token)) { res.statusCode = 403; return res.end(operatorPage('Invalid Token', '<p>This link is invalid or has expired.</p>', false)); }

  try {
    const booking = await dbGet('bookings', id);
    if (!booking) { res.statusCode = 404; return res.end(operatorPage('Not Found', '<p>No booking found with this ID.</p>', false)); }
    if (booking.status !== 'Unassigned') return res.end(operatorPage('Already Actioned', `<p>This booking has already been <strong>${booking.status}</strong>.</p>`, !isReject && ['Dispatched', 'En Route', 'Passenger On Board'].includes(booking.status)));

    const route = journeyLine(booking); const date = fmtDate(booking.travel_date);

    // GET: show confirmation page — prevents link scanners/previewers from auto-triggering
    if (req.method !== 'POST') {
      const btnColor = isReject ? '#ef4444' : '#d5a538';
      const btnTextColor = isReject ? '#fff' : '#06101c';
      const confirmUrl = `/api/operator/${action}?id=${id}&token=${encodeURIComponent(token)}`;
      const confirmLabel = isReject ? 'Reject Booking' : 'Accept Booking';
      const pageTitle = isReject ? 'Reject this booking?' : 'Accept this booking?';
      return res.end(operatorPage(pageTitle, `<p><strong>${esc(booking.customer_name)}</strong> &nbsp;·&nbsp; ${esc(booking.customer_phone)}</p><p>${esc(route)}<br>${esc(date)} at ${esc(booking.travel_time || 'TBC')}<br>${esc(booking.passengers)} passenger(s)${booking.luggage ? ', ' + esc(booking.luggage) : ''}</p><form method="POST" action="${confirmUrl}" style="margin-top:24px"><button type="submit" style="background:${btnColor};color:${btnTextColor};border:none;padding:16px 32px;border-radius:8px;font-size:1rem;font-weight:bold;cursor:pointer;min-width:180px">${confirmLabel}</button></form>`, !isReject));
    }

    // POST: perform the action
    if (isReject) {
      await dbUpdate('bookings', id, { status: 'Cancelled' });
      await sendRejectionNotice(booking);
      return res.end(operatorPage('Booking Rejected', `<p>Booking for <strong>${esc(booking.customer_name)}</strong> has been rejected.</p><p>${esc(route)}<br>${esc(date)}</p><p>The customer has been notified. No payment has been taken.</p>`, false));
    }

    await dbUpdate('bookings', id, { status: 'Dispatched' });
    const siteUrl = process.env.SITE_URL || 'https://evexec.co.uk';
    const paymentUrl = `${siteUrl}/booking?id=${id}`;
    const price = getPrice(booking);
    const firstName = (booking.customer_name || 'there').split(' ')[0];
    const time = fmtTime(booking.travel_time, booking.travel_date);
    const smsTxt = [`Hi ${firstName}, great news! EV Exec can take your transfer.`, '', route, `${date} at ${time}`, price ? `Price: £${price}` : '', '', 'Please choose your payment method to confirm:', paymentUrl, '', 'Questions? 07721 070370'].filter(l => l !== null).join('\n');
    const emailHtml = emailLayout({ title: 'Your EV Exec Transfer is Accepted', body: `<p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:15px;color:#fff">Hi ${firstName},</p><p style="margin:0 0 20px;font-family:Inter,Arial,sans-serif;font-size:15px;color:rgba(255,255,255,.65);line-height:1.6">Great news! Your airport transfer has been accepted. Please choose your payment method to confirm.</p>${emailJourneyHtml(booking)}${price ? `<p style="margin:0 0 24px;font-family:Inter,Arial,sans-serif;font-size:26px;font-weight:900;color:#d5a538">£${price}</p>` : ''}<a href="${paymentUrl}" style="display:block;background:#d5a538;color:#06101c;font-family:Inter,Arial,sans-serif;font-size:15px;font-weight:700;text-align:center;text-decoration:none;padding:14px 20px;border-radius:8px">Choose Payment Method</a><p style="margin-top:20px;font-family:Inter,Arial,sans-serif;font-size:13px;color:rgba(255,255,255,.5)">Questions? <a href="tel:07721070370" style="color:#d5a538;text-decoration:none">07721 070370</a></p>` });
    const acceptTasks = [];
    if (booking.customer_email) acceptTasks.push(sendEmail({ to: booking.customer_email, subject: `EV Exec Transfer Accepted: ${route}`, html: emailHtml }));
    else if (booking.customer_phone) acceptTasks.push(sendSMS(booking.customer_phone, smsTxt));
    await Promise.allSettled(acceptTasks);
    return res.end(operatorPage('Booking Accepted ✓', `<p>Booking for <strong>${esc(booking.customer_name)}</strong> accepted.</p><p>${esc(route)}<br>${esc(date)} at ${esc(booking.travel_time || 'TBC')}</p>${price ? `<p class="price">£${price}</p>` : ''}<p>The customer has been notified and sent a payment link.</p>`));
  } catch (err) { console.error('Operator action error:', err); res.statusCode = 500; return res.end(operatorPage('Error', '<p>Something went wrong. Please try again or contact support.</p>', false)); }
}

// ── Bookings list ──────────────────────────────────────────────────────────

async function listBookings(req, res) {
  res.setHeader('Content-Type', 'application/json');
  try {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const [bookingsRes, logsRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/bookings?travel_date=gte.${cutoffStr}&select=id,ref,customer_name,customer_phone,customer_email,travel_date,travel_time,status,payment_method,payment_status,journey_type,pickup_location,airport,dropoff_address,assigned_driver_id&order=travel_date.asc&limit=200`, { headers: dbHeaders() }),
      fetch(`${SUPABASE_URL}/rest/v1/notification_log?select=booking_id,type,channel,recipient,sent_at&order=sent_at.desc&limit=2000`, { headers: dbHeaders() })
    ]);
    if (!bookingsRes.ok) throw new Error('Failed to load bookings');
    const bookings = await bookingsRes.json();
    let logs = []; if (logsRes.ok) logs = await logsRes.json();
    const logsByBooking = {};
    for (const log of logs) { if (!logsByBooking[log.booking_id]) logsByBooking[log.booking_id] = []; logsByBooking[log.booking_id].push(log); }
    res.end(JSON.stringify(bookings.map(b => ({ ...b, notifications: logsByBooking[b.id] || [] }))));
  } catch (err) { console.error('Operator bookings error:', err); res.statusCode = 500; res.end(JSON.stringify({ error: 'Failed to load bookings' })); }
}

// ── Drivers list ───────────────────────────────────────────────────────────

async function listDrivers(req, res) {
  res.setHeader('Content-Type', 'application/json');
  try {
    const driversRes = await fetch(`${SUPABASE_URL}/rest/v1/drivers?select=id,name,vehicle,plate,is_online,status&order=name.asc`, { headers: dbHeaders() });
    if (!driversRes.ok) throw new Error('Failed to load drivers');
    const drivers = await driversRes.json();
    res.end(JSON.stringify(drivers));
  } catch (err) { console.error('Operator drivers error:', err); res.statusCode = 500; res.end(JSON.stringify({ error: 'Failed to load drivers' })); }
}

// ── Assign driver to booking ──────────────────────────────────────────────

async function assignDriver(req, res) {
  res.setHeader('Content-Type', 'application/json');
  let body; try { body = await parseBody(req); } catch { res.statusCode = 400; return res.end(JSON.stringify({ error: 'Invalid body' })); }
  const { booking_id, driver_id } = body;
  if (!booking_id || !isValidUUID(booking_id)) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'Valid booking_id required' })); }
  if (driver_id && !isValidUUID(driver_id)) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'Invalid driver_id' })); }
  try {
    const booking = await dbGet('bookings', booking_id);
    if (!booking) { res.statusCode = 404; return res.end(JSON.stringify({ error: 'Booking not found' })); }
    const driverIdValue = driver_id || null;
    await dbUpdate('bookings', booking_id, { assigned_driver_id: driverIdValue, driver_id: driverIdValue });
    res.end(JSON.stringify({ ok: true, booking_id, driver_id: driverIdValue }));
  } catch (err) { console.error('Operator assign error:', err); res.statusCode = 500; res.end(JSON.stringify({ error: 'Failed to assign driver' })); }
}

// ── Send notification ──────────────────────────────────────────────────────

async function sendNotification(req, res) {
  res.setHeader('Content-Type', 'application/json');
  let body; try { body = await parseBody(req); } catch { res.statusCode = 400; return res.end(JSON.stringify({ error: 'Invalid body' })); }
  const { booking_id, channels, message_type } = body;
  if (!booking_id || !channels || !channels.length) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'booking_id and channels required' })); }
  const booking = await dbGet('bookings', booking_id);
  if (!booking) { res.statusCode = 404; return res.end(JSON.stringify({ error: 'Booking not found' })); }
  const route = journeyLine(booking); const date = fmtDate(booking.travel_date);
  const time = fmtTime(booking.travel_time, booking.travel_date);
  const firstName = (booking.customer_name || 'there').split(' ')[0];
  const method = booking.payment_method === 'cash' ? 'Cash on the day' : 'Paid by card';
  const isReminder = (message_type || 'manual') === 'manual_reminder';
  const smsText = isReminder ? `Hi ${firstName}, a reminder from EV Exec about your upcoming transfer.\n\n${route}\n${date} at ${time}\nPayment: ${method}\n\nQuestions: 07721 070370` : `Hi ${firstName}, your EV Exec transfer is confirmed!\n\n${route}\n${date} at ${time}\nPayment: ${method}\n\nQuestions: 07721 070370`;
  const emailSubject = isReminder ? `Reminder: Your EV Exec Transfer on ${date}` : `Transfer Confirmed`;
  const emailHtml = emailLayout({ title: isReminder ? 'Upcoming Transfer' : 'Transfer Confirmed', body: `<p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:15px;color:#fff">Hi ${firstName},</p><p style="margin:0 0 20px;font-family:Inter,Arial,sans-serif;font-size:15px;color:rgba(255,255,255,.65);line-height:1.6">${isReminder ? 'A reminder about your upcoming EV Exec airport transfer.' : 'Your airport transfer is confirmed.'}</p>${emailJourneyHtml(booking)}<p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:14px;color:rgba(255,255,255,.65)">Payment: <strong style="color:#fff">${method}</strong></p>` });
  const tasks = []; const logEntries = [];
  if (channels.includes('sms') && booking.customer_phone) { tasks.push(sendSMS(booking.customer_phone, smsText)); logEntries.push(['sms', booking.customer_phone]); }
  if (channels.includes('whatsapp') && whatsAppReady(booking)) { tasks.push(sendWhatsApp(booking.customer_phone, smsText)); logEntries.push(['whatsapp', booking.customer_phone]); }
  if (channels.includes('email') && booking.customer_email) { tasks.push(sendEmail({ to: booking.customer_email, subject: emailSubject, html: emailHtml })); logEntries.push(['email', booking.customer_email]); }
  if (channels.includes('push')) { tasks.push(sendPushToCustomer(booking, isReminder ? 'Upcoming Transfer' : 'Transfer Confirmed', `${route} on ${date}`, '/booking?id=' + booking.id)); logEntries.push(['push', booking.customer_email || booking.customer_phone]); }
  if (!tasks.length) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'No valid channels for this booking' })); }
  tasks.push(logMany(booking_id, message_type || 'manual', logEntries));
  await Promise.allSettled(tasks);
  res.end(JSON.stringify({ ok: true, sent: logEntries.map(([ch]) => ch) }));
}

// ── Router ─────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  const path = (req.url || '').split('?')[0];

  if (path.endsWith('/accept') || path.endsWith('/reject')) return handleAction(req, res);

  res.setHeader('Content-Type', 'application/json');
  if (!authOk(req)) { res.statusCode = 401; return res.end(JSON.stringify({ error: 'Unauthorised' })); }

  if ((path.endsWith('/bookings') || path.endsWith('/manage')) && req.method === 'GET') return listBookings(req, res);
  if (path.endsWith('/drivers') && req.method === 'GET') return listDrivers(req, res);
  if (path.endsWith('/assign') && req.method === 'POST') return assignDriver(req, res);
  if ((path.endsWith('/notify') || path.endsWith('/manage')) && req.method === 'POST') return sendNotification(req, res);

  res.statusCode = 404; res.end(JSON.stringify({ error: 'Not found' }));
};
