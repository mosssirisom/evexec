-- Private hire operator licence number (tenants.brand.licence), saved by the
-- business's own admin. Only operator_admin of that business (or a super_admin)
-- may change it. The format is checked here as well as in the app: 3 to 20
-- letters and digits, spaces and hyphens removed, stored in capitals. An empty
-- value clears it. No DROP statements.

create or replace function public.update_tenant_licence(p_tenant_id uuid, p_licence text)
returns public.tenants
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_row public.tenants;
  v_clean text;
begin
  if not exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid()
      and (tu.role = 'super_admin'
           or (tu.tenant_id = p_tenant_id and tu.role = 'operator_admin'))
  ) then
    raise exception 'Only an operator admin can change the licence number' using errcode = '42501';
  end if;

  v_clean := upper(regexp_replace(coalesce(p_licence, ''), '[\s-]', '', 'g'));
  if v_clean <> '' and v_clean !~ '^[A-Z0-9]{3,20}$' then
    raise exception 'The licence number must be 3 to 20 letters and numbers' using errcode = '22023';
  end if;

  update public.tenants t
     set brand = jsonb_set(coalesce(t.brand, '{}'::jsonb), '{licence}',
                           case when v_clean = '' then 'null'::jsonb else to_jsonb(v_clean) end),
         updated_at = now()
   where t.id = p_tenant_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Unknown tenant' using errcode = 'P0002';
  end if;
  return v_row;
end;
$fn$;

revoke all on function public.update_tenant_licence(uuid, text) from public, anon;
grant execute on function public.update_tenant_licence(uuid, text) to authenticated, service_role;
