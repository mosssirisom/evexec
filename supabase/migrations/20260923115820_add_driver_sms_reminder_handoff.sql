begin;

-- Driver-confirmed SMS reminder handoff.
--
-- Replaces the Twilio-sent customer reminder SMS (the no-email-on-file
-- fallback branch of the 7-day / 24-hour reminder cron in
-- evexec/api/reminders/trigger.js) with a driver-confirmed workflow: the
-- backend generates the reminder message and stores it here instead of
-- calling Twilio; the assigned driver gets a push notification deep-linking
-- to a reminder screen in the driver app, opens the native Messages app
-- with the number + message pre-filled via an sms: URL, sends it from their
-- own phone, then confirms back in the app. No Twilio API call is made for
-- this flow.
--
-- unique(booking_id, reminder_type) is the dedup guard: the reminder cron
-- can upsert with ON CONFLICT DO NOTHING (PostgREST: resolution=ignore-
-- duplicates) so a re-run within the same window never creates a second
-- row, and the driver reopening the reminder screen always lands on the
-- same record rather than spawning a duplicate.

create table if not exists public.driver_sms_reminders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default '00000000-0000-0000-0000-000000000001' references public.tenants(id),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  reminder_type text not null check (reminder_type in ('7day', '24hr')),
  customer_name text,
  customer_phone text not null,
  travel_date date,
  travel_time text,
  message text not null,
  status text not null default 'pending' check (status in ('pending', 'opened', 'sent')),
  pushed_at timestamptz,
  opened_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (booking_id, reminder_type)
);

comment on table public.driver_sms_reminders is
  'Customer reminder SMS handed off to the assigned driver to send from their own phone via the native Messages app, replacing a direct Twilio send. status: pending (queued) -> opened (driver viewed the reminder screen) -> sent (driver explicitly confirmed).';

create index if not exists driver_sms_reminders_tenant_id_idx on public.driver_sms_reminders (tenant_id);
create index if not exists driver_sms_reminders_driver_id_idx on public.driver_sms_reminders (driver_id);
create index if not exists driver_sms_reminders_pending_push_idx on public.driver_sms_reminders (id) where status = 'pending' and pushed_at is null;

alter table public.driver_sms_reminders enable row level security;

-- Driver can see and update (opened_at/status/sent_at) only their own rows,
-- matching the existing bookings_driver_select ownership pattern (driver_id
-- match either by auth uid directly, or by the drivers row whose email
-- matches the authenticated user, for drivers not yet linked 1:1 to auth.uid()).
create policy driver_select_own_sms_reminders on public.driver_sms_reminders
  for select
  using (
    driver_id = auth.uid()
    or driver_id in (select id from public.drivers where email = auth.email())
  );

create policy driver_update_own_sms_reminders on public.driver_sms_reminders
  for update
  using (
    driver_id = auth.uid()
    or driver_id in (select id from public.drivers where email = auth.email())
  )
  with check (
    driver_id = auth.uid()
    or driver_id in (select id from public.drivers where email = auth.email())
  );

-- Staff can see their tenant's handoffs (for visibility/support), never
-- another tenant's. No insert policy for anon/authenticated -- rows are
-- only ever created by evexec's backend using the service-role key, which
-- bypasses RLS entirely.
create policy staff_select_sms_reminders on public.driver_sms_reminders
  for select
  using (private.staff_for_tenant(tenant_id));

commit;
