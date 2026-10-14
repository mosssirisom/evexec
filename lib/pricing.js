'use strict';

// Each operator's fixed prices live in tenants.pricing (set in the Operator
// app, Settings → Prices). This site is EV Exec's, so it reads EV Exec's row.
//
// getPrice()/lookupPrice() in lib/format.js are synchronous and used all over
// (emails, payments, the operator accept page), so every API handler that can
// price something calls `await refreshPricing()` first. That loads the row at
// most once a minute per server instance. If the database can't be reached or
// the row has no prices, the built-in list (FALLBACK, today's prices) is used,
// so pricing never fails because of this lookup.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yoltkmhtxwluqxxpewbl.supabase.co';
const TENANT_ID = process.env.TENANT_ID || '00000000-0000-0000-0000-000000000001';
const TTL_MS = 60 * 1000;

const FALLBACK = {
  airports: [
    { name: 'Manchester Airport', code: 'MAN', oneWay: 90, ret: 160 },
    { name: 'Liverpool Airport', code: 'LPL', oneWay: 95, ret: 170 },
    { name: 'Leeds Bradford Airport', code: 'LBA', oneWay: 135, ret: 250 },
    { name: 'Birmingham Airport', code: 'BHX', oneWay: 215, ret: 410 },
    { name: 'Newcastle Airport', code: 'NCL', oneWay: 250, ret: 480 },
  ],
  extraStop: 5,
};

let current = FALLBACK;
let loadedAt = 0;
let inflight = null;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** tenants.pricing (snake_case, as stored) → { airports: [{name, code, oneWay, ret}], extraStop }, or null if unusable. */
function fromRow(pricing) {
  if (!pricing || !Array.isArray(pricing.airports)) return null;
  const airports = pricing.airports
    .map((a) => ({ name: String(a && a.name || '').trim(), code: a && a.code || null, oneWay: num(a && a.one_way), ret: num(a && a.return_fare) }))
    .filter((a) => a.name && a.oneWay != null && a.ret != null);
  if (!airports.length) return null;
  return { airports, extraStop: num(pricing.extra_stop) ?? 0 };
}

async function fetchPricing() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/tenants?id=eq.${encodeURIComponent(TENANT_ID)}&select=pricing&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`pricing lookup ${res.status}`);
  const rows = await res.json();
  return fromRow(rows && rows[0] && rows[0].pricing);
}

/** Load the operator's prices if the copy in memory is over a minute old. Never throws. */
async function refreshPricing({ force = false } = {}) {
  if (!force && Date.now() - loadedAt < TTL_MS) return current;
  if (!inflight) {
    inflight = fetchPricing()
      .then((p) => { current = p || FALLBACK; })
      .catch((err) => { console.warn('[pricing] using built-in prices:', err.message); })
      .finally(() => { loadedAt = Date.now(); inflight = null; });
  }
  await inflight;
  return current;
}

function currentPricing() { return current; }

function findAirport(name) {
  const s = String(name || '').trim().toLowerCase();
  if (!s) return null;
  return current.airports.find((a) => a.name.toLowerCase() === s) || null;
}

// Test hooks.
function _setPricing(p) { current = p || FALLBACK; loadedAt = p ? Date.now() : 0; }

module.exports = { refreshPricing, currentPricing, findAirport, fromRow, FALLBACK, _setPricing };
