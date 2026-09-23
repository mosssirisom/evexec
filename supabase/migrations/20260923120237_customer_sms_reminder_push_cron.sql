-- Schedules send-customer-sms-reminder-push (deployed edge function) to run
-- every minute, reusing the invocation secret already seeded by
-- 20260922110340_enable_driver_reminder_and_attestation_cron.sql. Same
-- pattern as attestation-engine-sweep / driver-reminder-sweep.

do $outer$
declare
  v_project_url text := 'https://yoltkmhtxwluqxxpewbl.supabase.co';
begin
  begin
    perform cron.unschedule('customer-sms-reminder-push-sweep');
  exception when others then null;
  end;

  perform cron.schedule(
    'customer-sms-reminder-push-sweep',
    '* * * * *',
    format(
      $inner$
      select net.http_post(
        url     := %L,
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || (
            select decrypted_secret from vault.decrypted_secrets
            where name = 'attestation_engine_service_key'
          )
        ),
        body := '{}'::jsonb
      );
      $inner$,
      v_project_url || '/functions/v1/send-customer-sms-reminder-push'
    )
  );
end $outer$;
