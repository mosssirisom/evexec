-- Each business gets its own booking-reference prefix (EV Exec stays "EVX").
--
-- APPLIED 12/11/2026 in two parts (part A live as 20261112070609 booking_ref_prefix_part_a;
-- part B run by the owner in the SQL editor). Verified live: only bookings_ref_format_any
-- remains, EV Exec's prefix is EVX, all 82 existing references pass.
-- Applied in two parts:
--   PART A (no DROP): the Supabase tool can apply it.
--   PART B (one DROP CONSTRAINT): paste into the Supabase SQL editor yourself;
--          the tool hangs on DROP statements. Until B is run, a booking with any
--          prefix other than EVX- is still refused by the old rule.
-- Existing EVX- references are unaffected by either part.

-- ===== PART A =====

alter table public.tenants add column if not exists ref_prefix text not null default 'EVX';
alter table public.tenants add constraint tenants_ref_prefix_format check (ref_prefix ~ '^[A-Z]{2,5}$');

-- The new rule: 2 to 5 capital letters, a hyphen, then capitals and digits.
-- (EVX-... still passes.) The old EVX-only rule is removed in part B.
alter table public.bookings add constraint bookings_ref_format_any check (ref ~ '^[A-Z]{2,5}-[A-Z0-9]+$');

-- A new business starts with a prefix made from the first letters of its short
-- name (at least two letters, otherwise "BKG"). The owner can change it later.
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
  v_prefix text;
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

  v_prefix := left(regexp_replace(upper(v_slug), '[^A-Z]', '', 'g'), 4);
  if length(v_prefix) < 2 then v_prefix := 'BKG'; end if;

  insert into public.tenants (slug, name, contact_email, contact_phone, brand, pricing, ref_prefix)
  values (v_slug, v_name, v_email, v_phone,
          jsonb_build_object('invoice', jsonb_build_object('business_name', v_name)),
          jsonb_build_object('airports', '[]'::jsonb, 'extra_stop', 0),
          v_prefix)
  returning * into t;

  insert into public.notification_channel_settings
    (tenant_id, email_enabled, sms_enabled, whatsapp_enabled, push_enabled, sms_only_when_necessary)
  values (t.id, true, false, false, false, true);

  return t;
end;
$fn$;

revoke all on function public.provision_tenant(text, text, text, text) from public, anon, authenticated;
grant execute on function public.provision_tenant(text, text, text, text) to service_role;

-- ===== PART B (run yourself in the SQL editor) =====

alter table public.bookings drop constraint bookings_ref_format;
