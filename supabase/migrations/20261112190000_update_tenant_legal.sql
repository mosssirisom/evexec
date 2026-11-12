-- Operator legal details (brand.legal), saved by the business's own admin.
--
-- Only operator_admin of that business (or a super_admin) may change them, checked
-- here as well as in the app. Only the fields listed below are accepted; anything
-- else is ignored, so this cannot be used to write other settings. Stored under
-- tenants.brand.legal, which lib/legal reads when it builds the terms and privacy
-- documents. Insurance is confirmed by the operator: the time it was confirmed is
-- recorded, and clearing the tick clears the time. No DROP statements.

create or replace function public.update_tenant_legal(p_tenant_id uuid, p_legal jsonb)
returns public.tenants
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_row public.tenants;
  v_in jsonb := coalesce(p_legal, '{}'::jsonb);
  v_clean jsonb := '{}'::jsonb;
  v_text_fields text[] := array['legal_name','company_number','registered_address','base','area','service','fleet','luggage','points_name','ico_registration'];
  v_key text;
  v_val text;
  v_limits jsonb := '{"legal_name":100,"company_number":20,"registered_address":200,"base":100,"area":150,"service":150,"fleet":300,"luggage":300,"points_name":40,"ico_registration":40}';
  v_insured boolean;
begin
  if not exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid()
      and (tu.role = 'super_admin'
           or (tu.tenant_id = p_tenant_id and tu.role = 'operator_admin'))
  ) then
    raise exception 'Only an operator admin can change the legal details' using errcode = '42501';
  end if;

  foreach v_key in array v_text_fields loop
    if v_in ? v_key then
      v_val := btrim(coalesce(v_in ->> v_key, ''));
      if length(v_val) > (v_limits ->> v_key)::int then
        raise exception '% is too long (up to % characters)', v_key, (v_limits ->> v_key)::int using errcode = '22001';
      end if;
      v_clean := v_clean || jsonb_build_object(v_key, v_val);
    end if;
  end loop;

  if v_in ? 'status' then
    if v_in ->> 'status' not in ('sole trader', 'limited company', 'partnership') then
      raise exception 'Status must be sole trader, limited company or partnership' using errcode = '22023';
    end if;
    v_clean := v_clean || jsonb_build_object('status', v_in ->> 'status');
  end if;

  if v_in ? 'jurisdiction' then
    if v_in ->> 'jurisdiction' not in ('england-wales', 'scotland', 'northern-ireland') then
      raise exception 'Jurisdiction must be England and Wales, Scotland or Northern Ireland' using errcode = '22023';
    end if;
    v_clean := v_clean || jsonb_build_object('jurisdiction', v_in ->> 'jurisdiction');
  end if;

  if v_in ? 'insurance_confirmed' then
    if jsonb_typeof(v_in -> 'insurance_confirmed') <> 'boolean' then
      raise exception 'Insurance confirmation must be true or false' using errcode = '22023';
    end if;
    v_insured := (v_in ->> 'insurance_confirmed')::boolean;
    v_clean := v_clean || jsonb_build_object('insurance_confirmed', v_insured);
  end if;

  update public.tenants t
     set brand = jsonb_set(
           coalesce(t.brand, '{}'::jsonb),
           '{legal}',
           (coalesce(t.brand -> 'legal', '{}'::jsonb) || v_clean)
             || case
                  when v_insured is true then jsonb_build_object('insurance_confirmed_at', now()::text)
                  when v_insured is false then jsonb_build_object('insurance_confirmed_at', null)
                  else '{}'::jsonb
                end
         ),
         updated_at = now()
   where t.id = p_tenant_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Unknown tenant' using errcode = 'P0002';
  end if;
  return v_row;
end;
$fn$;

revoke all on function public.update_tenant_legal(uuid, jsonb) from public, anon;
grant execute on function public.update_tenant_legal(uuid, jsonb) to authenticated, service_role;
