-- Fix 2: driver-alert triggers send a dedicated vault secret the functions
-- require, and keep the request body the currently deployed functions expect.
select test.as_owner();
delete from net.calls;

-- The migration generated a long random secret in vault, separate from the
-- office-push secret.
select test.ok((select length(decrypted_secret) = 64 from vault.decrypted_secrets where name = 'driver_alert_webhook_secret'),
  'migration created a 256-bit driver-alert secret in vault');
select test.ok((select decrypted_secret from vault.decrypted_secrets where name = 'driver_alert_webhook_secret')
  <> (select webhook_secret from public.push_config where id = true), 'driver-alert secret differs from the office-push secret');

-- Assigning a driver fires send-push.
update public.bookings set assigned_driver_id = 'bbbbbbbb-0000-0000-0000-000000000d02', driver_id = 'bbbbbbbb-0000-0000-0000-000000000d02'
 where id = 'cccccccc-0000-0000-0000-0000000000b1';
select test.ok((select count(*) = 1 from net.calls where url like '%/functions/v1/send-push'), 'driver assignment calls send-push once');
select test.ok((select headers->>'x-webhook-secret' = (select decrypted_secret from vault.decrypted_secrets where name = 'driver_alert_webhook_secret')
  from net.calls where url like '%/send-push'), 'send-push call carries the driver-alert secret');
select test.ok((select not (headers ? 'Authorization') from net.calls where url like '%/send-push'),
  'send-push call no longer carries any key in Authorization');
select test.ok((select body->'record'->>'id' = 'cccccccc-0000-0000-0000-0000000000b1' and body->'record' ? 'assigned_driver_id' from net.calls where url like '%/send-push'),
  'send-push body unchanged (booking record), so the deployed function keeps working');

-- Changing the pickup time fires notify-job-update.
delete from net.calls;
update public.bookings set travel_time = '11:30' where id = 'cccccccc-0000-0000-0000-0000000000b1';
select test.ok((select count(*) = 1 from net.calls where url like '%/functions/v1/notify-job-update'), 'time change calls notify-job-update once');
select test.ok((select headers->>'x-webhook-secret' = (select decrypted_secret from vault.decrypted_secrets where name = 'driver_alert_webhook_secret')
  from net.calls where url like '%/notify-job-update'), 'notify-job-update call carries the driver-alert secret');
select test.ok((select not (headers ? 'Authorization') from net.calls where url like '%/notify-job-update'),
  'notify-job-update call no longer sends the vault service key');
select test.ok((select body->'old_record'->>'travel_time' = '09:00' and body->'record'->>'travel_time' = '11:30' from net.calls where url like '%/notify-job-update'),
  'notify-job-update body still has old and new values');

-- Unrelated edits fire nothing.
delete from net.calls;
update public.bookings set driver_notes = 'gate code 1234' where id = 'cccccccc-0000-0000-0000-0000000000b1';
select test.ok((select count(*) = 0 from net.calls), 'note change sends no driver alert');

-- Who can read the secrets.
select test.as_service();
select test.ok(array_length(public.driver_alert_webhook_secrets(), 1) = 1, 'service role (edge functions) can read the accepted secret');
select test.login('bbbbbbbb-0000-0000-0000-000000000d01', 'dr1@example.com');
select test.throws($$select public.driver_alert_webhook_secrets()$$, 'a signed-in driver cannot read the secret');
select test.throws($$select webhook_secret from public.push_config$$, 'a signed-in user has no access to push_config at all');
select set_config('request.jwt.claim.sub', '', true), set_config('role', 'anon', true);
select test.throws($$select public.driver_alert_webhook_secrets()$$, 'anonymous caller cannot read the secret');
select test.throws($$select webhook_secret from public.push_config$$, 'anonymous caller has no access to push_config');

-- Rotation: previous value is accepted alongside the new one.
select test.as_owner();
select vault.create_secret('old-secret-value', 'driver_alert_webhook_secret_previous');
select test.as_service();
select test.ok(array_length(public.driver_alert_webhook_secrets(), 1) = 2
  and 'old-secret-value' = any(public.driver_alert_webhook_secrets()), 'during rotation both secrets are accepted');
-- Office push lookups (SECURITY DEFINER) still work after the grant revoke.
select set_config('request.jwt.claim.sub', '', true), set_config('role', 'anon', true);
select test.ok(public.get_push_dispatch_bundle('test-webhook-secret') is not null, 'office dispatch bundle still works for the Operator route');
