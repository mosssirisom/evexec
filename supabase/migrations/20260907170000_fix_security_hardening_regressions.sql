-- Correction: the prior security-hardening migrations
-- (20260907150000/20260907150100) were verified against the wrong
-- frontend. This project's real, deployed production app lives on
-- `main` (a separate Next.js codebase, not the branch those migrations
-- were written against) and turned out to have live callers for several
-- of the objects that were locked down. This restores exactly those,
-- while keeping every genuine fix intact.
--
-- 1. get_push_dispatch_bundle(text): main's own
--    src/app/api/push/dispatch/route.ts calls this via the anon key (the
--    DB trigger invokes it with no user session, and there is no
--    service-role key in the deployment) -- confirmed by reading that
--    route directly. It's already self-gated by the webhook secret
--    inside the function body, so restoring anon execute doesn't reopen
--    anything; the PUBLIC-level revoke from the follow-up migration is
--    kept (that pseudo-role grant was never needed).
grant execute on function public.get_push_dispatch_bundle(text) to anon, authenticated;

-- 2. queue_customer_sms(text,text,text,text): main's own
--    src/app/api/booking-response/route.ts calls this with the caller's
--    JWT (authenticated), as an SMS fallback when an operator responds
--    to a booking. The prior migration revoked it from authenticated too
--    (only anon needed to go) -- restoring authenticated only, matching
--    main's own 037_security_hardening.sql which reached the identical
--    fix independently.
grant execute on function public.queue_customer_sms(text,text,text,text) to authenticated;

-- 3. register_operator_push / unregister_operator_push: main's own
--    037_security_hardening.sql already reduced both to authenticated
--    only (from anon-callable). The prior migration here revoked
--    authenticated as well, over-correcting past main's own baseline.
--    Restored to that baseline.
grant execute on function public.register_operator_push(text,text,text,text) to authenticated;
grant execute on function public.unregister_operator_push(text) to authenticated;

-- 4. driver_locations / job_proofs: dropped to service-role-only on the
--    (correct) observation that both had 0 rows and looked unused --
--    but main's src/hooks/useDriverLocations.ts and useJobProofs.ts are
--    real, live features (driver app upserts location every ~10s and
--    inserts pickup/completion proofs; operator dashboard reads both
--    live via postgres_changes). 0 rows just means nobody has hit these
--    code paths yet in this project's short life, not that they're dead.
--    Restored with real scoping (staff read-all, driver own-row write)
--    instead of the fully-open anon/authenticated-all policies that were
--    there before -- so this is still a net hardening versus the
--    original state, not a plain revert.
create policy staff_select_driver_locations on public.driver_locations
  for select to authenticated using (private.is_staff());

create policy driver_own_locations on public.driver_locations
  for all to authenticated
  using (
    driver_id = (select auth.uid())
    or driver_id in (select id from public.drivers where email = (select auth.email()))
  )
  with check (
    driver_id = (select auth.uid())
    or driver_id in (select id from public.drivers where email = (select auth.email()))
  );

create policy staff_select_job_proofs on public.job_proofs
  for select to authenticated using (private.is_staff());

create policy driver_insert_job_proofs on public.job_proofs
  for insert to authenticated
  with check (
    exists (
      select 1 from public.bookings b
      where b.id = job_proofs.booking_id
        and (
          b.assigned_driver_id = (select auth.uid())
          or b.assigned_driver_id in (select id from public.drivers where email = (select auth.email()))
        )
    )
  );
