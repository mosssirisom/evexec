-- Fix 4 (audit H-3): drivers can't change payment on settled bookings.
--
-- Root cause: the Driver App's "Complete Journey" set payment_status = 'Paid'
-- whenever the driver picked Card or Bank Transfer (no check the money
-- arrived) and overwrote 'Invoiced' for account customers; picking Cash on a
-- prepaid job replaced its payment method. The app is fixed separately
-- (evexecdriverapp lib/completion.ts). This migration enforces the same rule
-- in the database for any non-staff app user:
--   - payment_status is never changed by a driver (already refused by the
--     column guard from 20261015032000_driver_write_guard.sql);
--   - payment_method may only be recorded while the booking is unpaid, never
--     on a booking that is Paid or Invoiced.
-- It replaces private.guard_driver_booking_update() with the Fix 3 rules
-- plus this one. Rollback: re-run the function from
-- 20261015032000_driver_write_guard.sql.

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
  -- Only requests made with an app user's token are restricted. current_user
  -- is the invoking role here (SECURITY INVOKER), so the service role and
  -- SECURITY DEFINER functions pass straight through.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if private.staff_for_tenant(old.tenant_id) then
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

  if new.payment_method is distinct from old.payment_method
     and lower(coalesce(old.payment_status, '')) in ('paid', 'invoiced') then
    raise exception 'This booking is already %. A driver can''t change its payment method.', old.payment_status
      using errcode = '42501';
  end if;

  return new;
end;
$function$;
