'use strict';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yoltkmhtxwluqxxpewbl.supabase.co';

const TIERS = [
  { name: 'Executive', threshold: 20 },
  { name: 'Preferred', threshold: 10 },
  { name: 'Client',    threshold: 0  },
];

function getTier(points) {
  for (const tier of TIERS) {
    if (points >= tier.threshold) return tier.name;
  }
  return 'Client';
}

function getNextTier(points) {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (TIERS[i].threshold > points) return { name: TIERS[i].name, pointsNeeded: TIERS[i].threshold - points };
  }
  return null;
}

function _headers() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };
}

async function _getProfile(userId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=privilege_points&limit=1`,
    { headers: _headers() }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

async function awardPoint(userId) {
  const profile = await _getProfile(userId);
  if (!profile) return null;
  const newPoints = (profile.privilege_points || 0) + 1;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`,
    {
      method: 'PATCH',
      headers: { ..._headers(), Prefer: 'return=representation' },
      body: JSON.stringify({ privilege_points: newPoints, updated_at: new Date().toISOString() }),
    }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  const pts = rows[0]?.privilege_points ?? newPoints;
  return { points: pts, tier: getTier(pts), nextTier: getNextTier(pts) };
}

async function getLoyaltyStatus(userId) {
  const profile = await _getProfile(userId);
  const points = profile?.privilege_points || 0;
  return { points, tier: getTier(points), nextTier: getNextTier(points) };
}

// Atomically flips loyalty_awarded false -> true for a booking.
// Returns true only if this call was the one that flipped it (i.e. first time),
// so callers can safely award points without double-counting on retries.
async function markLoyaltyAwarded(bookingId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?id=eq.${bookingId}&loyalty_awarded=eq.false`,
    {
      method: 'PATCH',
      headers: { ..._headers(), Prefer: 'return=representation' },
      body: JSON.stringify({ loyalty_awarded: true, updated_at: new Date().toISOString() }),
    }
  );
  if (!res.ok) return false;
  const rows = await res.json();
  return rows.length > 0;
}

module.exports = { awardPoint, getLoyaltyStatus, getTier, getNextTier, markLoyaltyAwarded, TIERS };
