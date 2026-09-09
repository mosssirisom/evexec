-- The prior security-hardening migration revoked EXECUTE on
-- get_push_dispatch_bundle and trg_fn_notify_driver_unassigned from the
-- named anon/authenticated roles, but both functions additionally had an
-- explicit grant to PUBLIC (Postgres's "every role, including future
-- ones" pseudo-role) -- a separate ACL entry that a role-specific revoke
-- does not touch, since every role implicitly has PUBLIC's privileges on
-- top of its own. Confirmed via pg_proc.proacl: both showed a bare
-- "=X/postgres" entry (empty role name denotes PUBLIC) that survived the
-- first migration. Closing that here.
revoke execute on function public.get_push_dispatch_bundle(text) from public;
revoke execute on function public.trg_fn_notify_driver_unassigned() from public;
