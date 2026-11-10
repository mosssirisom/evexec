-- ===== 20261015032000_driver_write_guard.sql =====
-- Fix 3 (audit H-2, M-6): drivers may change only what the Driver App needs.
--
-- Root cause: signed-in users hold UPDATE on every column of bookings and
-- drivers (Supabase default grants), and the driver RLS policies only check
-- WHICH rows a driver may update, not WHAT. A driver could call the REST API
-- directly to change price, payment status, customer details, assignment or
-- tenant_id on their jobs, and tenant_id/kind/email on their own driver
-- record. The update policies also matched by email (drivers.email =
-- auth.email()), so anyone holding a login with a driver's or partner's
-- email address got that driver's rights.
--
-- Fix:
--   1. A BEFORE UPDATE guard on bookings: when the caller is a signed-in app
--      user (role authenticated/anon) who is NOT office staff for that
--      booking's business, only these columns may change:
--        status, driver_notes, payment_method, driver_confirmed_at,
--        attestation_status, tracking_started_at, arrived_at,
--        passenger_onboard_at, pob_at, completed_at, updated_at
--      and status may only become En Route, Arrived, Passenger On Board,
--      Completed, Cancelled (Driver App "no show") or No Show.
--   2. The same guard on drivers: only current_lat, current_lng,
--      location_updated_at, battery_percent, is_online, updated_at.
--   3. The driver update policies on bookings, drivers and
--      driver_sms_reminders match the driver by login id only (no email).
--      On 15/10/2026 no login relies on the email match (1 driver login,
--      matched by id; partners have no login).
-- Office staff, the service role (website, edge functions, cron) and
-- SECURITY DEFINER database functions are not affected.
--
-- The trigger names start with zz_ so they run after the other BEFORE UPDATE
-- triggers (which may adjust NEW) and check the final row.
--
-- The "app user who is not office staff" test is the triggers' WHEN clause,
-- not code inside the functions. In production anon/authenticated have no
-- USAGE on schema private, so plpgsql running as them cannot call
-- private.staff_for_tenant() by name ("permission denied for schema
-- private"); a WHEN clause, like an RLS policy, is stored by OID and needs
-- only EXECUTE, which they have.
-- Rollback (instant, nothing deleted):
--   alter table public.bookings disable trigger zz_guard_driver_booking_update;
--   alter table public.drivers  disable trigger zz_guard_driver_record_update;
-- and ALTER the three policies back to the definitions in
-- supabase/tests/baseline.sql.

create or replace function private.guard_driver_booking_update()
returns trigger
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $function$
declare
  allowed constant text[] := array[
    'status', 'driver_notes', 'payment_method', 'driver_confirmed_at', 'attestation_status',
    'tracking_started_at', 'arrived_at', 'passenger_onboard_at', 'pob_at', 'completed_at', 'updated_at'
  ];
  driver_statuses constant text[] := array[
    'En Route', 'Arrived', 'Passenger On Board', 'Completed', 'Cancelled', 'No Show'
  ];
  changed text[];
begin
  -- Runs only for app users (anon/authenticated) who are not office staff
  -- for this booking's business: see the trigger's WHEN clause. The service
  -- role, office staff and SECURITY DEFINER functions never reach this.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  select array_agg(n.key order by n.key) into changed
  from jsonb_each(to_jsonb(new)) n
  where n.value is distinct from (to_jsonb(old) -> n.key)
    and not (n.key = any(allowed));
  if changed is not null then
    raise exception 'Drivers can''t change % on a booking.', array_to_string(changed, ', ')
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status and not (new.status = any(driver_statuses)) then
    raise exception 'Drivers can''t set a booking to "%".', new.status using errcode = '42501';
  end if;

  return new;
end;
$function$;

create or replace function private.guard_driver_record_update()
returns trigger
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $function$
declare
  allowed constant text[] := array[
    'current_lat', 'current_lng', 'location_updated_at', 'battery_percent', 'is_online', 'updated_at'
  ];
  changed text[];
begin
  -- See the trigger's WHEN clause (app users who are not office staff only).
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  select array_agg(n.key order by n.key) into changed
  from jsonb_each(to_jsonb(new)) n
  where n.value is distinct from (to_jsonb(old) -> n.key)
    and not (n.key = any(allowed));
  if changed is not null then
    raise exception 'Drivers can''t change % on their driver record. Ask the office.', array_to_string(changed, ', ')
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

grant execute on function private.guard_driver_booking_update() to anon, authenticated;
grant execute on function private.guard_driver_record_update() to anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'zz_guard_driver_booking_update' and tgrelid = 'public.bookings'::regclass) then
    create trigger zz_guard_driver_booking_update
      before update on public.bookings
      for each row
      when (current_user in ('authenticated', 'anon') and not private.staff_for_tenant(old.tenant_id))
      execute function private.guard_driver_booking_update();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'zz_guard_driver_record_update' and tgrelid = 'public.drivers'::regclass) then
    create trigger zz_guard_driver_record_update
      before update on public.drivers
      for each row
      when (current_user in ('authenticated', 'anon') and not private.staff_for_tenant(old.tenant_id))
      execute function private.guard_driver_record_update();
  end if;
