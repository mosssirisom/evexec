'use strict';

// Handles: /api/operator/accept, /api/operator/reject (HTML pages opened from
// the signed links in the operator's new-booking email).
//
// The secret-gated /bookings, /drivers, /assign, /notify and /manage routes
// served the old /operator page, retired 2026-10-04 (the Operator app does
// all of this now).

const { dbGet, dbUpdate, isValidUUID } = require('../../lib/supabase');
const { sendSMS, sendEmail, sendRejectionNotice } = require('../../lib/notify');
const { verifyToken } = require('../../lib/token');
const { journeyLine, fmtDate, fmtTime, getPrice, emailJourneyHtml, refBadgeHtml, singleLineSubject } = require('../../lib/format');
const { operatorPage } = require('../../lib/pages');
const { emailLayout } = require('../../lib/emailLayout');
const { sendOrQueue } = require('../../lib/notificationQueue');

function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
    const emailHtml = emailLayout({ title: 'Your EV Exec Transfer is Accepted', body: `<p style="margin:0 0 6px;font-family:Inter,Arial,sans-serif;font-size:15px;color:#fff">Hi ${firstName},</p><p style="margin:0 0 20px;font-family:Inter,Arial,sans-serif;font-size:15px;color:rgba(255,255,255,.65);line-height:1.6">Great news! Your airport transfer has been accepted. Please choose your payment method to confirm.</p>${refBadgeHtml(booking.ref)}${emailJourneyHtml(booking)}${price ? `<p style="margin:0 0 24px;font-family:Inter,Arial,sans-serif;font-size:26px;font-weight:900;color:#d5a538">£${price}</p>` : ''}<a href="${paymentUrl}" style="display:block;background:#d5a538;color:#06101c;font-family:Inter,Arial,sans-serif;font-size:15px;font-weight:700;text-align:center;text-decoration:none;padding:14px 20px;border-radius:8px">Choose Payment Method</a><p style="margin-top:20px;font-family:Inter,Arial,sans-serif;font-size:13px;color:rgba(255,255,255,.5)">Questions? <a href="tel:07721070370" style="color:#d5a538;text-decoration:none">07721 070370</a></p>` });
    const acceptTasks = [];
    const acceptSubject = singleLineSubject(`EV Exec Transfer Accepted: ${route}`);
    if (booking.customer_email) acceptTasks.push(sendOrQueue(() => sendEmail({ to: booking.customer_email, subject: acceptSubject, html: emailHtml }), { booking_id: booking.id, type: 'accepted', channel: 'email', recipient: booking.customer_email, subject: acceptSubject, html: emailHtml }));
    else if (booking.customer_phone) acceptTasks.push(sendOrQueue(() => sendSMS(booking.customer_phone, smsTxt), { booking_id: booking.id, type: 'accepted', channel: 'sms', recipient: booking.customer_phone, body: smsTxt }));
    await Promise.allSettled(acceptTasks);
    return res.end(operatorPage('Booking Accepted ✓', `<p>Booking for <strong>${esc(booking.customer_name)}</strong> accepted.</p><p>${esc(route)}<br>${esc(date)} at ${esc(booking.travel_time || 'TBC')}</p>${price ? `<p class="price">£${price}</p>` : ''}<p>The customer has been notified and sent a payment link.</p>`));
  } catch (err) { console.error('Operator action error:', err); res.statusCode = 500; return res.end(operatorPage('Error', '<p>Something went wrong. Please try again or contact support.</p>', false)); }
}

// ── Router ─────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  const path = (req.url || '').split('?')[0];
  if (path.endsWith('/accept') || path.endsWith('/reject')) return handleAction(req, res);
  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: 'Not found' }));
};
