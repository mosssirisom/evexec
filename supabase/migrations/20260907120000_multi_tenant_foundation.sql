-- Multi-tenant foundation.
--
-- Adds a tenant registry (public.tenants, public.tenant_users) and a
-- tenant_id column on every table that the operator-dashboard "staff" role
-- currently reads/writes without any per-business scoping. Backfills all
-- existing rows to a single "EV Exec" tenant (fixed id below) so this is a
-- no-op for the live business today, then locks tenant_id to NOT NULL with
-- a default of that same tenant, so any insert path this migration missed
-- still lands correctly rather than erroring out.
--
-- Scope deliberately excludes collapsing the bookings.status /
-- payment_method value drift (legacy lowercase values are still allowed
-- alongside canonical ones) -- that needs a full audit of every insert/
-- update call site across all three repos first, and isn't required for
-- tenant isolation. Tracked as a separate follow-up.

begin;

-- 1. Tenant registry -------------------------------------------------------

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  contact_email text,
  contact_phone text,
  brand jsonb not null default '{}'::jsonb,
  stripe_connect_account_id text,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.tenants is 'One row per operator business (tenant) on the platform.';

create table if not exists public.tenant_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('super_admin', 'operator_admin', 'dispatcher', 'driver')),
  created_at timestamptz not null default now(),
  constraint tenant_users_tenant_role_consistency check (
    (role = 'super_admin' and tenant_id is null)
    or (role <> 'super_admin' and tenant_id is not null)
  ),
  unique (tenant_id, user_id, role)
);

comment on table public.tenant_users is 'Maps an auth.users row to a tenant + role. super_admin rows have tenant_id = null (platform-wide).';

-- Only one super_admin row per user (tenant_id is null for all of them, so
-- the (tenant_id, user_id, role) unique constraint above does not prevent dupes).
create unique index if not exists tenant_users_one_super_admin_per_user
  on public.tenant_users (user_id)
  where role = 'super_admin';

alter table public.tenants enable row level security;
alter table public.tenant_users enable row level security;

-- Seed tenant: the existing single-tenant business. Fixed id so later
-- statements in this migration (and future ones) can reference it directly
-- instead of via subquery.
insert into public.tenants (id, slug, name, contact_email, status)
values ('00000000-0000-0000-0000-000000000001', 'ev-exec', 'EV Exec', 'operator@evexec.co.uk', 'active')
on conflict (id) do nothing;

-- 2. Tenant-membership helpers -----------------------------------------------
-- Defined as SECURITY DEFINER functions (same convention already used by
-- private.is_staff() / private.is_known_driver() elsewhere in this schema)
-- rather than inline subqueries on tenant_users referencing itself from its
-- own RLS policy -- that exact self-referential pattern on `drivers` already
-- caused a recursion bug here once (see migration
-- fix_drivers_select_recursion, 20260611192654), so it's avoided here too.

create or replace function private.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid() and tu.role = 'super_admin'
  );
$$;

create or replace function private.is_member_of_tenant(target_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid()
      and (tu.role = 'super_admin' or tu.tenant_id = target_tenant)
  );
$$;

-- Reads: a user can see their own tenant's row (any role), plus every
-- tenant if they are a super_admin. No insert/update/delete policies for
-- anon/authenticated -- tenant management is a backend-only (service-role)
-- operation.
create policy tenants_self_select on public.tenants
  for select
  using (private.is_member_of_tenant(tenants.id));

create policy tenant_users_self_select on public.tenant_users
  for select
  using (user_id = auth.uid() or private.is_super_admin());

-- 3. Tenant-scoping helper for staff (operator_admin/dispatcher) access -----

create or replace function private.staff_for_tenant(target_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid()
      and (
        tu.role = 'super_admin'
        or (tu.tenant_id = target_tenant and tu.role in ('operator_admin', 'dispatcher'))
      )
  );
$$;

comment on function private.staff_for_tenant(uuid) is
  'True if the calling user is staff (operator_admin/dispatcher) for target_tenant, or a super_admin.';

-- 4. tenant_id on every staff-visible operational table ----------------------

alter table public.bookings        add column if not exists tenant_id uuid references public.tenants(id) default '00000000-0000-0000-0000-000000000001';
alter table public.drivers         add column if not exists tenant_id uuid references public.tenants(id) default '00000000-0000-0000-0000-000000000001';
alter table public.missed_calls    add column if not exists tenant_id uuid references public.tenants(id) default '00000000-0000-0000-0000-000000000001';
alter table public.quote_requests  add column if not exists tenant_id uuid references public.tenants(id) default '00000000-0000-0000-0000-000000000001';
alter table public.contact_messages add column if not exists tenant_id uuid references public.tenants(id) default '00000000-0000-0000-0000-000000000001';
alter table public.reviews         add column if not exists tenant_id uuid references public.tenants(id) default '00000000-0000-0000-0000-000000000001';
alter table public.invoices        add column if not exists tenant_id uuid references public.tenants(id) default '00000000-0000-0000-0000-000000000001';
alter table public.profiles        add column if not exists tenant_id uuid references public.tenants(id) default '00000000-0000-0000-0000-000000000001';

update public.bookings         set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update public.drivers          set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update public.missed_calls     set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update public.quote_requests   set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update public.contact_messages set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update public.reviews          set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update public.invoices         set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update public.profiles         set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;

