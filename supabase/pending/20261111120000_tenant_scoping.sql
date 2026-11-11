-- Tenant scoping for the shared tables that had no tenant column.
--
-- DRAFT: not applied to the live project. Reviewed and tested locally only
-- (scripts/db-test.sh applies every file in supabase/pending after the
-- baseline). When approved, apply it to live, then rebuild the baseline and
-- move this file into supabase/migrations (see supabase/baseline/README.md).
--
-- Why: of the 18 tables listed in the SaaS audit as having no tenant_id, most
-- are already safe (see the table comments at the end). Four were not:
--
--   operator_push_subscriptions  The push sender returned the phones of EVERY
--                                business's office staff, so a second business
--                                would get the first one's booking alerts.
--   notification_channel_settings  One global row that staff of ANY business
--                                could rewrite.
--   notification_queue / _log    Had no tenant and no staff access at all, so
--                                the delivery status views showed staff nothing.
--
-- Nothing here changes what the single existing business sees: every existing
-- row becomes EV Exec's, and the old push function is left in place until the
-- apps have moved to the new one.

-- ─── 1. Office push devices belong to a business ─────────────────────────────

alter table public.operator_push_subscriptions
  add column if not exists tenant_id uuid references public.tenants (id) on delete cascade;

-- The business is always taken from the subscriber's own staff role, never
-- from what the caller sends. A platform super admin has no business of their
-- own: their devices (tenant_id null) get every business's alerts.
create or replace function private.set_push_subscription_tenant()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
begin
  new.tenant_id := (
    select tu.tenant_id from public.tenant_users tu
    where tu.user_id = new.user_id and tu.tenant_id is not null
    order by tu.created_at
    limit 1
  );
  return new;
end;
$fn$;
revoke all on function private.set_push_subscription_tenant() from public, anon, authenticated;

drop trigger if exists set_push_subscription_tenant on public.operator_push_subscriptions;
create trigger set_push_subscription_tenant
  before insert or update of user_id on public.operator_push_subscriptions
  for each row execute function private.set_push_subscription_tenant();

update public.operator_push_subscriptions s
set tenant_id = (
  select tu.tenant_id from public.tenant_users tu
  where tu.user_id = s.user_id and tu.tenant_id is not null
  order by tu.created_at limit 1
)
where s.tenant_id is null;

create index if not exists operator_push_subscriptions_tenant_idx
  on public.operator_push_subscriptions (tenant_id);

