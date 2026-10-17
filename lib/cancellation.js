'use strict';

// Booking, payment, changes and cancellation policy: the version customers
// accept and the charge for cancelling. The wording is on /terms (terms.html,
// sections 4 and 5); keep the bands below and that page in step. Earlier
// versions stay published (/terms-v1, /terms-v2) and still govern the bookings
// that accepted them.

const { getPrice } = require('./format');

const TERMS_VERSION = '3';
// When version 2 went live. Bookings created after this are asked to accept
// the current version on the payment page if they did not accept it on the
// booking form (phone and WhatsApp bookings); older bookings stay on version 1.
const TERMS_CUTOVER = '2026-10-16T15:00:00Z';
// Written to bookings.notes when the acceptance columns are not available, and
// read back from there. Keep the wording stable.
const NOTE_PREFIX = 'Accepted cancellation policy v';

// Charge (% of the fare) by hours of notice before pickup, first match wins.
const BANDS = {
  '1': [{ minHours: 24, pct: 0 }, { minHours: 2, pct: 50 }, { minHours: -Infinity, pct: 100 }],
  '2': [{ minHours: 48, pct: 0 }, { minHours: 24, pct: 25 }, { minHours: 2, pct: 50 }, { minHours: -Infinity, pct: 100 }],
  // Version 3: the same bands, plus 100% once the driver has set off (below).
  '3': [{ minHours: 48, pct: 0 }, { minHours: 24, pct: 25 }, { minHours: 2, pct: 50 }, { minHours: -Infinity, pct: 100 }],
};
// Version 3 charges in full from when the driver sets off, whatever the clock says.
const SET_OFF_STATUSES = ['En Route', 'Arrived', 'Passenger On Board'];

// Where the wording of each version is published.
function policyPath(version) {
  return version === '1' ? '/terms-v1' : version === '2' ? '/terms-v2' : '/terms';
}

// UK wall-clock date and time to the real instant (GMT/BST aware).
function londonOffsetMinutes(date) {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/London', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - date.getTime()) / 60000;
}
function pickupInstant(dateStr, timeStr) {
  const d = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!d) return null;
  const t = String(timeStr || '00:00').match(/^(\d{1,2}):(\d{2})/);
  const guess = Date.UTC(+d[1], +d[2] - 1, +d[3], t ? +t[1] : 0, t ? +t[2] : 0);
  return new Date(guess - londonOffsetMinutes(new Date(guess)) * 60000);
}

// 'HH:MM on DD/MM/YYYY', UK time.
function ukStamp(date) {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(date).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  return `${p.hour}:${p.minute} on ${p.day}/${p.month}/${p.year}`;
}

function acceptedVersion(b) {
  if (b && b.terms_version) return String(b.terms_version);
  const m = String((b && b.notes) || '').match(/Accepted cancellation policy v(\d+)/);
  return m ? m[1] : null;
}

// The policy a booking is held to: the version accepted. A booking made after
// version 2 went live without the tick box (phone, WhatsApp) is held to the
// current version, which it is told about before confirmation and in the
// confirmation email (terms section 2). Anything older stays on version 1.
function policyVersion(b) {
  const v = acceptedVersion(b);
  if (v && BANDS[v]) return v;
  const created = Date.parse((b && b.created_at) || '');
  return Number.isFinite(created) && created >= Date.parse(TERMS_CUTOVER) ? TERMS_VERSION : '1';
}

// One sentence for texts about the booking's free-cancellation deadline
// ('' when the pickup date is missing).
function freeCancellationLine(b, now = new Date()) {
  const pickup = pickupInstant(b.travel_date, b.travel_time);
  if (!pickup) return '';
  const end = chargeStarts(policyVersion(b), pickup)[0].from;
  return end > now ? `Free cancellation until ${ukStamp(end)}.` : 'Cancellation charges now apply.';
}

// When each charge starts for a journey picked up at `pickup` (a Date):
// [{ from: Date, pct }], earliest first, the free period excluded.
function chargeStarts(version, pickup) {
  const bands = BANDS[version] || BANDS[TERMS_VERSION];
  return bands.slice(1).map((band, i) => ({
    from: new Date(pickup.getTime() - bands[i].minHours * 3600000),
    pct: band.pct,
  }));
}

// A booking made after version 2 went live that nobody has accepted the
// policy for yet (booked by phone or WhatsApp): ask on the payment page.
function needsAcceptance(b) {
  if (!b || acceptedVersion(b)) return false;
  const created = Date.parse(b.created_at || '');
  return Number.isFinite(created) && created >= Date.parse(TERMS_CUTOVER);
}

