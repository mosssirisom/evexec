-- Fixes for the security-advisor / cross-tenant findings from the
-- 2026-09-22 SaaS-resale-readiness audit (see CLAUDE.md). Applied directly
-- to the live project on 2026-09-22; this file keeps migration history
-- accurate for anyone rebuilding the project from scratch.

begin;

-- 1. queue_customer_sms: SECURITY DEFINER, callable by any authenticated user
-- (needed for the legit operator accept/reject flow in booking-response/route.ts,
-- which only checks the caller has *a* valid session, not that they're staff).
-- With no internal check, any authenticated account (e.g. any customer login)
-- could invoke this RPC directly with an arbitrary ref/recipient/body and queue
-- an SMS to any phone number via the business's paid Twilio number. Add the
-- missing authorization check: the caller must be staff for the tenant that
-- owns the referenced booking. Silently no-ops otherwise, matching this
-- function's existing convention for invalid input.
create or replace function public.queue_customer_sms(
  p_ref text, p_recipient text, p_body text, p_type text default 'operator_response'::text
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare v_id uuid; v_tenant uuid;
begin
  if p_recipient is null or btrim(p_recipient) = '' or p_body is null then return; end if;
  select id, tenant_id into v_id, v_tenant from public.bookings where ref = p_ref;
  if v_id is null then return; end if;
  if not private.staff_for_tenant(v_tenant) then return; end if;
  insert into public.notification_queue
    (id, booking_id, type, channel, recipient, body, status, attempts, next_attempt_at, created_at)
  values
    (gen_random_uuid(), v_id, p_type, 'sms', p_recipient, p_body, 'pending', 0, now(), now());
end;
$fn$;

-- 2. unregister_operator_push: deleted by endpoint alone, no ownership check --
-- any authenticated user who knew/guessed another user's endpoint could
-- unregister their push device. Scope the delete to the caller's own row.
create or replace function public.unregister_operator_push(p_endpoint text)
returns void
language sql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  delete from public.operator_push_subscriptions
  where endpoint = p_endpoint and user_id = auth.uid();
$fn$;

-- 3. driver_locations: staff read policy used private.is_staff() (any staff of
-- any tenant), not tenant-scoped -- harmless with one tenant today, but a
-- direct cross-tenant GPS leak the moment a second tenant is onboarded.
-- Bring in line with the tenant-scoped pattern already used elsewhere.
drop policy if exists staff_select_driver_locations on public.driver_locations;
create policy staff_select_driver_locations on public.driver_locations
  for select
  using (
    exists (
      select 1 from public.drivers d
      where d.id = driver_locations.driver_id
        and private.staff_for_tenant(d.tenant_id)
    )
  );

-- 4. job_proofs: same issue -- staff read policy used private.is_staff()
-- instead of tenant scoping via the booking's tenant.
drop policy if exists staff_select_job_proofs on public.job_proofs;
create policy staff_select_job_proofs on public.job_proofs
  for select
  using (
    exists (
      select 1 from public.bookings b
      where b.id = job_proofs.booking_id
        and private.staff_for_tenant(b.tenant_id)
    )
  );

-- 5. audit_log: staff select policy checked role only, no tenant_id column
-- existed to scope by. Add tenant_id (backfilled from the actor's own
-- tenant_users membership, defaulting to the single existing tenant), a
-- trigger to keep populating it on future inserts, and re-scope the policy.
alter table public.audit_log add column if not exists tenant_id uuid references public.tenants(id);

update public.audit_log al
set tenant_id = coalesce(
  (select tu.tenant_id from public.tenant_users tu where tu.user_id = al.actor_id and tu.tenant_id is not null limit 1),
  '00000000-0000-0000-0000-000000000001'
)
where tenant_id is null;

alter table public.audit_log alter column tenant_id set default '00000000-0000-0000-0000-000000000001';
alter table public.audit_log alter column tenant_id set not null;
create index if not exists audit_log_tenant_id_idx on public.audit_log (tenant_id);

create or replace function private.set_audit_log_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.tenant_id is null then
    new.tenant_id := coalesce(
      (select tu.tenant_id from public.tenant_users tu where tu.user_id = new.actor_id and tu.tenant_id is not null limit 1),
      '00000000-0000-0000-0000-000000000001'
    );
  end if;
  return new;
end;
$fn$;

drop trigger if exists audit_log_set_tenant on public.audit_log;
create trigger audit_log_set_tenant
before insert on public.audit_log
for each row execute function private.set_audit_log_tenant();

drop policy if exists audit_log_select_staff on public.audit_log;
create policy audit_log_select_staff on public.audit_log
  for select
  using (private.staff_for_tenant(tenant_id));

-- 6. error_log: same gap. No reliable actor link to derive tenant from
-- (user_email is free-text, not joined to auth.users), so add tenant_id
-- defaulted to the single existing tenant -- correct for today, and
-- structurally ready once call sites pass a real tenant_id per row.
alter table public.error_log add column if not exists tenant_id uuid references public.tenants(id) default '00000000-0000-0000-0000-000000000001';
update public.error_log set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
alter table public.error_log alter column tenant_id set not null;
create index if not exists error_log_tenant_id_idx on public.error_log (tenant_id);

drop policy if exists error_log_select_staff on public.error_log;
create policy error_log_select_staff on public.error_log
  for select
  using (private.staff_for_tenant(tenant_id));

commit;
