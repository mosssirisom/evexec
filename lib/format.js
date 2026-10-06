'use strict';

const PRICES = {
  'Manchester Airport':     { oneWay: 90,  return: 160 },
  'Liverpool Airport':      { oneWay: 95,  return: 170 },
  'Leeds Bradford Airport': { oneWay: 135, return: 250 },
  'Birmingham Airport':     { oneWay: 215, return: 410 },
  'Newcastle Airport':      { oneWay: 250, return: 480 }
};

// Email subject lines can never contain a newline -- Resend's API rejects
// the whole send with a 422 if one sneaks in. journeyLine() deliberately
// returns a multi-line string for return/multi-stop journeys (it's meant
// for message bodies), so anything built from it and used as a subject
// must be flattened first. Applied once to the whole finished subject
// string, not just the interpolated part, so any other future source of
// a stray newline is caught too.
function singleLineSubject(s) {
  return String(s == null ? '' : s).replace(/[\r\n]+/g, ', ').replace(/\s+/g, ' ').trim();
}

// House date style (user decision, 2026-10-04): DD/MM/YYYY everywhere, times
// 24-hour HH:MM. dateStr is a plain YYYY-MM-DD calendar date, so it is
// rearranged directly -- no Date parsing, so no timezone can shift the day.
function fmtDate(dateStr) {
  if (!dateStr) return 'TBC';
  const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(dateStr);
}

function fmtTime(timeStr, dateStr) {
  // Times are stored as UK local time — return as-is without UTC conversion
  if (!timeStr) return 'TBC';
  const match = String(timeStr).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return timeStr;
  return `${String(match[1]).padStart(2, '0')}:${match[2]}`;
}

function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function getStops(b) {
  if (Array.isArray(b.additional_stops) && b.additional_stops.length) return b.additional_stops;
  if (!b.notes) return [];
  return b.notes.split('\n')
    .filter(line => /^Stop \d+:/i.test(line))
    .map(line => line.replace(/^Stop \d+:\s*/i, '').trim())
    .filter(Boolean);
}

function emailJourneyHtml(booking) {
  const F = 'font-family:Inter,Arial,sans-serif;';
  const lbl = `margin:0 0 2px;${F}font-size:11px;font-weight:600;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.06em`;
  const val = `margin:0 0 14px;${F}font-size:15px;font-weight:600;color:#fff;line-height:1.4`;
  const valLast = `margin:0 0 20px;${F}font-size:15px;font-weight:600;color:#fff;line-height:1.4`;
  const sec = `margin:0 0 12px;${F}font-size:12px;font-weight:700;color:#d5a538;text-transform:uppercase;letter-spacing:.08em`;
  const divider = 'border:none;border-top:1px solid rgba(255,255,255,.1);margin:4px 0 16px';

  // pickup_location and dropoff_address are the literal, operator/customer-
  // entered endpoints of the journey -- always the source of truth for what
  // to show. journey_type is frequently unset (bookings created from the
  // operator dashboard never write it) and airport is just a secondary
  // annotation of which end is the airport, so neither may override an
  // explicit address on either side -- they only fill in a genuinely
  // missing one.
  const outFrom = booking.pickup_location || booking.airport || 'Pickup';
  const outTo   = booking.dropoff_address || booking.airport || booking.destination || 'Drop-off';
  const pax = booking.passengers || 1;
  const stops = getStops(booking);

  if (!booking.return_journey) {
    return [
      `<p style="${lbl}">Pickup</p><p style="${val}">${_esc(outFrom)}</p>`,
      ...stops.map((s, i) => `<p style="${lbl}">Stop ${i + 1}</p><p style="${val}">${_esc(s)}</p>`),
      `<p style="${lbl}">Drop-off</p><p style="${val}">${_esc(outTo)}</p>`,
      `<p style="${lbl}">Date &amp; Time</p><p style="${val}">${fmtDate(booking.travel_date)} at ${fmtTime(booking.travel_time)}</p>`,
      `<p style="${lbl}">Passengers</p><p style="${valLast}">${pax} passenger(s)</p>`,
    ].join('');
  }

  const retAirport = booking.return_airport || booking.airport || 'Airport';
  const retFrom    = booking.return_pickup || retAirport;
  const retTo      = booking.return_destination || booking.pickup_location || booking.dropoff_address || 'Destination';

  return [
    `<p style="${sec}">Outbound</p>`,
    `<p style="${lbl}">Pickup</p><p style="${val}">${_esc(outFrom)}</p>`,
    ...stops.map((s, i) => `<p style="${lbl}">Stop ${i + 1}</p><p style="${val}">${_esc(s)}</p>`),
    `<p style="${lbl}">Drop-off</p><p style="${val}">${_esc(outTo)}</p>`,
    `<p style="${lbl}">Date &amp; Time</p><p style="${val}">${fmtDate(booking.travel_date)} at ${fmtTime(booking.travel_time)}</p>`,
    `<hr style="${divider}">`,
    `<p style="${sec}">Return</p>`,
    `<p style="${lbl}">Pickup</p><p style="${val}">${_esc(retFrom)}</p>`,
    `<p style="${lbl}">Drop-off</p><p style="${val}">${_esc(retTo)}</p>`,
    `<p style="${lbl}">Date &amp; Time</p><p style="${val}">${fmtDate(booking.return_date)} at ${fmtTime(booking.return_time)}</p>`,
    `<p style="${lbl}">Passengers</p><p style="${valLast}">${pax} passenger(s)</p>`,
  ].join('');
}

