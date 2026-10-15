-- Fix 2 (audit H-1): driver-alert triggers send a dedicated shared secret.
--
-- Root cause: the send-push and notify-job-update edge functions are public
-- (verify_jwt off), checked nothing, and trusted the booking in the request
-- body. Anyone who knew a driver's id could send that driver a push or email
-- such as "Job cancelled, do not travel to the collection point".
--
-- Fix (database half):
--   1. A dedicated random secret, generated inside the database and stored
--      in Supabase Vault as 'driver_alert_webhook_secret'. Its value is never
--      written to a file, a migration or a log, and it is separate from
--      push_config.webhook_secret (the office-push secret also held by the
--      website in Vercel), so a leak of one doesn't open the other.
--   2. Both triggers send it in the x-webhook-secret header. They no longer
--      send an Authorization header: both functions run with verify_jwt off,
--      so it was never checked, and it carried the anon key (send-push) or a
--      vault-held service key (notify-job-update) out of the database for
--      nothing.
--   3. public.driver_alert_webhook_secrets() returns the accepted values
--      (current, plus 'driver_alert_webhook_secret_previous' while a rotation
--      is in progress). Only service_role may execute it; the updated
--      functions (evexecdriverapp, same fix) call it and refuse anything else.
--   4. Hardening: anon/authenticated lose their (unused) table grants on
--      push_config. It is RLS-locked with no policies today; this keeps the
--      office-push secret safe even if a policy is ever added by mistake.
--      Every reader uses the service role or a SECURITY DEFINER function.
-- The request bodies are unchanged, so the currently deployed functions
-- (which check nothing) keep working until the new versions are deployed.
--
-- Rotation (no downtime):
--   select vault.create_secret((select decrypted_secret from vault.decrypted_secrets where name = 'driver_alert_webhook_secret'),
--                              'driver_alert_webhook_secret_previous');
--   select vault.update_secret((select id from vault.secrets where name = 'driver_alert_webhook_secret'),
--                              encode(extensions.gen_random_bytes(32), 'hex'));
--   -- functions now accept both; triggers send the new one. After a few
--   -- minutes (no retries in flight), remove the previous one:
--   delete from vault.secrets where name = 'driver_alert_webhook_secret_previous';
--
-- Order: apply this migration BEFORE deploying the new send-push and
-- notify-job-update. Rollback: re-create both trigger functions from the
-- definitions saved from production before applying (the anon key literal is
-- redacted in supabase/tests/baseline.sql) and re-grant push_config; the
-- vault secret and the RPC can stay (unused) or be removed.

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'driver_alert_webhook_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'driver_alert_webhook_secret',
      'x-webhook-secret for the send-push and notify-job-update edge functions (Fix 2)');
  end if;
end $$;

create or replace function public.driver_alert_webhook_secrets()
returns text[]
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(array_agg(s.decrypted_secret order by s.name), '{}')
  from vault.decrypted_secrets s
  where s.name in ('driver_alert_webhook_secret', 'driver_alert_webhook_secret_previous')
    and coalesce(s.decrypted_secret, '') <> '';
$function$;
revoke all on function public.driver_alert_webhook_secrets() from public, anon, authenticated;
grant execute on function public.driver_alert_webhook_secrets() to service_role;

revoke all on table public.push_config from anon, authenticated;

create or replace function public.notify_driver_new_booking()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if NEW.assigned_driver_id is null then
    return NEW;
  end if;

  if TG_OP = 'UPDATE' and
     OLD.assigned_driver_id is not distinct from NEW.assigned_driver_id then
    return NEW;
  end if;

  perform net.http_post(
    url     := 'https://yoltkmhtxwluqxxpewbl.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-webhook-secret', (select s.decrypted_secret from vault.decrypted_secrets s
                                      where s.name = 'driver_alert_webhook_secret' limit 1)
               ),
    body    := jsonb_build_object('record', row_to_json(NEW))
  );

  return NEW;
end;
$function$;

create or replace function public.notify_driver_job_update()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  cancelled_statuses text[] := ARRAY['cancelled','Cancelled','canceled','Canceled'];
  is_cancelled       boolean;
  detail_changed     boolean;
  payload            jsonb;
BEGIN
  IF new.assigned_driver_id IS NULL THEN RETURN new; END IF;

  is_cancelled := new.status = ANY(cancelled_statuses)
               AND NOT (old.status = ANY(cancelled_statuses));

  detail_changed := (
    new.travel_date      IS DISTINCT FROM old.travel_date     OR
    new.travel_time      IS DISTINCT FROM old.travel_time     OR
    new.pickup_location  IS DISTINCT FROM old.pickup_location OR
    new.airport          IS DISTINCT FROM old.airport         OR
    new.dropoff_address  IS DISTINCT FROM old.dropoff_address
  ) AND NOT (new.status = ANY(cancelled_statuses));

  IF NOT (is_cancelled OR detail_changed) THEN RETURN new; END IF;

  payload := jsonb_build_object(
    'record', jsonb_build_object(
      'id',                 new.id,
      'ref',                new.ref,
      'status',             new.status,
      'assigned_driver_id', new.assigned_driver_id,
      'customer_name',      new.customer_name,
      'travel_date',        new.travel_date,
      'travel_time',        new.travel_time,
      'pickup_location',    new.pickup_location,
      'airport',            new.airport,
      'dropoff_address',    new.dropoff_address,
      'journey_type',       new.journey_type
    ),
    'old_record', jsonb_build_object(
      'id',              old.id,
      'status',          old.status,
      'travel_date',     old.travel_date,
      'travel_time',     old.travel_time,
      'pickup_location', old.pickup_location,
      'airport',         old.airport,
      'dropoff_address', old.dropoff_address
    )
  );

  PERFORM net.http_post(
    url     := 'https://yoltkmhtxwluqxxpewbl.supabase.co/functions/v1/notify-job-update',
    body    := payload,
    headers := jsonb_build_object(
      'Content-Type',     'application/json',
      'x-webhook-secret', (SELECT s.decrypted_secret FROM vault.decrypted_secrets s
                           WHERE s.name = 'driver_alert_webhook_secret' LIMIT 1)
    )
  );

  RETURN new;
END;
$function$;
