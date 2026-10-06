'use strict';

// Handles: /api/operator/accept, /api/operator/reject (HTML pages opened from
// the signed links in the operator's new-booking email).
//
// The secret-gated /bookings, /drivers, /assign, /notify and /manage routes
// served the old /operator page, retired 2026-10-04 (the Operator app does
// all of this now).

const { dbGet, dbUpdate, isValidUUID } = require('../../lib/supabase');
const { sendRejectionNotice, sendBookingConfirmed } = require('../../lib/notify');
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
    if (booking.operator_response) return res.end(operatorPage('Already Actioned', `<p>This booking has already been <strong>${booking.operator_response === 'accepted' ? 'confirmed' : 'rejected'}</strong>.</p>`, booking.operator_response === 'accepted'));
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
      await dbUpdate('bookings', id, { status: 'Cancelled', operator_response: 'rejected', operator_responded_at: new Date().toISOString() });
      await sendRejectionNotice(booking);
      return res.end(operatorPage('Booking Rejected', `<p>Booking for <strong>${esc(booking.customer_name)}</strong> has been rejected.</p><p>${esc(route)}<br>${esc(date)}</p><p>The customer has been notified. No payment has been taken.</p>`, false));
    }

    // Confirmed: same record as accepting in the Operator app, then the
    // booking-confirmed email with the Payment section (card or cash).
    const patch = { status: 'Dispatched', operator_response: 'accepted', operator_responded_at: new Date().toISOString() };
    await dbUpdate('bookings', id, patch);
    await sendBookingConfirmed({ ...booking, ...patch });
    const price = getPrice(booking);
    return res.end(operatorPage('Booking Confirmed ✓', `<p>Booking for <strong>${esc(booking.customer_name)}</strong> accepted.</p><p>${esc(route)}<br>${esc(date)} at ${esc(booking.travel_time || 'TBC')}</p>${price ? `<p class="price">£${price}</p>` : ''}<p>The customer has been emailed their booking confirmation with the payment link.</p>`));
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
