-- APPLIED to the live project on 12/11/2026 (Supabase tool; no DROP) and verified in a rolled-back
-- sign-up probe: a business-tagged sign-up is filed under it, none/junk fall back to EV Exec.
-- A customer's profile is filed under the business whose website they signed up on.
--
-- Until now handle_new_user() created every profile without a business, so it
-- fell back to the column default (EV Exec), even for a customer who signed up on
-- another business's website. The website now sends its business in the sign-up
-- data (user metadata `tenant_id`); the profile uses it when it names an ACTIVE
-- business, otherwise EV Exec as before. A bad or unknown value can never block a
-- sign-up. No DROP statements.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_raw text := NEW.raw_user_meta_data->>'tenant_id';
  v_tenant uuid;
begin
  if v_raw ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select id into v_tenant from public.tenants where id = v_raw::uuid and status = 'active';
  end if;

  insert into public.profiles (id, full_name, tenant_id)
  values (NEW.id, NEW.raw_user_meta_data->>'full_name',
          coalesce(v_tenant, '00000000-0000-0000-0000-000000000001'::uuid))
  on conflict (id) do nothing;
  return NEW;
end;
$fn$;
