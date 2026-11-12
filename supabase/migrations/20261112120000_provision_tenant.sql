-- Set up a new business in one step.
--
-- APPLIED to the live project on 12/11/2026 (Supabase tool, no DROP statements) and
-- verified in a rolled-back transaction. The test baseline includes it.
--
-- Used by the Operator app's platform screen (super admin only, through the
-- server, service role). Replaces the old manage-tenants edge function's bare
-- "insert a tenants row": a business created that way had no notification
-- settings, no price list and no invoice name, and its settings row would have
-- defaulted SMS on.
--
-- Creates, atomically:
--   * the business (public.tenants): checked slug and name, optional contact
--     details, invoice name pre-filled, an EMPTY price list (the business sets its
--     own; it never inherits EV Exec's);
--   * its notification settings: email on, SMS / WhatsApp / push OFF. SMS stays off
--     by design (Twilio is dormant, no new sending without owner approval).
-- It does not create a login: the first admin is invited separately.
-- No DROP statements.

create or replace function public.provision_tenant(
  p_slug text, p_name text, p_contact_email text default null, p_contact_phone text default null)
returns public.tenants
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_email text := nullif(btrim(coalesce(p_contact_email, '')), '');
  v_phone text := nullif(btrim(coalesce(p_contact_phone, '')), '');
  t public.tenants;
begin
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(v_slug) > 40 then
    raise exception 'The short name must be lowercase letters, numbers and hyphens (up to 40 characters).' using errcode = '22023';
  end if;
  if v_name = '' or length(v_name) > 100 then
    raise exception 'The business name is required (up to 100 characters).' using errcode = '22023';
  end if;
  if v_email is not null and v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'The contact email is not valid.' using errcode = '22023';
  end if;

  insert into public.tenants (slug, name, contact_email, contact_phone, brand, pricing)
  values (v_slug, v_name, v_email, v_phone,
          jsonb_build_object('invoice', jsonb_build_object('business_name', v_name)),
          jsonb_build_object('airports', '[]'::jsonb, 'extra_stop', 0))
  returning * into t;

  insert into public.notification_channel_settings
    (tenant_id, email_enabled, sms_enabled, whatsapp_enabled, push_enabled, sms_only_when_necessary)
  values (t.id, true, false, false, false, true);

  return t;
end;
$fn$;

revoke all on function public.provision_tenant(text, text, text, text) from public, anon, authenticated;
grant execute on function public.provision_tenant(text, text, text, text) to service_role;