end $$;

alter policy bookings_driver_update on public.bookings
  using (assigned_driver_id = (select auth.uid()))
  with check (assigned_driver_id = (select auth.uid()));

alter policy drivers_self_update on public.drivers
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter policy driver_update_own_sms_reminders on public.driver_sms_reminders
  using (driver_id = (select auth.uid()))
  with check (driver_id = (select auth.uid()));

-- ===== 20261015033000_driver_payment_guard.sql =====
-- Fix 4 (audit H-3): drivers can't change payment on settled bookings.
--
-- Root cause: the Driver App's "Complete Journey" set payment_status = 'Paid'
-- whenever the driver picked Card or Bank Transfer (no check the money
-- arrived) and overwrote 'Invoiced' for account customers; picking Cash on a
-- prepaid job replaced its payment method. The app is fixed separately
-- (evexecdriverapp lib/completion.ts). This migration enforces the same rule
-- in the database for any non-staff app user:
--   - payment_status is never changed by a driver;
--   - payment_method may only be recorded while the booking is unpaid, never
--     on a booking that is Paid or Invoiced.
-- Both are NEUTRALISED (the driver's value is replaced by the stored one and
-- the rest of the update goes through), not refused. Reason: the Driver App
-- is a PWA and a phone that has had it open since before the release keeps
-- running the old code, which sends payment_status = 'Paid' when completing
-- a Card job. Refusing that would leave the job stuck on Passenger On Board.
-- Neutralising gives the old and the new app the same result, so this
-- migration and the app release can go out in either order.
-- It replaces private.guard_driver_booking_update() with the Fix 3 rules
-- plus this one. Apply it in the SAME transaction as
-- 20261015032000_driver_write_guard.sql (on its own, Fix 3 refuses the old
-- app's Card completion). Rollback: re-run the function from
-- 20261015032000_driver_write_guard.sql, or disable the trigger (see there).

create or replace function private.guard_driver_booking_update()
returns trigger
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $function$
declare
  allowed constant text[] := array[
    'status', 'driver_notes', 'payment_method', 'driver_confirmed_at', 'attestation_status',
    'tracking_started_at', 'arrived_at', 'passenger_onboard_at', 'pob_at', 'completed_at', 'updated_at'
  ];
  driver_statuses constant text[] := array[
    'En Route', 'Arrived', 'Passenger On Board', 'Completed', 'Cancelled', 'No Show'
  ];
  changed text[];
begin
  -- Runs only for app users who are not office staff for this booking's
  -- business: see the trigger's WHEN clause in 20261015032000 (staff check
  -- there, because app roles have no USAGE on schema private).
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- Payment is the office's: keep the stored values (see header).
  new.payment_status := old.payment_status;
  if lower(coalesce(old.payment_status, '')) in ('paid', 'invoiced') then
    new.payment_method := old.payment_method;
  end if;

  select array_agg(n.key order by n.key) into changed
  from jsonb_each(to_jsonb(new)) n
  where n.value is distinct from (to_jsonb(old) -> n.key)
    and not (n.key = any(allowed));
  if changed is not null then
    raise exception 'Drivers can''t change % on a booking.', array_to_string(changed, ', ')
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status and not (new.status = any(driver_statuses)) then
    raise exception 'Drivers can''t set a booking to "%".', new.status using errcode = '42501';
  end if;

  return new;
end;
$function$;
