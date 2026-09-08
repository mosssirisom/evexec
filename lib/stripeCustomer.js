'use strict';

// Lazily creates (and remembers) a Stripe Customer for a signed-in user, so
// saved payment methods can be attached to something persistent instead of
// the one-off, customer-less Checkout Sessions the booking flow already uses.

const SUPABASE_URL = () => process.env.SUPABASE_URL || 'https://yoltkmhtxwluqxxpewbl.supabase.co';
const SERVICE_KEY  = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

function dbHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    'apikey': SERVICE_KEY(),
    'Authorization': `Bearer ${SERVICE_KEY()}`,
    ...extra
  };
}

async function stripeRequest(path, params) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: params ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {})
    },
    body: params ? params.toString() : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Stripe request failed: ${path}`);
  return data;
}

async function getOrCreateStripeCustomer(user, profile) {
  if (profile?.stripe_customer_id) return profile.stripe_customer_id;

  const params = new URLSearchParams();
  if (user.email) params.set('email', user.email);
  const name = profile?.full_name || user.user_metadata?.full_name;
  if (name) params.set('name', name);
  params.set('metadata[supabase_user_id]', user.id);

  const customer = await stripeRequest('customers', params);

  await fetch(`${SUPABASE_URL()}/rest/v1/profiles`, {
    method: 'POST',
    headers: dbHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({ id: user.id, stripe_customer_id: customer.id, updated_at: new Date().toISOString() })
  });

  return customer.id;
}

module.exports = { stripeRequest, getOrCreateStripeCustomer };