function refBadgeHtml(ref) {
  if (!ref) return '';
  const F = 'font-family:Inter,Arial,sans-serif;';
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px;width:100%"><tr><td style="background:rgba(213,165,56,.08);border:1px solid rgba(213,165,56,.35);border-radius:10px;padding:14px 16px">
    <p style="margin:0 0 4px;${F}font-size:11px;font-weight:700;color:#d5a538;text-transform:uppercase;letter-spacing:.08em">Your Booking Reference</p>
    <p style="margin:0 0 6px;${F}font-size:20px;font-weight:800;color:#fff;letter-spacing:.04em">${_esc(ref)}</p>
    <p style="margin:0;${F}font-size:12px;color:rgba(255,255,255,.55);line-height:1.5">Save this. You'll need it, along with your phone number, to check your booking anytime at evexec.co.uk/booking.</p>
  </td></tr></table>`;
}

function oneWayJourneyLine(b) {
  // Same precedence as emailJourneyHtml(): the literal pickup_location /
  // dropoff_address always win over the airport-name fallback. Stops sit in
  // travel order between them: Pickup → Stop 1 → Stop 2 → Drop-off.
  const from = b.pickup_location || b.airport || 'Pickup';
  const to   = b.dropoff_address || b.airport || b.destination || 'Your destination';
  return [from, ...getStops(b), to].join(' → ');
}

function returnJourneyLine(b) {
  const returnAirport = b.return_airport || b.airport || 'Airport';
  const returnPickup = b.return_pickup || returnAirport;
  const returnDestination = b.return_destination || b.pickup_location || b.dropoff_address || 'Your destination';
  return `${returnPickup} → ${returnDestination}`;
}

function journeyLine(b) {
  const outbound = oneWayJourneyLine(b);
  if (!b.return_journey) return outbound;

  const returnLine = returnJourneyLine(b);
  const returnDate = `${fmtDate(b.return_date)} at ${fmtTime(b.return_time, b.return_date)}`;

  return [
    `Outbound: ${outbound}`,
    `Return: ${returnLine}`,
    `Return date: ${returnDate}`,
  ].join('\n');
}

// Explicit payment wording from payment_method + payment_status. Never assumes
// card: an unpaid booking with no method says "Payment required".
function paymentLine(b) {
  if (/^Return leg created automatically/i.test(String(b.notes || ''))) {
    const m = String(b.notes).match(/Outbound ref:\s*(\S+)/i);
    return m ? `Included with booking ${m[1].replace(/[.,]$/, '')}` : 'Included with your outbound booking';
  }
  const method = String(b.payment_method || '').trim().toLowerCase();
  const status = String(b.payment_status || '').trim().toLowerCase();
  const isBank = method === 'bank transfer' || method === 'bank_transfer';
  if (status === 'paid') {
    if (method === 'card' || method === 'payment link') return 'Paid by card';
    if (method === 'cash') return 'Paid in cash';
    if (isBank) return 'Paid by bank transfer';
    return 'Paid';
  }
  if (method === 'cash') return 'Cash on the day';
  if (isBank) return 'Bank transfer (payment pending)';
  if (method === 'payment link') return 'Payment link sent (payment pending)';
  if (method === 'card') return 'Card payment pending';
  return 'Payment required';
}

function journeySummaryText(b) {
  const parts = [
    `Outbound: ${oneWayJourneyLine(b)}`,
    `${fmtDate(b.travel_date)} at ${fmtTime(b.travel_time, b.travel_date)}`,
    `${b.passengers || 1} passenger(s)${b.luggage ? `, ${b.luggage}` : ''}`
  ];
  if (b.return_journey) {
    parts.push(`Return: ${returnJourneyLine(b)}`);
    parts.push(`${fmtDate(b.return_date)} at ${fmtTime(b.return_time, b.return_date)}`);
  }
  return parts.join('\n');
}

// ─── Address shortener ────────────────────────────────────────────────────────
// "Clitheroes Ln, Freckleton, Preston, UK"  →  "Freckleton, Preston"
// "Manchester Airport"                       →  "Manchester Airport"
const COUNTRY_RE = /^(UK|United Kingdom|England|Scotland|Wales|GB)$/i;

function shortenAddress(address) {
  if (!address) return '';
  const parts = address.split(',').map(p => p.trim()).filter(p => p && !COUNTRY_RE.test(p));
  if (parts.length <= 1) return parts[0] || address;
  if (parts.length === 2) return parts.join(', ');
  // 3+ parts: drop street name, keep last two (town + city/county)
  return parts.slice(-2).join(', ');
}

const MONTH_ABBR = {
  January:'Jan', February:'Feb', March:'Mar',    April:'Apr',
  May:'May',     June:'Jun',     July:'Jul',      August:'Aug',
  September:'Sep', October:'Oct', November:'Nov', December:'Dec',
};
function shortMonth(dateStr) {
  return (dateStr || '').replace(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/,
    m => MONTH_ABBR[m] || m
  );
}

// ─── Operator job-offer SMS ───────────────────────────────────────────────────
// Produces the correctly labelled, chronologically ordered SMS sent to the
// operator when a new booking arrives, e.g.:
//
//   JOB OFFER: £160 (Cash on the day)
//   Passenger: Bruno Curtis (+447376022402)
//
//   OUTBOUND: 04/08/2026 @ 04:30
//   12 Clitheroes Lane, Freckleton, Preston -> Manchester Airport
//
//   RETURN: 09/08/2026 @ 18:35
//   Manchester Airport -> 12 Clitheroes Lane, Freckleton, Preston
//
//   Accept: https://…
//   Reject: https://…
function buildOperatorJobOfferSms(booking, acceptUrl, rejectUrl) {
  const price  = getPrice(booking);
  const method = paymentLine(booking);
  const stops  = getStops(booking);

  // Same precedence as emailJourneyHtml()/journeyLine(): the literal
  // pickup_location/dropoff_address always win over the airport fallback.
  const outboundFrom = booking.pickup_location || booking.airport || 'Pickup';
  const outboundTo   = booking.dropoff_address || booking.airport || 'Destination';

  const lines = [
    `JOB OFFER: £${price} (${method})`,
    `Passenger: ${booking.customer_name} (${booking.customer_phone})`,
    '',
  ];

  if (booking.return_journey && booking.return_date) {
    // Parse both legs so we can sort chronologically
    const outboundDt = new Date(`${booking.travel_date}T${booking.travel_time  || '00:00'}`);
    const returnDt   = new Date(`${booking.return_date}T${booking.return_time  || '00:00'}`);

    const returnAirport = booking.return_airport || booking.airport || 'Airport';
    const returnFrom    = booking.return_pickup  || returnAirport;
    const returnTo      = booking.return_destination || booking.pickup_location || booking.dropoff_address || 'Destination';

    const legs = [
      { label:'OUTBOUND', date:shortMonth(fmtDate(booking.travel_date)), time:fmtTime(booking.travel_time, booking.travel_date), from:[outboundFrom, ...stops].join(' -> '), to:outboundTo, dt:outboundDt },
      { label:'RETURN',   date:shortMonth(fmtDate(booking.return_date)), time:fmtTime(booking.return_time, booking.return_date), from:returnFrom, to:returnTo, dt:returnDt   },
    ].sort((a, b) => a.dt - b.dt);

    legs.forEach((leg, i) => {
      lines.push(`${leg.label}: ${leg.date} @ ${leg.time}`);
      lines.push(`${leg.from} -> ${leg.to}`);
      if (i < legs.length - 1) lines.push('');
    });
  } else {
    lines.push(`OUTBOUND: ${shortMonth(fmtDate(booking.travel_date))} @ ${fmtTime(booking.travel_time, booking.travel_date)}`);
    lines.push([outboundFrom, ...stops, outboundTo].join(' -> '));
  }

  lines.push('', `Accept: ${acceptUrl}`, `Reject: ${rejectUrl}`);
  return lines.join('\n');
}

function lookupPrice(airport, isReturn) {
  const p = PRICES[airport];
  if (!p) return null;
  return isReturn ? p.return : p.oneWay;
}

function getPrice(booking) {
  if (booking.quoted_price) return Number(booking.quoted_price);
  const p = PRICES[booking.airport];
  if (!p) return null;
  return booking.return_journey ? p.return : p.oneWay;
}

// ── Booking details + payment section (the booking-confirmed email) ──────────
// Light rows in the one EV Exec email design (same look as the Operator
// app's emails). Dates DD/MM/YYYY, times 24-hour HH:MM.
const ROW_L = 'padding:9px 0;color:#64748b;width:118px;border-bottom:1px solid #eef0f3;font-size:12px;text-transform:uppercase;letter-spacing:.04em;vertical-align:top;font-family:Arial,Helvetica,sans-serif';
const ROW_V = 'padding:9px 0;font-weight:700;color:#0f1b33;border-bottom:1px solid #eef0f3;font-size:14px;vertical-align:top;font-family:Arial,Helvetica,sans-serif';
const SEC = 'padding:14px 0 4px;color:#8a6416;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;font-family:Arial,Helvetica,sans-serif';
const row = (label, value) => value ? `<tr><td style="${ROW_L}">${_esc(label)}</td><td style="${ROW_V}">${_esc(value)}</td></tr>` : '';
const isReturnLeg = (b) => /^Return leg created automatically/i.test(String(b.notes || ''));

function bookingDetailsHtml(b, opts = {}) {
  const rows = [row('Reference', b.ref)];
  if (b.return_journey) rows.push(`<tr><td colspan="2" style="${SEC}">Outbound</td></tr>`);
  rows.push(row('Pickup', b.pickup_location || b.airport || 'To be confirmed'));
  getStops(b).forEach((s, i) => rows.push(row(`Stop ${i + 1}`, s)));
  rows.push(row('Drop-off', b.dropoff_address || b.airport || b.destination || 'To be confirmed'));
  rows.push(row('Date', fmtDate(b.travel_date)), row('Time', fmtTime(b.travel_time)));
  if (b.flight_number) rows.push(row('Flight', String(b.flight_number).toUpperCase()));
  if (b.return_journey) {
    rows.push(`<tr><td colspan="2" style="${SEC}">Return</td></tr>`);
    rows.push(row('Pickup', b.return_pickup || b.return_airport || b.airport || 'To be confirmed'));
    rows.push(row('Drop-off', b.return_destination || b.pickup_location || b.dropoff_address || 'To be confirmed'));
    rows.push(row('Date', fmtDate(b.return_date)), row('Time', fmtTime(b.return_time)));
    if (b.return_flight) rows.push(row('Flight', String(b.return_flight).toUpperCase()));
    rows.push(`<tr><td colspan="2" style="padding:6px 0 0"></td></tr>`);
  }
  rows.push(row('Passengers', String(b.passengers || 1)));
  if (b.luggage) rows.push(row('Bags', String(b.luggage)));
  const price = isReturnLeg(b) || opts.price === false ? null : getPrice(b);
  if (price) rows.push(row('Price', `£${Number(price).toFixed(2)}`));
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin:0 0 18px">${rows.join('')}</table>`;
}

