-- Durable record of Stripe webhook deliveries for the website's
-- /api/payment/stripe-webhook (Vercel keeps function logs for one hour only).
--
--  stripe_webhook_events     one row per verified Stripe event id: how many
--                            times it arrived and what the handler did.
--  stripe_webhook_rejections deliveries that failed signature checks, with
--                            diagnostics only (no secrets, no payload).
--
-- Service role only: RLS on with no policies, and no grants to anon or
-- authenticated. Platform-level operational logs like notification_log, not
-- tenant data, so no tenant_id. Additive and reversible.

create table if not exists public.stripe_webhook_events (
  event_id        text primary key,
  event_type      text not null,
  livemode        boolean,
  session_id      text,
  booking_id      uuid,
  status          text not null default 'received',
  detail          text,
  attempts        integer not null default 1,
  received_at     timestamptz not null default now(),
  last_attempt_at timestamptz not null default now(),
  processed_at    timestamptz,
  notified_at     timestamptz
);

comment on table public.stripe_webhook_events is
  'Website Stripe webhook deliveries by event id. status: received | retrying | failed | recorded | already_paid | duplicate_payment | not_paid | no_reference | unknown_booking | ignored.';

create index if not exists stripe_webhook_events_booking_idx on public.stripe_webhook_events (booking_id);
create index if not exists stripe_webhook_events_session_idx on public.stripe_webhook_events (session_id);

create table if not exists public.stripe_webhook_rejections (
  id               bigint generated always as identity primary key,
  received_at      timestamptz not null default now(),
  reason           text not null,
  claimed_event_id text,
  diagnostics      jsonb
);

create index if not exists stripe_webhook_rejections_received_idx on public.stripe_webhook_rejections (received_at desc);

alter table public.stripe_webhook_events enable row level security;
alter table public.stripe_webhook_rejections enable row level security;
revoke all on public.stripe_webhook_events from anon, authenticated;
revoke all on public.stripe_webhook_rejections from anon, authenticated;
grant select, insert, update on public.stripe_webhook_events to service_role;
grant select, insert on public.stripe_webhook_rejections to service_role;

-- Records an arrival atomically: first delivery inserts, repeats bump attempts.
create or replace function public.stripe_webhook_event_seen(
  p_event_id text, p_event_type text, p_livemode boolean, p_session_id text
) returns public.stripe_webhook_events
language sql
security invoker
set search_path = ''
as $$
  insert into public.stripe_webhook_events as e (event_id, event_type, livemode, session_id)
  values (p_event_id, p_event_type, p_livemode, p_session_id)
  on conflict (event_id) do update
    set attempts = e.attempts + 1, last_attempt_at = now()
  returning e.*;
$$;

revoke execute on function public.stripe_webhook_event_seen(text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.stripe_webhook_event_seen(text, text, boolean, text) to service_role;
