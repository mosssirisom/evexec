-- Operator app Settings → Business saves to the operator's own tenants row
-- (shared by every staff device) instead of the browser's localStorage.
--
-- Staff never get a direct UPDATE policy on public.tenants, because that would
-- also let them change slug, status or stripe_connect_account_id. This function
-- writes only the profile fields, and only for an operator_admin of that tenant
-- or a super_admin. Dispatchers and drivers are refused.

create or replace function public.update_tenant_profile(
  p_tenant_id uuid,
  p_name text,
  p_contact_email text,
  p_contact_phone text,
  p_invoice jsonb
)
returns public.tenants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice jsonb := '{}'::jsonb;
  v_row public.tenants;
begin
  if not exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid()
      and (tu.role = 'super_admin'
           or (tu.tenant_id = p_tenant_id and tu.role = 'operator_admin'))
  ) then
    raise exception 'Only an operator admin can change business details'
      using errcode = '42501';
  end if;

  p_name := nullif(btrim(coalesce(p_name, '')), '');
  if p_name is null or length(p_name) > 120 then
    raise exception 'Business name is required (max 120 characters)' using errcode = '22023';
  end if;
  p_contact_email := nullif(btrim(coalesce(p_contact_email, '')), '');
  if p_contact_email is not null and (length(p_contact_email) > 254 or p_contact_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'Contact email is not valid' using errcode = '22023';
  end if;
  p_contact_phone := nullif(btrim(coalesce(p_contact_phone, '')), '');
  if p_contact_phone is not null and length(p_contact_phone) > 40 then
    raise exception 'Phone number is too long' using errcode = '22023';
  end if;

  -- Keep only the invoice keys the website and Operator app read.
  if p_invoice is not null and jsonb_typeof(p_invoice) = 'object' then
    select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_invoice
    from jsonb_each(p_invoice)
    where key in ('business_name', 'address_lines', 'phone', 'email', 'web', 'tagline', 'payment_terms')
      and length(value::text) <= 2000;
  end if;

  update public.tenants t
     set name = p_name,
         contact_email = p_contact_email,
         contact_phone = p_contact_phone,
         brand = coalesce(t.brand, '{}'::jsonb)
                 || jsonb_build_object('invoice', coalesce(t.brand->'invoice', '{}'::jsonb) || v_invoice),
         updated_at = now()
   where t.id = p_tenant_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Unknown tenant' using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

revoke all on function public.update_tenant_profile(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.update_tenant_profile(uuid, text, text, text, jsonb) to authenticated;
