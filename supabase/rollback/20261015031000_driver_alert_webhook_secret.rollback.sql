-- Rollback for 20261015031000_driver_alert_webhook_secret.sql (Fix 2, database half).
-- Restores both trigger functions exactly as they were live on 15/10/2026
-- (pg_get_functiondef md5: notify_driver_new_booking 4630a641cf8be7834d7fef926fe36b11,
-- notify_driver_job_update 6b92411ea2fe177d97cbe18ae7910589) and the anon /
-- authenticated table grants on push_config. CREATE OR REPLACE keeps the
-- functions' own grants. The send-push Authorization value is the project's
-- public anon key (role "anon", the same value as NEXT_PUBLIC_SUPABASE_ANON_KEY
-- in evexecoperator/.env.example); it is not a secret.
-- Left in place on purpose (unused after rollback, harmless): the vault secret
-- 'driver_alert_webhook_secret' and public.driver_alert_webhook_secrets()
-- (service_role only). Roll back the edge functions FIRST if the new versions
-- are deployed: they refuse calls without the secret header.

begin;

CREATE OR REPLACE FUNCTION public.notify_driver_new_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
                 'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvbHRrbWh0eHdsdXF4eHBld2JsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0ODMwNjgsImV4cCI6MjA5NTA1OTA2OH0.kLwJK13TsSNn4oK3NZj33awGigWfdKgPP-cbqpqrIbo'
               ),
    body    := jsonb_build_object('record', row_to_json(NEW))
  );

  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_driver_job_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'attestation_engine_service_key' LIMIT 1
      )
    )
  );

  RETURN new;
END;
$function$
;

grant select, insert, update, delete, truncate, references, trigger on table public.push_config to anon, authenticated;

commit;
