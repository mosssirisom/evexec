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

function journeyLine(b) {
  if (b.journey_type === 'From Airport') {
    return `${b.airport || 'Airport'} → ${b.dropoff_address || 'Your destination'}`;
  }
  return `${b.pickup_location || 'Pickup'} → ${b.airport || 'Airport'}`;
}

function journeySummaryText(b) {
  const parts = [
    journeyLine(b),
    `${fmtDate(b.travel_date)} at ${b.travel_time || 'TBC'}`,
    `${b.passengers || 1} passenger(s)${b.luggage ? `, ${b.luggage}` : ''}`
  ];
  if (b.return_journey) {
    parts.push(`Return: ${fmtDate(b.return_date)} at ${b.return_time || 'TBC'}`);
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
