-- Rollback for 20261015030000_office_push_staff_only.sql (Fix 1).
-- Restores the two functions exactly as they were live on 15/10/2026
-- (pg_get_functiondef; md5 register_operator_push 5a19f9b4538876d8a0f8f88683e93bd7,
-- get_push_dispatch_bundle aa3105122bb4e917683fb4e4dc4a8447).
-- CREATE OR REPLACE keeps the existing grants. No data is touched.

begin;

CREATE OR REPLACE FUNCTION public.register_operator_push(p_endpoint text, p_p256dh text, p_auth text, p_label text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  insert into public.operator_push_subscriptions (endpoint, p256dh, auth, label, user_id)
  values (p_endpoint, p_p256dh, p_auth, p_label, auth.uid())
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh, auth = excluded.auth,
        label = excluded.label, user_id = excluded.user_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_push_dispatch_bundle(p_secret text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      select jsonb_agg(jsonb_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth))
      from public.operator_push_subscriptions), '[]'::jsonb)
  ) into v;
  return v;
end;
$function$;

commit;
