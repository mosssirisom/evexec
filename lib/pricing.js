'use strict';

// Base prices per airport (used when Maps API unavailable)
const AIRPORT_BASE = {
  'Manchester Airport':      65,
  'Liverpool Airport':       55,
  'Leeds Bradford Airport':  75,
  'Birmingham Airport':      95,
  'Newcastle Airport':       130,
};

const PRICE_PER_MILE   = 2.50;
const OOH_MULTIPLIER   = 1.5;   // before 06:00 or after 22:00
const RETURN_MULTIPLIER = 0.90; // return leg costs 90% of the outbound leg

function isOutOfHours(timeStr) {
  if (!timeStr) return false;
  const h = parseInt((timeStr || '').split(':')[0], 10);
  return h < 6 || h >= 22;
}

async function getDistanceFromMaps(origin, destination) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key || !origin || !destination) return null;
  try {
    const params = new URLSearchParams({ origins: origin, destinations: destination, key, units: 'imperial' });
    const res = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    const el = data?.rows?.[0]?.elements?.[0];
    if (el?.status !== 'OK') return null;
    return {
      distanceMiles: el.distance.value / 1609.34,
      durationMins:  Math.ceil(el.duration.value / 60),
    };
  } catch {
    return null;
  }
}

async function calculateQuote({ airport, pickupLocation, dropoffAddress, travelTime, returnJourney }) {
  const basePrice = AIRPORT_BASE[airport] ?? 65;
  let price = basePrice;
  let distanceMiles = null;
  let durationMins  = 60;

  const origin      = pickupLocation || dropoffAddress || '';
  const destination = airport || dropoffAddress || '';

  if (origin && destination) {
    const maps = await getDistanceFromMaps(origin, destination);
    if (maps) {
      distanceMiles = maps.distanceMiles;
      durationMins  = maps.durationMins;
      const milePrice = maps.distanceMiles * PRICE_PER_MILE;
      price = Math.max(basePrice, milePrice);
    }
  }

  const ooh = isOutOfHours(travelTime);
  if (ooh)            price *= OOH_MULTIPLIER;
  if (returnJourney)  price *= (1 + RETURN_MULTIPLIER);

  return {
    price:         Math.round(price),
    distanceMiles: distanceMiles != null ? Math.round(distanceMiles * 10) / 10 : null,
    durationMins,
    outOfHours:    ooh,
    breakdown: { base: basePrice, final: Math.round(price) },
  };
}

module.exports = { calculateQuote, isOutOfHours, AIRPORT_BASE };
