-- Fix 2: driver-alert triggers send the webhook secret the functions require,
-- and keep the request body the currently deployed functions expect.
select test.as_owner();
delete from net.calls;

-- Assigning a driver fires send-push.
update public.bookings set assigned_driver_id = 'bbbbbbbb-0000-0000-0000-000000000d02', driver_id = 'bbbbbbbb-0000-0000-0000-000000000d02'
 where id = 'cccccccc-0000-0000-0000-0000000000b1';
select test.ok((select count(*) = 1 from net.calls where url like '%/functions/v1/send-push'), 'driver assignment calls send-push once');
select test.ok((select headers->>'x-webhook-secret' = 'test-webhook-secret' from net.calls where url like '%/send-push'),
  'send-push call carries the webhook secret');
select test.ok((select headers->>'Authorization' not like '%ANON_KEY%' from net.calls where url like '%/send-push'),
  'send-push call no longer carries the anon key literal');
select test.ok((select body->'record'->>'id' = 'cccccccc-0000-0000-0000-0000000000b1' and body->'record' ? 'assigned_driver_id' from net.calls where url like '%/send-push'),
  'send-push body unchanged (booking record), so the deployed function keeps working');

-- Changing the pickup time fires notify-job-update.
delete from net.calls;
update public.bookings set travel_time = '11:30' where id = 'cccccccc-0000-0000-0000-0000000000b1';
select test.ok((select count(*) = 1 from net.calls where url like '%/functions/v1/notify-job-update'), 'time change calls notify-job-update once');
select test.ok((select headers->>'x-webhook-secret' = 'test-webhook-secret' from net.calls where url like '%/notify-job-update'),
  'notify-job-update call carries the webhook secret');
select test.ok((select body->'old_record'->>'travel_time' = '09:00' and body->'record'->>'travel_time' = '11:30' from net.calls where url like '%/notify-job-update'),
  'notify-job-update body still has old and new values');

-- Unrelated edits fire nothing.
delete from net.calls;
update public.bookings set driver_notes = 'gate code 1234' where id = 'cccccccc-0000-0000-0000-0000000000b1';
select test.ok((select count(*) = 0 from net.calls), 'note change sends no driver alert');
