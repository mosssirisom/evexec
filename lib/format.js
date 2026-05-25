'use strict';

const PRICES = {
  'Manchester Airport': 90,
  'Liverpool Airport': 95,
  'Leeds Bradford Airport': 135,
  'Birmingham Airport': 215,
  'Newcastle Airport': 250
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

function lookupPrice(airport) {
  return PRICES[airport] || null;
}

function getPrice(booking) {
  if (booking.quoted_price) return Number(booking.quoted_price);
  return PRICES[booking.airport] || null;
}

module.exports = { fmtDate, journeyLine, journeySummaryText, lookupPrice, getPrice, PRICES };