-- The push sender asks for ONE business's devices. Same secret check and same
-- callers (the Operator app's push route) as get_push_dispatch_bundle; a new
-- name so the old one keeps working until every caller has switched.
create or replace function public.get_push_dispatch_bundle_for_tenant(p_secret text, p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare c public.push_config; v jsonb;
begin
  select * into c from public.push_config where id = true;
  if c.webhook_secret is null or p_secret is distinct from c.webhook_secret then
    return null;
  end if;
  if p_tenant_id is null then
    return null; -- the caller must say which business the alert is for
  end if;
  select jsonb_build_object(
    'vapid_public',  c.vapid_public,
    'vapid_private', c.vapid_private,
    'vapid_subject', coalesce(c.vapid_subject, 'mailto:book@evexec.co.uk'),
    'subscriptions', coalesce((
      select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
      from public.operator_push_subscriptions s
      where (s.tenant_id = p_tenant_id or s.tenant_id is null)
        and exists (
          select 1 from public.tenant_users tu
          where tu.user_id = s.user_id
            and tu.role in ('super_admin', 'operator_admin', 'dispatcher')
        )), '[]'::jsonb)
  ) into v;
  return v;
end;
$fn$;
revoke all on function public.get_push_dispatch_bundle_for_tenant(text, uuid) from public, anon, authenticated, service_role;
-- anon: the Operator app's push route calls it without a login (it is gated by the secret).
grant execute on function public.get_push_dispatch_bundle_for_tenant(text, uuid) to anon, authenticated, service_role;

-- ─── 2. Notification settings are per business ───────────────────────────────

alter table public.notification_channel_settings
  add column if not exists tenant_id uuid references public.tenants (id) on delete cascade;

-- The one existing row is EV Exec's.
update public.notification_channel_settings
set tenant_id = '00000000-0000-0000-0000-000000000001'
where tenant_id is null;

alter table public.notification_channel_settings alter column tenant_id set not null;
alter table public.notification_channel_settings drop constraint if exists notification_channel_settings_singleton;
alter table public.notification_channel_settings drop constraint if exists notification_channel_settings_pkey;
alter table public.notification_channel_settings add constraint notification_channel_settings_pkey primary key (tenant_id);

drop policy if exists staff_write_notification_channel_settings on public.notification_channel_settings;
create policy staff_select_notification_channel_settings on public.notification_channel_settings
  as permissive for select to authenticated
  using (private.staff_for_tenant(tenant_id));
create policy staff_insert_notification_channel_settings on public.notification_channel_settings
  as permissive for insert to authenticated
  with check (private.staff_for_tenant(tenant_id));
create policy staff_update_notification_channel_settings on public.notification_channel_settings
  as permissive for update to authenticated
  using (private.staff_for_tenant(tenant_id))
  with check (private.staff_for_tenant(tenant_id));

-- ─── 3. The notification queue and log belong to a business ─────────────────

-- The business is the booking's. Rows with no booking keep the default
-- (EV Exec), like every other tenant column.
create or replace function private.set_tenant_from_booking()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
begin
  if new.booking_id is not null then
    new.tenant_id := coalesce(
      (select b.tenant_id from public.bookings b where b.id = new.booking_id),
      new.tenant_id
    );
  end if;
  return new;
end;
$fn$;
revoke all on function private.set_tenant_from_booking() from public, anon, authenticated;

alter table public.notification_queue
  add column if not exists tenant_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid;
alter table public.notification_log
  add column if not exists tenant_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid;

update public.notification_queue q
set tenant_id = b.tenant_id
from public.bookings b
where b.id = q.booking_id and q.tenant_id is distinct from b.tenant_id;

update public.notification_log l
set tenant_id = b.tenant_id
from public.bookings b
where b.id = l.booking_id and l.tenant_id is distinct from b.tenant_id;

alter table public.notification_queue
  add constraint notification_queue_tenant_id_fkey foreign key (tenant_id) references public.tenants (id);
alter table public.notification_log
  add constraint notification_log_tenant_id_fkey foreign key (tenant_id) references public.tenants (id);

create index if not exists notification_queue_tenant_idx on public.notification_queue (tenant_id);
create index if not exists notification_log_tenant_idx on public.notification_log (tenant_id);

drop trigger if exists notification_queue_set_tenant on public.notification_queue;
create trigger notification_queue_set_tenant
  before insert on public.notification_queue
  for each row execute function private.set_tenant_from_booking();
drop trigger if exists notification_log_set_tenant on public.notification_log;
create trigger notification_log_set_tenant
  before insert on public.notification_log
  for each row execute function private.set_tenant_from_booking();

-- Office staff read their own business's rows (this is what the delivery
-- status views, which run as the signed-in user, need). Writes stay with the
-- servers.
create policy staff_select_notification_queue on public.notification_queue
  as permissive for select to authenticated
  using (private.staff_for_tenant(tenant_id));
create policy staff_select_notification_log on public.notification_log
  as permissive for select to authenticated
  using (private.staff_for_tenant(tenant_id));

-- ─── 4. The no-show alert says which business it is for ─────────────────────
-- Same function as 20261110200016, with tenant_id added to what it sends, so
-- the push route can pick that business's devices. (The new-booking alert
-- already sends the whole booking row, which carries tenant_id.)