alter table public.bookings         alter column tenant_id set not null;
alter table public.drivers          alter column tenant_id set not null;
alter table public.missed_calls     alter column tenant_id set not null;
alter table public.quote_requests   alter column tenant_id set not null;
alter table public.contact_messages alter column tenant_id set not null;
alter table public.reviews          alter column tenant_id set not null;
alter table public.invoices         alter column tenant_id set not null;
alter table public.profiles         alter column tenant_id set not null;

create index if not exists bookings_tenant_id_idx        on public.bookings (tenant_id);
create index if not exists drivers_tenant_id_idx         on public.drivers (tenant_id);
create index if not exists missed_calls_tenant_id_idx    on public.missed_calls (tenant_id);
create index if not exists quote_requests_tenant_id_idx  on public.quote_requests (tenant_id);
create index if not exists contact_messages_tenant_id_idx on public.contact_messages (tenant_id);
create index if not exists reviews_tenant_id_idx         on public.reviews (tenant_id);
create index if not exists invoices_tenant_id_idx        on public.invoices (tenant_id);
create index if not exists profiles_tenant_id_idx        on public.profiles (tenant_id);

-- 5. Backfill tenant_users from the existing flat staff allowlist -----------

-- Everyone currently in private.staff_users becomes operator_admin for the
-- EV Exec tenant (this preserves their exact current access level).
insert into public.tenant_users (tenant_id, user_id, role)
select '00000000-0000-0000-0000-000000000001', su.user_id, 'operator_admin'
from private.staff_users su
on conflict (tenant_id, user_id, role) do nothing;

-- The account holder additionally becomes the platform super_admin.
insert into public.tenant_users (tenant_id, user_id, role)
values (null, '7452a711-0dcf-4cef-8689-790b7e50ac38', 'super_admin')
on conflict do nothing;

-- Drivers that already have a matching auth.users row get a driver role
-- entry too, for the tenant/user registry (not required for their existing
-- RLS access, which is already scoped directly by drivers.id / email).
insert into public.tenant_users (tenant_id, user_id, role)
select d.tenant_id, d.id, 'driver'
from public.drivers d
where exists (select 1 from auth.users u where u.id = d.id)
on conflict (tenant_id, user_id, role) do nothing;

-- 6. Rewrite staff RLS policies to be tenant-scoped --------------------------
-- Replaces every "private.is_staff()" (any staff row sees everything) policy
-- with "private.staff_for_tenant(tenant_id)" (only that row's own tenant,
-- unless the caller is a super_admin).

drop policy if exists staff_all_bookings on public.bookings;
create policy staff_all_bookings on public.bookings
  for all
  using (private.staff_for_tenant(tenant_id))
  with check (private.staff_for_tenant(tenant_id));

drop policy if exists staff_all_drivers on public.drivers;
create policy staff_all_drivers on public.drivers
  for all
  using (private.staff_for_tenant(tenant_id))
  with check (private.staff_for_tenant(tenant_id));

drop policy if exists staff_all_missed_calls on public.missed_calls;
create policy staff_all_missed_calls on public.missed_calls
  for all
  using (private.staff_for_tenant(tenant_id))
  with check (private.staff_for_tenant(tenant_id));

drop policy if exists staff_all_quote_requests on public.quote_requests;
create policy staff_all_quote_requests on public.quote_requests
  for all
  using (private.staff_for_tenant(tenant_id))
  with check (private.staff_for_tenant(tenant_id));

drop policy if exists staff_all_contact_messages on public.contact_messages;
create policy staff_all_contact_messages on public.contact_messages
  for all
  using (private.staff_for_tenant(tenant_id))
  with check (private.staff_for_tenant(tenant_id));

drop policy if exists staff_all_invoices on public.invoices;
create policy staff_all_invoices on public.invoices
  for all
  using (private.staff_for_tenant(tenant_id))
  with check (private.staff_for_tenant(tenant_id));

drop policy if exists staff_select_booking_audit_log on public.booking_audit_log;
create policy staff_select_booking_audit_log on public.booking_audit_log
  for select
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_audit_log.booking_id
        and private.staff_for_tenant(b.tenant_id)
    )
  );

-- 7. Close gaps that become tenant-isolation bypasses now tenant_id exists --

-- These allowed ANY unauthenticated (anon) or logged-in (authenticated)
-- request to insert an arbitrary bookings row with with_check=true. The
-- live booking flow never uses them (evexec's backend inserts with the
-- service-role key, which bypasses RLS entirely) -- they were already dead,
-- unauthenticated write access to the live bookings table. Now that
-- tenant_id exists, leaving them would also let anyone insert rows under
-- any tenant_id they choose, which defeats the isolation this migration
-- adds. Booking creation must go through the backend API from here on.
drop policy if exists anon_insert_bookings on public.bookings;
drop policy if exists authenticated_insert_bookings on public.bookings;

-- Unassigned pending/accepted bookings were visible to *any* authenticated
-- driver account regardless of which tenant they drive for. Add a tenant
-- match so a driver only sees their own tenant's unassigned jobs.
drop policy if exists bookings_driver_select on public.bookings;
create policy bookings_driver_select on public.bookings
  for select
  using (
    assigned_driver_id = auth.uid()
    or assigned_driver_id in (select id from public.drivers where email = auth.email())
    or (
      exists (
        select 1 from public.drivers d
        where d.id = auth.uid() and d.tenant_id = bookings.tenant_id
      )
      and assigned_driver_id is null
      and status = any (array['pending', 'accepted'])
    )
  );

commit;
