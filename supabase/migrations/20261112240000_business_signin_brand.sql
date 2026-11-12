-- What a business's sign-in screens may show before anyone is signed in: its name,
-- logo and two colours, looked up by its short name (slug). Nothing else is
-- returned (no contact details, no ids), only for active businesses, and colours
-- that are not #RRGGBB come back empty. Used by the Driver App sign-in screen.
-- Additive; no DROP.

create or replace function public.business_signin_brand(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select jsonb_build_object(
    'name', t.name,
    'logo_url', nullif(t.brand ->> 'logo_url', ''),
    'primary', case when t.brand #>> '{colors,primary}' ~ '^#[0-9A-Fa-f]{6}$' then t.brand #>> '{colors,primary}' end,
    'accent', case when t.brand #>> '{colors,accent}' ~ '^#[0-9A-Fa-f]{6}$' then t.brand #>> '{colors,accent}' end
  )
  from public.tenants t
  where t.slug = lower(btrim(coalesce(p_slug, ''))) and t.status = 'active'
  limit 1;
$fn$;

revoke all on function public.business_signin_brand(text) from public;
grant execute on function public.business_signin_brand(text) to anon, authenticated, service_role;
