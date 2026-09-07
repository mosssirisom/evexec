-- Security hardening: close every gap found in a full-ecosystem audit.
--
-- Every fix here was verified against the real client codebases (evexec,
-- evexecoperator, evexecdriverapp) and their edge functions before being
-- applied, specifically to confirm no legitimate caller would break.

begin;

-- 1. audit_log: was anon+authenticated ALL/true -- anyone unauthenticated
--    could forge or wipe the entire audit trail. Now: any authenticated
--    user may append an entry attributed to themselves (matches how
--    evexecoperator's logActivity() actually writes: actor_id = the
--    caller's own auth.uid()), only staff may read it, and nobody but
--    service_role may update or delete it -- audit logs should be
--    append-only by design regardless of multi-tenancy.
drop policy if exists audit_log_anon_all on public.audit_log;
drop policy if exists audit_log_authenticated_all on public.audit_log;

create policy audit_log_insert_own on public.audit_log
  for insert
  to authenticated
  with check (actor_id = auth.uid());

create policy audit_log_select_staff on public.audit_log
  for select
  to authenticated
  using (
    exists (
      select 1 from public.tenant_users tu
      where tu.user_id = auth.uid()
        and tu.role in ('super_admin', 'operator_admin', 'dispatcher')
    )
  );

-- 2. error_log: same problem, anon+authenticated ALL/true. Diagnostic
--    error reports come only from the (staff-only) operator dashboard, so
--    there's no legitimate anonymous writer to preserve. Authenticated
--    users may still insert (client-side error reporting can't always
--    attribute to a specific staff row before auth settles), staff may
--    read, nobody may update/delete outside service_role.
drop policy if exists error_log_anon_all on public.error_log;
drop policy if exists error_log_authenticated_all on public.error_log;

create policy error_log_insert_authenticated on public.error_log
  for insert
  to authenticated
  with check (true);

create policy error_log_select_staff on public.error_log
  for select
  to authenticated
  using (
    exists (
      select 1 from public.tenant_users tu
      where tu.user_id = auth.uid()
        and tu.role in ('super_admin', 'operator_admin', 'dispatcher')
    )
  );

-- 3. Four SECURITY DEFINER functions had no legitimate caller anywhere in
--    any of the three codebases or their edge functions (confirmed by
--    grep across evexec, evexecoperator, evexecdriverapp, and every
--    supabase/functions directory) -- pure dead attack surface:
--
--    - queue_customer_sms: any authenticated (i.e. any customer account)
--      could queue an SMS to any phone number with any text via the
--      business's Twilio account -- an open spam/phishing relay.
--    - register_operator_push / unregister_operator_push: no ownership
--      check on unregister at all (anyone could silence any operator's
--      alerts); no staff check on register (any customer could register
--      to receive operator-facing alerts containing other customers'
--      names and phone numbers).
--    - get_push_dispatch_bundle: anon-callable; given its secret,
--      returns the VAPID *private* key plus every operator push
--      endpoint. Its intended caller (an /api/push/dispatch route)
--      doesn't exist in evexecoperator, so this has been pure exposure
--      with zero functional benefit.
--
--    Revoking execute from anon/authenticated is safe with no feature
--    loss today; if any of these are wired up for real later, whoever
--    builds that should grant execute back deliberately alongside real
--    authorization checks in the function body.
revoke execute on function public.queue_customer_sms(text, text, text, text) from anon, authenticated;
revoke execute on function public.register_operator_push(text, text, text, text) from anon, authenticated;
revoke execute on function public.unregister_operator_push(text) from anon, authenticated;
revoke execute on function public.get_push_dispatch_bundle(text) from anon, authenticated;

-- Trigger-only function, never meant to be called directly -- revoking
-- execute doesn't affect it firing as an actual trigger (trigger
-- execution isn't gated by the invoking role's function-level EXECUTE
-- grant), it only stops someone calling it directly via RPC.
revoke execute on function public.trg_fn_notify_driver_unassigned() from anon, authenticated;

-- 4. drivers: dashboard_authenticated_select_drivers let *any*
--    authenticated user -- i.e. any customer with a free account --
--    read every driver's full record (phone, email, vehicle
--    registration, licence/DBS/MOT expiry, live GPS) across every
--    tenant. staff_all_drivers (private.staff_for_tenant) already covers
--    legitimate dashboard access for actual staff, and drivers_self_select
--    covers a driver reading their own row, so dropping this is pure
--    risk reduction with no loss of real functionality.
drop policy if exists dashboard_authenticated_select_drivers on public.drivers;

-- 5. driver_unavailable_dates had the same "any authenticated user" hole
--    with no staff-scoped replacement -- unlike drivers, there wasn't
--    already a tenant-scoped staff policy on this table, so dropping the
--    open one outright would have broken the dashboard's real "avoid
--    double-booking an unavailable driver" use case. Replaced with a
--    proper tenant-scoped staff policy instead of just deleting it. The
--    table has no tenant_id of its own; it's scoped via a join to the
--    driver's tenant, the same way bookings_driver_select already joins
--    through drivers elsewhere in this schema.
drop policy if exists dashboard_authenticated_select_driver_unavailable_dates on public.driver_unavailable_dates;

create policy staff_select_driver_unavailable_dates on public.driver_unavailable_dates
  for select
  to authenticated
  using (
    exists (
      select 1 from public.drivers d
      where d.id = driver_unavailable_dates.driver_id
        and private.staff_for_tenant(d.tenant_id)
    )
  );

-- 6. driver_locations / job_proofs: fully open anon+authenticated
--    read/write on both. Confirmed dead (0 rows, superseded by
--    drivers.current_lat/current_lng and booking_photos respectively per
--    prior migration history) -- but a loaded, reachable hole
--    regardless of whether anything currently populates it. Drop every
--    anon/authenticated policy; service_role access is untouched.
drop policy if exists driver_locations_anon_insert on public.driver_locations;
drop policy if exists driver_locations_anon_select on public.driver_locations;
drop policy if exists driver_locations_anon_update on public.driver_locations;
drop policy if exists driver_locations_authenticated_all on public.driver_locations;

drop policy if exists job_proofs_anon_insert on public.job_proofs;
drop policy if exists job_proofs_anon_select on public.job_proofs;
drop policy if exists job_proofs_authenticated_all on public.job_proofs;

-- 7. notification_channel_settings: ncs_write let *any* authenticated
--    user (any customer) globally disable email/SMS/push/WhatsApp for
--    the entire business with one PATCH request. Restricted to staff.
--    This is a single global settings row today (no per-tenant support
--    yet); gating by "is staff of any tenant" is strictly better than
--    "is anyone with an account" and is a reasonable interim fix ahead
--    of proper per-tenant notification settings.
drop policy if exists ncs_write on public.notification_channel_settings;

create policy staff_write_notification_channel_settings on public.notification_channel_settings
  for all
  to authenticated
  using (
    exists (
      select 1 from public.tenant_users tu
      where tu.user_id = auth.uid()
        and tu.role in ('super_admin', 'operator_admin', 'dispatcher')
    )
  )
  with check (
    exists (
      select 1 from public.tenant_users tu
      where tu.user_id = auth.uid()
        and tu.role in ('super_admin', 'operator_admin', 'dispatcher')
    )
  );

commit;
