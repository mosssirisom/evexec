-- Fix 1 (audit C-1): office booking/payment push notifications go to staff only.
--
-- Root cause: register_operator_push is SECURITY DEFINER and executable by
-- every signed-in account (customers can sign up on the website), with no
-- role check, so it bypassed the staff-only RLS policy on
-- operator_push_subscriptions. get_push_dispatch_bundle then returned every
-- stored subscription, and the Operator app's /api/push/dispatch pushed new
-- bookings and payments (customer names, routes, times, amounts) to all of them.
--
-- Fix:
--   1. register_operator_push refuses callers without an office role
--      (super_admin, operator_admin, dispatcher), the same rule as the
--      table's RLS policy, and rejects empty subscriptions.
--   2. get_push_dispatch_bundle only returns subscriptions whose owner holds
--      an office role right now, so any row registered by a non-staff
--      account (none exist on 15/10/2026: 2 of 2 are staff) and devices of
--      people removed from the team stop receiving pushes.
-- Signatures and grants are unchanged, so callers need no change.
-- Rollback: re-create both functions from the previous definitions
-- (supabase/tests/baseline.sql holds them verbatim).

create or replace function public.register_operator_push(
  p_endpoint text, p_p256dh text, p_auth text, p_label text default null::text
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if auth.uid() is null or not exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid()
      and tu.role in ('super_admin', 'operator_admin', 'dispatcher')
  ) then
    raise exception 'Only office staff can turn on booking alerts.' using errcode = '42501';
  end if;

  if coalesce(btrim(p_endpoint), '') = '' or coalesce(btrim(p_p256dh), '') = '' or coalesce(btrim(p_auth), '') = '' then
    raise exception 'Invalid push subscription.' using errcode = '22023';
  end if;

  insert into public.operator_push_subscriptions (endpoint, p256dh, auth, label, user_id)
  values (p_endpoint, p_p256dh, p_auth, p_label, auth.uid())
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh, auth = excluded.auth,
        label = excluded.label, user_id = excluded.user_id;
end;
$function$;

create or replace function public.get_push_dispatch_bundle(p_secret text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare c public.push_config; v jsonb;
begin
  select * into c from public.push_config where id = true;
  if c.webhook_secret is null or p_secret is distinct from c.webhook_secret then
    return null;
  end if;
  select jsonb_build_object(
    'vapid_public',  c.vapid_public,
    'vapid_private', c.vapid_private,
    'vapid_subject', coalesce(c.vapid_subject, 'mailto:book@evexec.co.uk'),
    'subscriptions', coalesce((
      select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
      from public.operator_push_subscriptions s
      where exists (
        select 1 from public.tenant_users tu
        where tu.user_id = s.user_id
          and tu.role in ('super_admin', 'operator_admin', 'dispatcher')
      )), '[]'::jsonb)
  ) into v;
  return v;
end;
$function$;
