'use strict';

// The EV Exec correspondence standard. Every customer, operator and driver
// message about a booking takes its date, time, journey and payment wording
// from here, so the same booking always reads the same everywhere.
//
//   Date:       3 October 2026
//   Date/time:  14:00 — 3 October 2026
//   Journey:    Pickup → Stop 1 → Stop 2 → Drop-off, outbound and return
//               shown as separate legs
//   Addresses:  the stored pickup_location / dropoff_address, in full. The
//               airport name only fills a side that has no address at all.
//   Payment:    stated explicitly from payment_method + payment_status,
//               never inferred.
//
// travel_date/travel_time (and return_*) are stored as UK wall-clock values,
// so they are formatted as written and never converted from UTC. Real
// timestamps (completed_at etc.) are rendered in Europe/London.
//
// Two small mirrors of these rules exist where this file can't be loaded:
// evexecdriverapp/supabase/functions/_shared/format.ts (push/two-tap text from
// edge functions) and evexecoperator/src/lib/bookingText.ts (two-tap text from
// the operator app). Emails are only ever rendered here.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

function clean(v) {
  const s = v == null ? '' : String(v).trim();
  return s || null;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// 'YYYY-MM-DD' (or an ISO string starting with one) -> '3 October 2026'.
function ukDate(dateStr) {
  const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return dateStr ? String(dateStr) : 'Date TBC';
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

// '09:05:00' -> '09:05'. Returns null when there is no usable time.
function ukTime(timeStr) {
  const m = String(timeStr || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

// '14:00 — 3 October 2026' (or just the date when the time is missing).
function ukWhen(dateStr, timeStr) {
  const t = ukTime(timeStr);
  return t ? `${t} — ${ukDate(dateStr)}` : ukDate(dateStr);
}

// A real timestamp (e.g. completed_at) in UK local time, same shape as ukWhen.
function ukWhenFromTimestamp(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(d).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  return ukWhen(`${p.year}-${p.month}-${p.day}`, `${p.hour === '24' ? '00' : p.hour}:${p.minute}`);
}

// Stops live as "Stop N: address" lines in bookings.notes (additional_stops
// only exists in memory while a website booking is being created).
function getStops(b) {
  if (Array.isArray(b.additional_stops) && b.additional_stops.length) {
    return b.additional_stops.map(clean).filter(Boolean);
  }
  if (!b.notes) return [];
  return String(b.notes).split('\n')
    .filter(line => /^Stop \d+:/i.test(line.trim()))
    .map(line => line.trim().replace(/^Stop \d+:\s*/i, '').trim())
    .filter(Boolean);
}

// The website stores a return trip as two rows: the outbound row (with the
// return_* fields) and an automatically created return-leg row priced at £0.
function isReturnLeg(b) {
  return /^Return leg created automatically/i.test(String(b.notes || ''));
}

function outboundRefOf(b) {
  const m = String(b.notes || '').match(/Outbound ref:\s*(\S+)/i);
  return m ? m[1].replace(/[.,]$/, '') : null;
}

// The legs of a booking in travel order, each with full stored addresses.
function journeyLegs(b) {
  const outbound = {
    label: b.return_journey ? 'Outbound' : null,
    pickup: clean(b.pickup_location) || clean(b.airport) || 'Pickup to be confirmed',
    stops: getStops(b),
    dropoff: clean(b.dropoff_address) || clean(b.airport) || clean(b.destination) || 'Drop-off to be confirmed',
    date: b.travel_date,
    time: b.travel_time
  };
  if (!b.return_journey) return [outbound];
  const ret = {
    label: 'Return',
    pickup: clean(b.return_pickup) || clean(b.return_airport) || clean(b.airport) || 'Pickup to be confirmed',
    stops: [],
    dropoff: clean(b.return_destination) || clean(b.pickup_location) || clean(b.dropoff_address) || 'Drop-off to be confirmed',
    date: b.return_date,
    time: b.return_time
  };
  return [outbound, ret];
}

// One line, outbound leg only, stops in order: 'A → Stop → B'. For push
// notifications, subjects and anywhere a single line is needed.
function routeLine(b) {
  const leg = journeyLegs(b)[0];
  return [leg.pickup, ...leg.stops, leg.dropoff].join(' → ');
}

// Multi-line plain-text journey for SMS / two-tap / text bodies.
function journeyText(b) {
  const legs = journeyLegs(b);
  return legs.map(leg => [
    leg.label ? leg.label.toUpperCase() : null,
    `Pickup: ${leg.pickup}`,
    ...leg.stops.map((s, i) => `Stop ${i + 1}: ${s}`),
    `Drop-off: ${leg.dropoff}`,
    `When: ${ukWhen(leg.date, leg.time)}`
  ].filter(Boolean).join('\n')).join('\n\n');
}

// Explicit payment wording. Never assumes card.
function paymentLine(b) {
  if (isReturnLeg(b)) {
    const ref = outboundRefOf(b);
    return ref ? `Included with booking ${ref}` : 'Included with your outbound booking';
  }
  const method = String(b.payment_method || '').trim().toLowerCase();
  const status = String(b.payment_status || '').trim().toLowerCase();
  const isCash = method === 'cash';
  const isBank = method === 'bank transfer' || method === 'bank_transfer';
  const isLink = method === 'payment link';
  const isCard = method === 'card';
  if (status === 'paid') {
    if (isCard || isLink) return 'Paid by card';
    if (isCash) return 'Paid in cash';
    if (isBank) return 'Paid by bank transfer';
    return 'Paid';
  }
  if (isCash) return 'Cash on the day';
  if (isBank) return 'Bank transfer (payment pending)';
  if (isLink) return 'Payment link available (payment pending)';
  if (isCard) return 'Card payment pending';
  if (status === 'pending') return 'Payment pending';
  return 'Payment required';
}

// Same facts for the driver, plus what (if anything) they collect.
function driverPaymentLine(b, price) {
  const line = paymentLine(b);
  if (isReturnLeg(b) || /^Paid/.test(line)) return `${line} (nothing to collect)`;
  if (line === 'Cash on the day') return price ? `Cash on the day (collect £${price})` : 'Cash on the day (collect the fare)';
  return `${line} (do not collect)`;
}

const F = 'font-family:Inter,Arial,sans-serif;';
const STYLE = {
  lbl: `margin:0 0 2px;${F}font-size:11px;font-weight:600;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.06em`,
  val: `margin:0 0 14px;${F}font-size:15px;font-weight:600;color:#fff;line-height:1.4`,
  sec: `margin:0 0 12px;${F}font-size:12px;font-weight:700;color:#d5a538;text-transform:uppercase;letter-spacing:.08em`,
  divider: 'border:none;border-top:1px solid rgba(255,255,255,.1);margin:4px 0 16px'
};

function rowHtml(label, value) {
  return `<p style="${STYLE.lbl}">${esc(label)}</p><p style="${STYLE.val}">${esc(value)}</p>`;
}

// The journey block used inside every booking email (EV Exec card styling).
// opts.rows: extra [label, value] pairs appended after the journey
// (passengers, price, payment...). Rows with an empty value are skipped.
function journeyHtml(b, opts = {}) {
  const legs = journeyLegs(b);
  const parts = [];
  legs.forEach((leg, i) => {
    if (i > 0) parts.push(`<hr style="${STYLE.divider}">`);
    if (leg.label) parts.push(`<p style="${STYLE.sec}">${leg.label}</p>`);
    parts.push(rowHtml('Pickup', leg.pickup));
    leg.stops.forEach((s, si) => parts.push(rowHtml(`Stop ${si + 1}`, s)));
    parts.push(rowHtml('Drop-off', leg.dropoff));
    parts.push(rowHtml('Date & time', ukWhen(leg.date, leg.time)));
  });
  const extra = (opts.rows || []).filter(([, v]) => v !== null && v !== undefined && v !== '');
  if (extra.length) {
    parts.push(`<hr style="${STYLE.divider}">`);
    extra.forEach(([l, v]) => parts.push(rowHtml(l, v)));
  }
  return parts.join('');
}

module.exports = {
  ukDate, ukTime, ukWhen, ukWhenFromTimestamp, getStops, isReturnLeg, outboundRefOf,
  journeyLegs, routeLine, journeyText, paymentLine, driverPaymentLine, journeyHtml, esc
};
