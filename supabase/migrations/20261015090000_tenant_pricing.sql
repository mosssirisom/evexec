-- Per-operator prices. Each tenant keeps its own fixed airport fares and the
-- extra-stop charge in tenants.pricing:
--   { "airports": [ { "name": "Manchester Airport", "code": "MAN",
--                     "one_way": 90, "return_fare": 160 }, ... ],
--     "extra_stop": 5 }
-- The website reads it (service role) to price new bookings and payments;
-- the Operator app reads it (staff can already read their own tenants row)
-- for Settings → Prices and the New Booking price suggestion.
--
-- Writes only through update_tenant_pricing(): operator_admin of that tenant
-- or super_admin, with the shape and amounts checked. Staff still have no
-- direct UPDATE on tenants.
--
-- EV Exec is seeded with exactly the prices the website and Operator app use
-- today, so nothing changes until an admin edits them.

alter table public.tenants add column if not exists pricing jsonb;

update public.tenants
   set pricing = jsonb_build_object(
         'airports', jsonb_build_array(
           jsonb_build_object('name', 'Manchester Airport',     'code', 'MAN', 'one_way', 90,  'return_fare', 160),
           jsonb_build_object('name', 'Liverpool Airport',      'code', 'LPL', 'one_way', 95,  'return_fare', 170),
           jsonb_build_object('name', 'Leeds Bradford Airport', 'code', 'LBA', 'one_way', 135, 'return_fare', 250),
           jsonb_build_object('name', 'Birmingham Airport',     'code', 'BHX', 'one_way', 215, 'return_fare', 410),
           jsonb_build_object('name', 'Newcastle Airport',      'code', 'NCL', 'one_way', 250, 'return_fare', 480)
         ),
         'extra_stop', 5
       )
 where id = '00000000-0000-0000-0000-000000000001'
   and pricing is null;

create or replace function public.update_tenant_pricing(
  p_tenant_id uuid,
  p_pricing jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_airports jsonb := '[]'::jsonb;
  v_item jsonb;
  v_name text;
  v_code text;
  v_one numeric;
  v_ret numeric;
  v_extra numeric;
  v_names text[] := '{}';
  v_result jsonb;
begin
  if not exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid()
      and (tu.role = 'super_admin'
           or (tu.tenant_id = p_tenant_id and tu.role = 'operator_admin'))
  ) then
    raise exception 'Only an operator admin can change prices' using errcode = '42501';
  end if;

  if p_pricing is null or jsonb_typeof(p_pricing) <> 'object'
     or jsonb_typeof(p_pricing->'airports') is distinct from 'array' then
    raise exception 'Prices must include a list of airports' using errcode = '22023';
  end if;
  if jsonb_array_length(p_pricing->'airports') > 30 then
    raise exception 'At most 30 airports' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_pricing->'airports') loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Each airport must be an object' using errcode = '22023';
    end if;
    v_name := nullif(btrim(coalesce(v_item->>'name', '')), '');
    if v_name is null or length(v_name) > 80 then
      raise exception 'Each airport needs a name (max 80 characters)' using errcode = '22023';
    end if;
    if lower(v_name) = any (v_names) then
      raise exception 'Airport "%" is listed twice', v_name using errcode = '22023';
    end if;
    v_names := v_names || lower(v_name);

    v_code := upper(nullif(btrim(coalesce(v_item->>'code', '')), ''));
    if v_code is not null and v_code !~ '^[A-Z]{3,4}$' then
      raise exception 'Airport code for % must be 3 or 4 letters', v_name using errcode = '22023';
    end if;

    if jsonb_typeof(v_item->'one_way') is distinct from 'number' or jsonb_typeof(v_item->'return_fare') is distinct from 'number' then
      raise exception 'One-way and return prices for % must be numbers', v_name using errcode = '22023';
    end if;
    v_one := round((v_item->>'one_way')::numeric, 2);
    v_ret := round((v_item->>'return_fare')::numeric, 2);
    if v_one <= 0 or v_one > 10000 or v_ret <= 0 or v_ret > 20000 then
      raise exception 'Prices for % must be between £0.01 and £10,000 one way (£20,000 return)', v_name using errcode = '22023';
    end if;

    v_airports := v_airports || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'name', v_name, 'code', v_code, 'one_way', v_one, 'return_fare', v_ret)));
  end loop;

  if p_pricing ? 'extra_stop' then
    if jsonb_typeof(p_pricing->'extra_stop') is distinct from 'number' then
      raise exception 'Extra stop charge must be a number' using errcode = '22023';
    end if;
    v_extra := round((p_pricing->>'extra_stop')::numeric, 2);
    if v_extra < 0 or v_extra > 500 then
      raise exception 'Extra stop charge must be between £0 and £500' using errcode = '22023';
    end if;
  else
    v_extra := 0;
  end if;

  v_result := jsonb_build_object('airports', v_airports, 'extra_stop', v_extra);

  update public.tenants t
     set pricing = v_result, updated_at = now()
   where t.id = p_tenant_id;
  if not found then
    raise exception 'Unknown tenant' using errcode = 'P0002';
  end if;
  return v_result;
end;
$$;

revoke all on function public.update_tenant_pricing(uuid, jsonb) from public, anon;
grant execute on function public.update_tenant_pricing(uuid, jsonb) to authenticated;
