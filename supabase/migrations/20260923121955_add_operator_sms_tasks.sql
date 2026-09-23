begin;

-- Two-tap operator SMS handoff.
--
-- Same pattern as driver_sms_reminders, but for the customer-facing SMS
-- sends that happen before a driver is ever assigned (booking confirmation,
-- and the "journey unavailable" rejection notice) -- both are email-primary,
-- and previously fell back to a direct Twilio SMS send when the customer
-- had no email on file. That Twilio call is now replaced: the generated
-- message is stored here, every subscribed operator device gets a push
-- notification deep-linking straight to this task, and a member of staff
-- reviews + sends it themselves from their own phone via the native
-- Messages app. No Twilio API call is made for this flow.
--
-- Unlike driver_sms_reminders there's no single "assigned" recipient --
-- any staff member for the tenant can open and action a task, so RLS is
-- staff_for_tenant() only (no per-user ownership column).

create table if not exists public.operator_sms_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default '00000000-0000-0000-0000-000000000001' references public.tenants(id),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  kind text not null check (kind in ('confirmation', 'rejection')),
  customer_name text,
  customer_phone text not null,
  message text not null,
  status text not null default 'pending' check (status in ('pending', 'opened', 'sent')),
  pushed_at timestamptz,
  opened_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (booking_id, kind)
);

comment on table public.operator_sms_tasks is
  'Customer-facing SMS (booking confirmation / rejection, email-primary with no email on file) handed off to staff to send from their own phone via the native Messages app -- the "two-tap automation" -- replacing a direct Twilio send. status: pending (queued) -> opened (a staff member viewed the task) -> sent (explicitly confirmed).';

create index if not exists operator_sms_tasks_tenant_id_idx on public.operator_sms_tasks (tenant_id);
create index if not exists operator_sms_tasks_pending_push_idx on public.operator_sms_tasks (id) where status = 'pending' and pushed_at is null;

alter table public.operator_sms_tasks enable row level security;

create policy staff_select_operator_sms_tasks on public.operator_sms_tasks
  for select
  using (private.staff_for_tenant(tenant_id));

create policy staff_update_operator_sms_tasks on public.operator_sms_tasks
  for update
  using (private.staff_for_tenant(tenant_id))
  with check (private.staff_for_tenant(tenant_id));

-- No insert policy for anon/authenticated -- rows are only ever created by
-- evexec's backend using the service-role key, which bypasses RLS entirely.

commit;
