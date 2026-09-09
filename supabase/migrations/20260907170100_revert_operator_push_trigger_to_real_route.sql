-- The prior "fix" (20260907160100) redirected this trigger to a new
-- standalone edge function, believing the original target
-- (evexecoperator.vercel.app/api/push/dispatch) was dead -- true only
-- for the Vite SPA branch this session was mistakenly working against.
-- That route is real: it's origin/main's src/app/api/push/dispatch/
-- route.ts, a fully working implementation (subscribe UI in
-- src/lib/operator/push.js + src/app/operator/settings/page.jsx,
-- register_operator_push, and this same dispatch route) that predates
-- this session entirely. Reverting the trigger to call the real,
-- integrated route instead of an orphaned edge function no app
-- actually deploys or maintains.
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
    url     := 'https://evexecoperator.vercel.app/api/push/dispatch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
    body    := jsonb_build_object('record', row_to_json(new))
  );
  return new;
end;
$function$;

commit;
