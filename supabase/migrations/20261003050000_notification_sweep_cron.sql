-- Send queued customer emails within a minute instead of once a day.
--
-- The DB trigger enqueue_operator_customer_notifications() queues "driver on
-- the way" / "driver has arrived" emails in notification_queue, but the only
-- thing that sent them was evexec's Vercel cron (/api/notifications/retry),
-- which on this plan runs once a day at 08:00 UTC -- so status emails reached
-- customers the next morning.
--
-- This adds a free pg_cron job that calls the same endpoint every minute, but
-- only when something in the queue is actually due, so the website is hit a
-- handful of times a day rather than 1,440.
--
-- Auth: a random token generated here and stored only in the Supabase vault.
-- The endpoint verifies it via verify_notification_sweep_token() (callable by
-- service_role only), so the secret never needs copying into Vercel.

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'notification_sweep_token') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'notification_sweep_token',
      'Bearer token for the pg_cron -> evexec /api/notifications/retry sweep'
    );
  end if;
end $$;

create or replace function public.verify_notification_sweep_token(p_token text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'notification_sweep_token'
      and decrypted_secret = p_token
  );
$$;

revoke all on function public.verify_notification_sweep_token(text) from public, anon, authenticated;
grant execute on function public.verify_notification_sweep_token(text) to service_role;

select cron.unschedule('notification-queue-sweep')
where exists (select 1 from cron.job where jobname = 'notification-queue-sweep');

select cron.schedule(
  'notification-queue-sweep',
  '* * * * *',
  $cmd$
    select net.http_post(
      url     := 'https://www.evexec.co.uk/api/notifications/retry',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'notification_sweep_token'
        )
      ),
      body := '{}'::jsonb
    )
    where exists (
      select 1 from public.notification_queue
      where status = 'pending' and attempts < 5 and next_attempt_at <= now()
    );
  $cmd$
);
