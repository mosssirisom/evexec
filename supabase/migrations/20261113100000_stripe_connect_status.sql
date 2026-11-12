-- Stripe Connect, phase 1 (docs/payments/stripe-connect-design.md).
-- Where each operator's own Stripe account stands. tenants.stripe_connect_account_id
-- (already there) holds the connected account id. These record what Stripe last
-- told us, so the app can show the state and the payment code can check it
-- without a call to Stripe every time. Written only by the Operator app's server
-- (service role); staff can read them like the rest of their business row.
-- Additive only; no DROP statements.

alter table public.tenants
  add column if not exists stripe_connect_charges_enabled boolean not null default false,
  add column if not exists stripe_connect_details_submitted boolean not null default false,
  add column if not exists stripe_connect_checked_at timestamptz;