// Bookings the customer can still pay: not paid, not on account/invoiced.
function needsPayment(b) {
  const s = String(b.payment_status || '').toLowerCase();
  return s !== 'paid' && s !== 'invoiced' && !isReturnLeg(b) && Boolean(getPrice(b));
}

// The Payment section at the bottom of the booking-confirmed email: a button
// to the booking page, where the customer pays by card (Stripe) or picks cash.
function paymentSectionHtml(b, payUrl) {
  const H = 'margin:22px 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:#8a6416;text-transform:uppercase;letter-spacing:.06em';
  const P = 'margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#334155';
  const head = `<div style="border-top:2px solid #C9A550;margin-top:6px"></div><p style="${H}">Payment</p>`;
  if (!needsPayment(b)) return `${head}<p style="${P}">Payment: <strong style="color:#0f1b33">${_esc(paymentLine(b))}</strong></p>`;
  return `${head}<p style="${P}">Your booking is confirmed. You can now pay securely by card or choose to pay cash.</p>`
    + `<p style="margin:0 0 18px"><a href="${_esc(payUrl)}" style="display:inline-block;background:#C9A550;color:#0B132B;font-family:Arial,Helvetica,sans-serif;font-weight:700;font-size:15px;padding:13px 28px;border-radius:8px;text-decoration:none">Pay Now</a></p>`;
}

module.exports = { fmtDate, fmtTime, journeyLine, journeySummaryText, lookupPrice, getPrice, PRICES, shortenAddress, buildOperatorJobOfferSms, emailJourneyHtml, refBadgeHtml, getStops, singleLineSubject, paymentLine, bookingDetailsHtml, paymentSectionHtml, needsPayment };
