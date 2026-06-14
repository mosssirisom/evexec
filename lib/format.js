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

module.exports = { fmtDate, journeyLine, journeySummaryText, lookupPrice, getPrice, PRICES };