create or replace function public.notify_operator_no_show() returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare v_secret text; v_driver text; v_when text; v_where text;
begin
  if not ((new.status = 'No Show' and old.status is distinct from 'No Show')
    or (new.status = 'Cancelled' and old.status is distinct from 'Cancelled'
        and coalesce(new.driver_notes, '') like '%[No Show]%')) then return new; end if;
  begin
    select webhook_secret into v_secret from public.push_config where id = true;
    if v_secret is null then return new; end if;
    select coalesce(nullif(d.full_name, ''), d.name) into v_driver from public.drivers d where d.id = new.assigned_driver_id;
    v_when  := concat_ws(' ', left(new.travel_time, 5), to_char(new.travel_date, 'DD/MM/YYYY'));
    v_where := coalesce(nullif(new.pickup_location, ''), new.airport);
    perform net.http_post(
      url := 'https://evexecoperator.vercel.app/api/push/dispatch',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
      body := jsonb_build_object(
        'tenant_id', new.tenant_id,
        'notification', jsonb_build_object(
          'title', 'No-show: ' || coalesce(new.customer_name, 'customer'),
          'body',  concat_ws(' · ', v_where, nullif(v_when, ''), 'Driver ' || v_driver, 'Ref ' || new.ref),
          'url',   '/operator/bookings?q=' || new.ref,
          'tag',   'noshow-' || new.ref)));
  exception when others then null; -- An alert must never stop the driver recording the no-show.
  end;
  return new;
end; $fn$;

-- ─── 5. Where each remaining table stands (for the next person to read) ─────
-- No change needed: a table is safe for several businesses when staff reads go
-- through the owning booking or driver, or when only the owner of the row (one
-- driver, one customer) or the servers can touch it.

comment on table public.booking_audit_log is 'Tenant: through its booking (staff_select policy checks bookings.tenant_id). No tenant column needed.';
comment on table public.driver_locations is 'Tenant: through its driver (staff_select policy checks drivers.tenant_id); a driver reads and writes only their own row.';
comment on table public.driver_unavailable_dates is 'Tenant: through its driver (staff_select policy checks drivers.tenant_id); a driver manages only their own dates.';
comment on table public.job_proofs is 'Tenant: through its booking (staff_select policy checks bookings.tenant_id); a driver inserts only for their own jobs.';
comment on table public.booking_expenses is 'Tenant: a driver sees only expenses on their own jobs; no staff policy, so staff go through the servers.';
comment on table public.driver_events is 'Tenant: a driver sees only their own events; inserts are from the servers.';
comment on table public.push_subscriptions is 'Tenant: each row belongs to one driver or customer, who alone can touch it.';
comment on table public.saved_addresses is 'Tenant: each row belongs to one customer account; no client access (servers only).';
comment on table public.booking_photos is 'Tenant: servers only (no client policy), rows tied to a booking.';
comment on table public.driver_messages is 'Tenant: servers only (no client policy). The Chat feature was removed from the Driver App.';
comment on table public.driver_shifts is 'Tenant: servers only (no client policy).';
comment on table public.push_config is 'Platform-wide on purpose: the push keys and webhook secret are shared by all businesses. Servers only.';
comment on table public.stripe_webhook_events is 'Platform-wide on purpose: one Stripe account today. Servers only. Needs a tenant (or Connect account) mapping if each business gets its own Stripe account.';
comment on table public.stripe_webhook_rejections is 'Platform-wide on purpose: failed signature checks. Servers only.';

-- ─── 6. EV Exec's own letterhead details live in its business row ───────────
-- The apps used to carry EV Exec's licence number, website and tagline in code.
-- They now read them from tenants.brand, so another business gets its own and
-- nothing of EV Exec's. This fills only keys that are not already set, so it is
-- safe to run twice and never overwrites something EV Exec has since changed.

update public.tenants
set brand = jsonb_build_object(
      'licence',  'PHO0079',
      'site_url', 'https://www.evexec.co.uk',
      'tagline',  'Premium airport transfers from Blackpool & the Fylde Coast')
    || coalesce(brand, '{}'::jsonb)
where id = '00000000-0000-0000-0000-000000000001';
