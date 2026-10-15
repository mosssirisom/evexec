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
