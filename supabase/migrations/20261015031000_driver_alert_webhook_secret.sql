-- Fix 2 (audit H-1): driver-alert triggers send a shared secret.
--
-- Root cause: the send-push and notify-job-update edge functions are public
-- (verify_jwt off), checked nothing, and trusted the booking in the request
-- body. Anyone who knew a driver's id could send that driver a push or email
-- such as "Job cancelled, do not travel to the collection point".
--
-- Fix (database half): both triggers now send push_config.webhook_secret in
-- the x-webhook-secret header (the secret the Operator app's dispatch route
-- already uses). The updated functions (evexecdriverapp, same fix) refuse
-- requests without it and read the booking from the database by id.
-- notify_driver_new_booking also stops sending the anon key literal and uses
-- the same vault-held Authorization value as notify_driver_job_update.
-- The request bodies are unchanged, so the currently deployed functions keep
-- working until the new versions are deployed.
--
-- Order: apply this migration BEFORE deploying the new send-push and
-- notify-job-update. Rollback: re-create both trigger functions from
-- supabase/tests/baseline.sql (previous definitions; the anon key literal is
-- redacted there and must be taken from the live definition saved before
-- applying).

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
                 'x-webhook-secret', (select c.webhook_secret from public.push_config c where c.id = true),
                 'Authorization', 'Bearer ' || coalesce((
                   select s.decrypted_secret from vault.decrypted_secrets s
                   where s.name = 'attestation_engine_service_key' limit 1), '')
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
      'x-webhook-secret', (SELECT c.webhook_secret FROM public.push_config c WHERE c.id = true),
      'Authorization',    'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'attestation_engine_service_key' LIMIT 1
      )
    )
  );

  RETURN new;
END;
$function$;
