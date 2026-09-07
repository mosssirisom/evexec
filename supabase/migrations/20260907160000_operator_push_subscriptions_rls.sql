-- Operator push notifications for new bookings have never actually
-- worked: the DB trigger that's meant to fire them (notify_operator_new_
-- booking) posts to a Vercel route that doesn't exist in evexecoperator,
-- and register_operator_push/unregister_operator_push (now revoked, see
-- 20260907150000_security_hardening.sql) had no staff/ownership check at
-- all -- there was also no subscribe UI anywhere in the dashboard to call
-- them. This migration is the database half of wiring the feature up for
-- real: real RLS policies on operator_push_subscriptions scoped to the
-- caller's own row (matching how push_subscriptions already works for
-- drivers via driver_own_subs), so the client can subscribe/unsubscribe
-- with a plain upsert/delete instead of a SECURITY DEFINER bypass
-- function. No function needed -- RLS is the simpler, safer mechanism
-- here since the row already carries user_id.

begin;

create policy staff_manage_own_push_subscription on public.operator_push_subscriptions
  for all
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.tenant_users tu
      where tu.user_id = auth.uid()
        and tu.role in ('super_admin', 'operator_admin', 'dispatcher')
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.tenant_users tu
      where tu.user_id = auth.uid()
        and tu.role in ('super_admin', 'operator_admin', 'dispatcher')
    )
  );

commit;
