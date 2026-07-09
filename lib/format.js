'use strict';

const PRICES = {
  'Manchester Airport':     { oneWay: 90,  return: 160 },
  'Liverpool Airport':      { oneWay: 95,  return: 170 },
  'Leeds Bradford Airport': { oneWay: 135, return: 250 },
  'Birmingham Airport':     { oneWay: 215, return: 410 },
  'Newcastle Airport':      { oneWay: 250, return: 480 }
};

function fmtDate(dateStr) {
  if (!dateStr) return 'TBC';
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
  } catch { return dateStr; }
}

function oneWayJourneyLine(b) {
  if (b.journey_type === 'From Airport') {
    return `${b.airport || b.pickup_location || 'Airport'} → ${b.dropoff_address || b.destination || 'Your destination'}`;
  }
  return `${b.pickup_location || 'Pickup'} → ${b.airport || b.dropoff_address || 'Airport'}`;
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
  const returnDate = `${fmtDate(b.return_date)} at ${b.return_time || 'TBC'}`;

  return [
    `Outbound: ${outbound}`,
    `Return: ${returnLine}`,
    `Return date: ${returnDate}`,
  ].join('\n');
}

function journeySummaryText(b) {
  const parts = [
    `Outbound: ${oneWayJourneyLine(b)}`,
    `${fmtDate(b.travel_date)} at ${b.travel_time || 'TBC'}`,
    `${b.passengers || 1} passenger(s)${b.luggage ? `, ${b.luggage}` : ''}`
  ];
  if (b.return_journey) {
    parts.push(`Return: ${returnJourneyLine(b)}`);
    parts.push(`${fmtDate(b.return_date)} at ${b.return_time || 'TBC'}`);
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
//   JOB OFFER: £160 (cash)
//   Passenger: Bruno Curtis (+447376022402)
//
//   OUTBOUND: 4 Aug 2026 @ 04:30
//   Freckleton, Preston -> Manchester Airport
//
//   RETURN: 9 Aug 2026 @ 18:35
//   Manchester Airport -> Freckleton, Preston
//
//   Accept: https://…
//   Reject: https://…
function buildOperatorJobOfferSms(booking, acceptUrl, rejectUrl) {
  const price  = getPrice(booking);
  const method = booking.payment_method || 'TBC';

  const outboundFrom = booking.journey_type === 'From Airport'
    ? (booking.airport         || 'Airport')
    : (booking.pickup_location || 'Pickup');
  const outboundTo = booking.journey_type === 'From Airport'
    ? (booking.dropoff_address || 'Destination')
    : (booking.airport || booking.dropoff_address || 'Airport');

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
      { label:'OUTBOUND', date:shortMonth(fmtDate(booking.travel_date)), time:booking.travel_time ||'TBC', from:shortenAddress(outboundFrom), to:shortenAddress(outboundTo), dt:outboundDt },
      { label:'RETURN',   date:shortMonth(fmtDate(booking.return_date)), time:booking.return_time ||'TBC', from:shortenAddress(returnFrom),   to:shortenAddress(returnTo),   dt:returnDt   },
    ].sort((a, b) => a.dt - b.dt);

    legs.forEach((leg, i) => {
      lines.push(`${leg.label}: ${leg.date} @ ${leg.time}`);
      lines.push(`${leg.from} -> ${leg.to}`);
      if (i < legs.length - 1) lines.push('');
    });
  } else {
    lines.push(`OUTBOUND: ${shortMonth(fmtDate(booking.travel_date))} @ ${booking.travel_time || 'TBC'}`);
    lines.push(`${shortenAddress(outboundFrom)} -> ${shortenAddress(outboundTo)}`);
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

module.exports = { fmtDate, journeyLine, journeySummaryText, lookupPrice, getPrice, PRICES, shortenAddress, buildOperatorJobOfferSms };
