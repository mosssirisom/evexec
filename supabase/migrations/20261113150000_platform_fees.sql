-- What the platform (Winjo Digital) charges each operator: a default monthly and
-- set-up fee, and an optional per-business rate that overrides it. EV Exec, a
-- customer like any other, is set to £0 (no billing). Amounts are in pence.
--
-- This only RECORDS the rates. It does not bill anyone and calls nothing: no Stripe
-- subscription or invoice is created (that would cost money and needs the owner's
-- approval first). Only a super_admin can read or change the default rates or list
-- every business's rate; a business's own staff can already read its own row, so
-- they can see their own rate. Additive only; no DROP statements.

create table if not exists public.platform_fees (
  id boolean primary key default true check (id),
  default_monthly_pence integer not null default 4900 check (default_monthly_pence between 0 and 1000000),
  default_setup_pence integer not null default 99900 check (default_setup_pence between 0 and 10000000),
  updated_at timestamptz not null default now()
);
insert into public.platform_fees (id) values (true) on conflict (id) do nothing;
alter table public.platform_fees enable row level security;
revoke all on public.platform_fees from public, anon, authenticated;

alter table public.tenants
  add column if not exists monthly_fee_pence integer check (monthly_fee_pence is null or monthly_fee_pence between 0 and 1000000),
  add column if not exists setup_fee_pence integer check (setup_fee_pence is null or setup_fee_pence between 0 and 10000000);

-- EV Exec is a customer like any other, free of charge (owner decision, 13/11/2026).
update public.tenants set monthly_fee_pence = 0, setup_fee_pence = 0
 where slug = 'ev-exec' and monthly_fee_pence is null and setup_fee_pence is null;

create or replace function public.get_platform_fees()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
begin
  if not private.is_super_admin() then
    raise exception 'Only the platform owner can see the fees' using errcode = '42501';
  end if;
  return (select jsonb_build_object('default_monthly_pence', f.default_monthly_pence, 'default_setup_pence', f.default_setup_pence)
            from public.platform_fees f where f.id);
end;
$fn$;

create or replace function public.set_default_fees(p_monthly_pence integer, p_setup_pence integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if not private.is_super_admin() then
    raise exception 'Only the platform owner can change the fees' using errcode = '42501';
  end if;
  if p_monthly_pence is null or p_monthly_pence < 0 or p_monthly_pence > 1000000 then
    raise exception 'The monthly fee must be between £0 and £10,000' using errcode = '22023';
  end if;
  if p_setup_pence is null or p_setup_pence < 0 or p_setup_pence > 10000000 then
    raise exception 'The set-up fee must be between £0 and £100,000' using errcode = '22023';
  end if;
  update public.platform_fees set default_monthly_pence = p_monthly_pence, default_setup_pence = p_setup_pence, updated_at = now() where id;
  return jsonb_build_object('default_monthly_pence', p_monthly_pence, 'default_setup_pence', p_setup_pence);
end;
$fn$;

-- NULL for a fee means "use the default rate".
create or replace function public.set_tenant_fees(p_tenant_id uuid, p_monthly_pence integer, p_setup_pence integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if not private.is_super_admin() then
    raise exception 'Only the platform owner can change a business''s fees' using errcode = '42501';
  end if;
  if p_monthly_pence is not null and (p_monthly_pence < 0 or p_monthly_pence > 1000000) then
    raise exception 'The monthly fee must be between £0 and £10,000' using errcode = '22023';
  end if;
  if p_setup_pence is not null and (p_setup_pence < 0 or p_setup_pence > 10000000) then
    raise exception 'The set-up fee must be between £0 and £100,000' using errcode = '22023';
  end if;
  update public.tenants set monthly_fee_pence = p_monthly_pence, setup_fee_pence = p_setup_pence, updated_at = now() where id = p_tenant_id;
  if not found then
    raise exception 'Unknown business' using errcode = 'P0002';
  end if;
  return jsonb_build_object('tenant_id', p_tenant_id, 'monthly_fee_pence', p_monthly_pence, 'setup_fee_pence', p_setup_pence);
end;
$fn$;

-- Every business with the rate that actually applies to it, and whether it is custom.
create or replace function public.list_tenant_fees()
returns table (tenant_id uuid, slug text, name text, monthly_pence integer, setup_pence integer, custom boolean)
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
begin
  if not private.is_super_admin() then
    raise exception 'Only the platform owner can see the fees' using errcode = '42501';
  end if;
  return query
    select t.id, t.slug, t.name,
           coalesce(t.monthly_fee_pence, f.default_monthly_pence),
           coalesce(t.setup_fee_pence, f.default_setup_pence),
           (t.monthly_fee_pence is not null or t.setup_fee_pence is not null)
      from public.tenants t
      cross join public.platform_fees f
     where f.id
     order by t.created_at;
end;
$fn$;

revoke all on function public.get_platform_fees() from public, anon;
revoke all on function public.set_default_fees(integer, integer) from public, anon;
revoke all on function public.set_tenant_fees(uuid, integer, integer) from public, anon;
revoke all on function public.list_tenant_fees() from public, anon;
grant execute on function public.get_platform_fees() to authenticated, service_role;
grant execute on function public.set_default_fees(integer, integer) to authenticated, service_role;
grant execute on function public.set_tenant_fees(uuid, integer, integer) to authenticated, service_role;
grant execute on function public.list_tenant_fees() to authenticated, service_role;
