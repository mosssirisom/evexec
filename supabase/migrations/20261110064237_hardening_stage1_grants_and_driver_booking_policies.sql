-- Stage 1 of docs/security/2026-11-10-database-hardening-plan.md (approved and applied 10/11/2026).
-- 1a: app roles do not need TRUNCATE, REFERENCES or TRIGGER (the API cannot use them; TRUNCATE ignores row-level security).
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- 1b: new tables created by postgres no longer hand those three rights to app roles.
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;

-- 1c: a driver reads only the jobs assigned to them, in their own business.
-- Removes the "open request" clause and the match by email address.
alter policy bookings_driver_select on public.bookings
  to authenticated
  using (
    assigned_driver_id = (select auth.uid())
    and tenant_id = (select d.tenant_id from public.drivers d where d.id = (select auth.uid()))
  );

-- 1d: the same business condition on driver updates.
alter policy bookings_driver_update on public.bookings
  to authenticated
  using (
    assigned_driver_id = (select auth.uid())
    and tenant_id = (select d.tenant_id from public.drivers d where d.id = (select auth.uid()))
  )
  with check (
    assigned_driver_id = (select auth.uid())
    and tenant_id = (select d.tenant_id from public.drivers d where d.id = (select auth.uid()))
  );
