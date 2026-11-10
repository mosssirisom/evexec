-- Stage 2 of docs/security/2026-11-10-database-hardening-plan.md (approved and applied 10/11/2026).

-- 2a: a login is a driver only when its id is the driver row's id. No match by email address.
alter policy drivers_self_select on public.drivers
  to authenticated
  using (id = (select auth.uid()));

alter policy driver_own_locations on public.driver_locations
  using (driver_id = (select auth.uid()))
  with check (driver_id = (select auth.uid()));

alter policy driver_select_own_sms_reminders on public.driver_sms_reminders
  to authenticated
  using (driver_id = (select auth.uid()));

alter policy driver_select_flight_verifications on public.flight_verifications
  to authenticated
  using (exists (
    select 1 from public.bookings b
    where b.id = flight_verifications.booking_id and b.assigned_driver_id = (select auth.uid())
  ));

alter policy driver_insert_job_proofs on public.job_proofs
  with check (exists (
    select 1 from public.bookings b
    where b.id = job_proofs.booking_id and b.assigned_driver_id = (select auth.uid())
  ));

-- 2b: sequence rights only where needed. Identity columns need none; staff draw
-- invoice numbers as themselves (set_invoice_number runs as the caller).
revoke all on all sequences in schema public from anon, authenticated;
grant usage on sequence public.invoice_seq to authenticated;

-- 2c: the two booking-total functions are for signed-in users. They were open to PUBLIC.
revoke execute on function public.get_booking_totals(timestamptz), public.get_booking_status_breakdown(timestamptz) from public, anon;

-- 2d: app roles do not need MAINTAIN (vacuum, reindex, lock table) on tables, now or on new ones.
revoke maintain on all tables in schema public from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke maintain on tables from anon, authenticated;
