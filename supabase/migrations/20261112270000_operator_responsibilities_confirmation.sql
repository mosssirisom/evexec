-- Operators confirm the "operator responsibilities" statement (docs/legal/operator-responsibilities.md,
-- version 1) in Settings -> Legal. Saved under tenants.brand.legal as
-- responsibilities_confirmed (true/false), responsibilities_confirmed_at (set when
-- ticked, cleared when unticked) and responsibilities_version. The platform only
-- records what the operator says; it checks none of it. Replaces update_tenant_legal
-- (all earlier behaviour unchanged). No DROP statements.

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
  v_resp boolean;
  v_policy jsonb;
  v_pb jsonb;
  v_prev_hours numeric := null;
  v_prev_pct numeric := -1;
  v_i int;
  v_existing jsonb;
  v_final jsonb;
  v_text text;
begin
  if not exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid()
      and (tu.role = 'super_admin'
           or (tu.tenant_id = p_tenant_id and tu.role = 'operator_admin'))
  ) then
    raise exception 'Only an operator admin can change the legal details' using errcode = '42501';
  end if;

  select coalesce(t.brand -> 'legal', '{}'::jsonb) into v_existing
    from public.tenants t where t.id = p_tenant_id for update;
  if v_existing is null then
    raise exception 'Unknown tenant' using errcode = 'P0002';
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


  if v_in ? 'responsibilities_confirmed' then
    if jsonb_typeof(v_in -> 'responsibilities_confirmed') <> 'boolean' then
      raise exception 'The responsibilities confirmation must be true or false' using errcode = '22023';
    end if;
    v_resp := (v_in ->> 'responsibilities_confirmed')::boolean;
    v_clean := v_clean || jsonb_build_object('responsibilities_confirmed', v_resp);
  end if;

  if v_in ? 'policy' then
    v_policy := v_in -> 'policy';
    if jsonb_typeof(v_policy) <> 'object' or not (v_policy ? 'standard') or jsonb_typeof(v_policy -> 'standard') <> 'array'
       or jsonb_array_length(v_policy -> 'standard') <> 3 then
      raise exception 'Cancellation policy needs three bands (standard)' using errcode = '22023';
    end if;
    for v_i in 0..2 loop
      v_pb := (v_policy -> 'standard') -> v_i;
      if jsonb_typeof(v_pb) <> 'object' or jsonb_typeof(v_pb -> 'hours') <> 'number' or jsonb_typeof(v_pb -> 'pct') <> 'number' then
        raise exception 'Each cancellation band needs an hours number and a percentage' using errcode = '22023';
      end if;
      if (v_pb ->> 'hours')::numeric < 1 or (v_pb ->> 'hours')::numeric > 336 then
        raise exception 'Notice hours must be between 1 and 336' using errcode = '22023';
      end if;
      if (v_pb ->> 'pct')::numeric < 0 or (v_pb ->> 'pct')::numeric > 100 then
        raise exception 'A percentage must be between 0 and 100' using errcode = '22023';
      end if;
      if v_prev_hours is not null and ((v_pb ->> 'hours')::numeric >= v_prev_hours or (v_pb ->> 'pct')::numeric <= v_prev_pct) then
        raise exception 'Bands must get stricter: fewer hours and a higher percentage each time' using errcode = '22023';
      end if;
      v_prev_hours := (v_pb ->> 'hours')::numeric;
      v_prev_pct := (v_pb ->> 'pct')::numeric;
    end loop;
    if ((v_policy -> 'standard') -> 0 ->> 'pct')::numeric <> 0 then
      raise exception 'The first band must be 0 percent (free cancellation)' using errcode = '22023';
    end if;
    v_clean := v_clean || jsonb_build_object('policy', jsonb_build_object('standard', jsonb_build_array(
      jsonb_build_object('hours', (v_policy -> 'standard') -> 0 -> 'hours', 'pct', (v_policy -> 'standard') -> 0 -> 'pct'),
      jsonb_build_object('hours', (v_policy -> 'standard') -> 1 -> 'hours', 'pct', (v_policy -> 'standard') -> 1 -> 'pct'),
      jsonb_build_object('hours', (v_policy -> 'standard') -> 2 -> 'hours', 'pct', (v_policy -> 'standard') -> 2 -> 'pct')
    )));
  end if;


  if v_in ? 'terms_mode' then
    if v_in ->> 'terms_mode' not in ('standard', 'custom') then
      raise exception 'Terms must be standard or custom' using errcode = '22023';
    end if;
    v_clean := v_clean || jsonb_build_object('terms_mode', v_in ->> 'terms_mode');
  end if;

  if v_in ? 'custom_terms' then
    v_text := replace(btrim(coalesce(v_in ->> 'custom_terms', '')), E'\r', '');
    if length(v_text) > 30000 then
      raise exception 'Your terms are too long (up to 30000 characters)' using errcode = '22001';
    end if;
    v_clean := v_clean || jsonb_build_object('custom_terms', v_text);
    -- A new version each time the text changes, so each booking keeps the version it accepted.
    if v_text is distinct from coalesce(v_existing ->> 'custom_terms', '') then
      v_clean := v_clean || jsonb_build_object(
        'custom_terms_version', coalesce((v_existing ->> 'custom_terms_version')::int, 0) + 1,
        'custom_terms_updated_at', now()::text);
    end if;
  end if;

  if v_in ? 'privacy_extra' then
    v_text := replace(btrim(coalesce(v_in ->> 'privacy_extra', '')), E'\r', '');
    if length(v_text) > 4000 then
      raise exception 'The extra privacy section is too long (up to 4000 characters)' using errcode = '22001';
    end if;
    v_clean := v_clean || jsonb_build_object('privacy_extra', v_text);
  end if;

  if v_in ? 'numbers_confirmed' then
    if jsonb_typeof(v_in -> 'numbers_confirmed') <> 'boolean' then
      raise exception 'The confirmation must be true or false' using errcode = '22023';
    end if;
    v_clean := v_clean || jsonb_build_object('numbers_confirmed', (v_in ->> 'numbers_confirmed')::boolean);
  end if;

  -- Their own terms need real text and the operator's confirmation that the terms
  -- and the cancellation numbers say the same thing.
  v_final := v_existing || v_clean;
  if v_final ->> 'terms_mode' = 'custom' then
    if length(coalesce(btrim(v_final ->> 'custom_terms'), '')) < 100 then
      raise exception 'Write your terms before switching to them (at least 100 characters)' using errcode = '22023';
    end if;
    if coalesce((v_final ->> 'numbers_confirmed')::boolean, false) is not true then
      raise exception 'Confirm that your terms match the cancellation charges you set' using errcode = '22023';
    end if;
  end if;

  update public.tenants t
     set brand = jsonb_set(
           coalesce(t.brand, '{}'::jsonb),
           '{legal}',
           (v_existing || v_clean)
             || case
                  when v_insured is true then jsonb_build_object('insurance_confirmed_at', now()::text)
                  when v_insured is false then jsonb_build_object('insurance_confirmed_at', null)
                  else '{}'::jsonb
                end
             || case
                  when v_resp is true then jsonb_build_object('responsibilities_confirmed_at', now()::text, 'responsibilities_version', 1)
                  when v_resp is false then jsonb_build_object('responsibilities_confirmed_at', null, 'responsibilities_version', null)
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
