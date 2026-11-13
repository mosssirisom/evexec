-- A business's website address (tenants.brand.site_url) decides which business a visitor's
-- domain belongs to (the website matches the visitor's domain to it). So it must be set only
-- by the platform owner, and two businesses must never share a domain: otherwise one could
-- take over another's customers. Additive; no DROP statements.

-- "https://www.Example.co.uk/" -> "example.co.uk" (scheme, www and trailing slash ignored).
create or replace function private.site_host(p_url text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(regexp_replace(regexp_replace(lower(btrim(coalesce(p_url, ''))), '^https?://', ''), '^www\.', ''), '/+$', ''), '');
$$;

-- No two businesses on the same domain, even through a direct update.
create unique index if not exists tenants_site_host_unique
  on public.tenants ((private.site_host(brand ->> 'site_url')))
  where private.site_host(brand ->> 'site_url') is not null;

-- Platform owner only. A blank address clears it. Must be https and a plain domain (no path).
create or replace function public.set_tenant_site(p_tenant_id uuid, p_site_url text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v text := lower(btrim(coalesce(p_site_url, '')));
begin
  if not private.is_super_admin() then
    raise exception 'Only the platform owner can set a business''s website address' using errcode = '42501';
  end if;

  if v <> '' then
    v := regexp_replace(v, '/+$', '');
    if v !~ '^https://([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$' then
      raise exception 'The website address must look like https://www.example.co.uk' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.tenants t
       where t.id <> p_tenant_id
         and private.site_host(t.brand ->> 'site_url') = private.site_host(v)
    ) then
      raise exception 'Another business already uses that website address' using errcode = '23505';
    end if;
  end if;

  update public.tenants
     set brand = case when v = '' then coalesce(brand, '{}'::jsonb) - 'site_url'
                      else jsonb_set(coalesce(brand, '{}'::jsonb), '{site_url}', to_jsonb(v)) end,
         updated_at = now()
   where id = p_tenant_id;
  if not found then
    raise exception 'Unknown business' using errcode = 'P0002';
  end if;
  return jsonb_build_object('tenant_id', p_tenant_id, 'site_url', nullif(v, ''));
end;
$fn$;

revoke all on function public.set_tenant_site(uuid, text) from public, anon;
grant execute on function public.set_tenant_site(uuid, text) to authenticated, service_role;
