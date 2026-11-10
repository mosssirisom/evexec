-- Rollback for 20261015032000_driver_write_guard.sql + 20261015033000_driver_payment_guard.sql
-- (Fixes 3 and 4, applied together). Instant and non-destructive:
--   1. disables the two guard triggers (they stay defined but never run), and
--   2. puts the three driver update policies back exactly as they were live on
--      15/10/2026 (driver matched by login id OR by email), copied from
--      pg_policies (md5 of qual|with_check: bookings_driver_update
--      8bbf5b3b8da67239823743c302f7f1f0, drivers_self_update
--      8472a4a6919bc96a3c634769f0af2c6d, driver_update_own_sms_reminders
--      1151f421e628e3c362e36b969eb33332).
-- The guard functions private.guard_driver_booking_update() and
-- private.guard_driver_record_update() are left in place, unused (nothing is removed).
-- No data is touched.

begin;

alter table public.bookings disable trigger zz_guard_driver_booking_update;
alter table public.drivers  disable trigger zz_guard_driver_record_update;

alter policy bookings_driver_update on public.bookings
  using ((assigned_driver_id = ( SELECT auth.uid() AS uid)) OR (assigned_driver_id IN ( SELECT drivers.id
   FROM drivers
  WHERE (drivers.email = ( SELECT auth.email() AS email)))))
  with check ((assigned_driver_id = ( SELECT auth.uid() AS uid)) OR (assigned_driver_id IN ( SELECT drivers.id
   FROM drivers
  WHERE (drivers.email = ( SELECT auth.email() AS email)))));

alter policy drivers_self_update on public.drivers
  using ((email = ( SELECT auth.email() AS email)) OR (( SELECT auth.uid() AS uid) = id))
  with check ((email = ( SELECT auth.email() AS email)) OR (( SELECT auth.uid() AS uid) = id));

alter policy driver_update_own_sms_reminders on public.driver_sms_reminders
  using ((driver_id = auth.uid()) OR (driver_id IN ( SELECT drivers.id
   FROM drivers
  WHERE (drivers.email = auth.email()))))
  with check ((driver_id = auth.uid()) OR (driver_id IN ( SELECT drivers.id
   FROM drivers
  WHERE (drivers.email = auth.email()))));

commit;