function acceptanceNote(now = new Date()) {
  return `${NOTE_PREFIX}${TERMS_VERSION} at ${ukStamp(now)}.`;
}

// Fields recording acceptance, for a booking insert or update. `columns` false
// = the terms_* columns are not in the database yet; record it in notes.
function acceptanceFields(existingNotes, { columns = true, now = new Date() } = {}) {
  if (columns) return { terms_version: TERMS_VERSION, terms_accepted_at: now.toISOString() };
  return { notes: [existingNotes, acceptanceNote(now)].filter(Boolean).join('\n') };
}

// Accepted = the operator said yes to a website request, or the operator made
// the booking themselves (source 'operator': there is nothing to approve).
function isAccepted(b) {
  if (b.operator_response === 'rejected') return false;
  return b.operator_response === 'accepted' || b.source === 'operator' || ['Dispatched', 'En Route', 'Arrived', 'Passenger On Board'].includes(b.status);
}

const round2 = (n) => Math.round(n * 100) / 100;

// What cancelling this booking now would cost. A request we have not accepted
// yet is free. `price` is this journey's fare (half the return price for a
// return booking, which is held on the outward journey); null when there is
// no price. `paid` is what has been paid for this journey, `refund` what is
// due back.
function cancellationQuote(b, now = new Date()) {
  const version = policyVersion(b);
  const pickup = pickupInstant(b.travel_date, b.travel_time);
  const total = getPrice(b);
  const price = total ? round2(b.return_journey ? total / 2 : total) : null;
  const paid = String(b.payment_status || '').toLowerCase() === 'paid' && price != null ? price : 0;
  const base = { version, price, paid, pickup };
  if (!isAccepted(b)) return { ...base, request: true, pct: 0, charge: 0, refund: paid };
  const hours = pickup ? (pickup.getTime() - now.getTime()) / 3600000 : Infinity;
  const bands = BANDS[version];
  // More than 48 hours is free; each later band includes its lower edge.
  let pct = bands.find((x, i) => (i === 0 ? hours > x.minHours : hours >= x.minHours)).pct;
  if (version === '3' && SET_OFF_STATUSES.includes(b.status)) pct = 100;
  const charge = price == null ? null : round2(price * pct / 100);
  const freeHours = bands[0].minHours;
  const freeUntil = pickup ? new Date(pickup.getTime() - freeHours * 3600000) : null;
  return { ...base, request: false, hours, pct, charge, refund: charge == null ? null : round2(Math.max(0, paid - charge)), freeUntil };
}

const money = (n) => `£${Number(n).toFixed(2)}`;

// One plain sentence describing the charge, for the cancel page and emails.
function chargeSentence(q) {
  if (q.request) return 'There is no charge, because we had not yet confirmed this booking.';
  if (q.pct === 0) return 'There is no charge for cancelling at this notice.';
  const amount = q.charge != null ? `${money(q.charge)} (${q.pct}% of the fare)` : `${q.pct}% of the fare`;
  return `Under our cancellation policy, cancelling now costs ${amount}.`;
}

function refundSentence(q) {
  if (!q.paid) return q.charge ? 'You have not paid yet, so we will send you a payment link or invoice for the charge.' : 'No payment has been taken.';
  if (q.refund == null) return 'We will confirm your refund in writing.';
  return q.refund > 0 ? `We will refund ${money(q.refund)} to your card within 14 days.` : 'No refund is due.';
}

module.exports = {
  TERMS_VERSION, TERMS_CUTOVER, BANDS, acceptedVersion, policyVersion, needsAcceptance, acceptanceFields, acceptanceNote,
  cancellationQuote, chargeSentence, refundSentence, pickupInstant, ukStamp, money, policyPath, chargeStarts, freeCancellationLine,
};

// Record that the customer accepted the current policy. Uses the terms_*
// columns; until migration 20261016120000 is applied they don't exist, so the
// acceptance goes into the booking's notes instead. Never throws.
async function recordAcceptance(b, dbUpdate, now = new Date()) {
  try { await dbUpdate('bookings', b.id, acceptanceFields(null, { columns: true, now })); return 'columns'; }
  catch (_) {
    try { await dbUpdate('bookings', b.id, acceptanceFields(b.notes, { columns: false, now })); return 'notes'; }
    catch (err) { console.error('Recording policy acceptance failed:', b.id, err.message || err); return null; }
  }
}
module.exports.recordAcceptance = recordAcceptance;
