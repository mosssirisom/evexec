'use strict';

// Which Stripe account a business's card payments use (design:
// docs/payments/stripe-connect-design.md, phase 2).
//
//  - The account OWNER (EV Exec): its own Stripe account (STRIPE_SECRET_KEY), exactly
//    as before. No Stripe-Account header.
//  - Any OTHER business: its own CONNECTED account, reached with the platform's key
//    (STRIPE_PLATFORM_SECRET_KEY) and a Stripe-Account header, so the payment is made
//    directly on the operator's account and the platform never holds the money. Only
//    once Stripe says that account can take card payments (charges_enabled).
//  - Anything else (no connected account, not ready, no platform key): null. The
//    caller must refuse the card payment; money never goes to a different business.
//
// Never log or return the keys: a context is only used to build request headers.

const SUPABASE_URL = () => process.env.SUPABASE_URL || 'https://yoltkmhtxwluqxxpewbl.supabase.co';
const ownerTenant = () => process.env.STRIPE_PLATFORM_TENANT_ID || '00000000-0000-0000-0000-000000000001';
const ownKey = () => String(process.env.STRIPE_SECRET_KEY || '').trim();
const platformKey = () => String(process.env.STRIPE_PLATFORM_SECRET_KEY || '').trim();
const isOwner = (tenantId) => !tenantId || tenantId === ownerTenant();

const TTL_MS = 60 * 1000;
let byTenant = new Map();   // tenant id -> { accountId, chargesEnabled }
let byAccount = new Map();  // acct_... -> tenant id
let loadedAt = 0;
let inflight = null;

async function refresh({ force = false } = {}) {
  if (!force && Date.now() - loadedAt < TTL_MS) return;
  if (inflight) return inflight;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return;
  inflight = (async () => {
    try {
      const res = await fetch(`${SUPABASE_URL()}/rest/v1/tenants?select=id,stripe_connect_account_id,stripe_connect_charges_enabled&stripe_connect_account_id=not.is.null`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
      if (!res.ok) return;
      const rows = await res.json();
      if (!Array.isArray(rows)) return;
      _load(rows);
    } catch { /* keep the last good copy */ } finally { inflight = null; }
  })();
  return inflight;
}

function _load(rows) {
  byTenant = new Map();
  byAccount = new Map();
  for (const r of rows || []) {
    if (!r || !/^acct_[A-Za-z0-9]+$/.test(r.stripe_connect_account_id || '')) continue;
    byTenant.set(r.id, { accountId: r.stripe_connect_account_id, chargesEnabled: r.stripe_connect_charges_enabled === true });
    byAccount.set(r.stripe_connect_account_id, r.id);
  }
  loadedAt = Date.now();
}

const ownContext = () => ({ kind: 'own', tenantId: ownerTenant(), accountId: null, headers: { Authorization: `Bearer ${ownKey()}` } });
const connectedContext = (tenantId, accountId) => ({
  kind: 'connected', tenantId, accountId,
  headers: { Authorization: `Bearer ${platformKey()}`, 'Stripe-Account': accountId },
});

/** The Stripe account to use for a business's card payments, or null (refuse the payment). Pass `{ requireReady: false }` to read or close a checkout that already exists. */
async function stripeContext(tenantId, { requireReady = true } = {}) {
  if (isOwner(tenantId)) return ownContext();
  if (!platformKey()) return null;
  await refresh();
  const row = byTenant.get(tenantId);
  // Starting a NEW checkout needs a ready account; reading or closing one that already
  // exists (requireReady: false) only needs the account to be known.
  if (!row || (requireReady && !row.chargesEnabled)) return null;
  return connectedContext(tenantId, row.accountId);
}

/**
 * The context for a Stripe event that came from a connected account (event.account).
 * Null when the account is not one of ours. Used by the webhook; the account only has
 * to be known, not "ready", because a payment already made must still be recorded.
 */
async function contextForAccount(accountId) {
  if (!/^acct_[A-Za-z0-9]+$/.test(String(accountId || '')) || !platformKey()) return null;
  await refresh();
  const tenantId = byAccount.get(accountId);
  return tenantId ? connectedContext(tenantId, accountId) : null;
}

/** For tests: replace the loaded businesses. */
function _setConnected(rows) { _load(rows); }

module.exports = { stripeContext, contextForAccount, ownContext, isOwner, ownerTenant, refresh, _setConnected };
