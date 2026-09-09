-- notify_operator_new_booking previously posted to
-- https://evexecoperator.vercel.app/api/push/dispatch, a route that has
-- never existed in this codebase -- confirmed by grep across the whole
-- repo. Every website booking has been silently failing to notify
-- operators by push since this trigger was written. Points it at the
-- new notify-operator-new-booking edge function instead, which fetches
-- VAPID keys and the subscriber list directly via the service-role key
-- rather than the now-revoked get_push_dispatch_bundle RPC.

begin;

create or replace function public.notify_operator_new_booking()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_secret text;
begin
  if coalesce(new.source, 'website') <> 'website' then return new; end if;
  select webhook_secret into v_secret from public.push_config where id = true;
  if v_secret is null then return new; end if;
  perform net.http_post(
    url     := 'https://yoltkmhtxwluqxxpewbl.supabase.co/functions/v1/notify-operator-new-booking',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
    body    := jsonb_build_object('record', row_to_json(new))
  );
  return new;
end;
$function$;

commit;
