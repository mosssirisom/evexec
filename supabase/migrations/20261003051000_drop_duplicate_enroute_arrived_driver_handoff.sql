-- Stop the duplicate "please text the customer" driver handoff on En Route /
-- Arrived.
--
-- Since 2026-10-03 the driver app opens a pre-filled customer SMS directly
-- when the driver swipes to En Route or Arrived. For customers with no email,
-- enqueue_operator_customer_notifications() was also inserting a
-- driver_sms_reminders row for the same event, which push-notified the driver
-- to send a second text. That branch is removed; everything else is
-- unchanged: email customers still get the queued status email (now sent
-- within a minute by the notification-queue-sweep cron), and Cancelled still
-- hands off to the driver / staff as before.

create or replace function public.enqueue_operator_customer_notifications()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_phone   text := nullif(trim(new.customer_phone), '');
  v_email   text := nullif(trim(new.customer_email), '');
  v_name    text := coalesce(nullif(trim(new.customer_name), ''), 'there');
  v_timetxt text;
  v_status  text := lower(coalesce(new.payment_status, ''));
  v_did     uuid := coalesce(new.assigned_driver_id, new.driver_id);
  v_msg     text; v_conf text; v_ch text;
  v_is_operator boolean := coalesce(new.source, 'website') = 'operator';
  v_reminder_type text;
begin
  if v_phone is null and v_email is null then return new; end if;

  v_ch := case when v_email is not null then 'email'
               when v_phone is not null then 'sms'
               else null end;

  if tg_op = 'INSERT' then
    if v_is_operator and v_ch is not null then
      v_timetxt := coalesce(
        to_char(new.pickup_time, 'DD Mon HH24:MI'),
        nullif(btrim(coalesce(to_char(new.travel_date, 'DD Mon'), '')
                     || ' ' || coalesce(new.travel_time, '')), '')
      );
      v_conf := 'EV Exec: Hi ' || v_name || ', your airport transfer' || coalesce(' (' || v_timetxt || ')','') || ' is booked. Ref ' || new.ref || '.';

      if not exists (select 1 from notification_queue q where q.booking_id=new.id and q.type='received')
         and not exists (select 1 from notification_log   l where l.booking_id=new.id and l.type='received')
         and not exists (select 1 from operator_sms_tasks  t where t.booking_id=new.id and t.kind='confirmation') then
        if v_ch='email' then
          insert into notification_queue (id,booking_id,type,channel,recipient,subject,body,html,status,attempts,next_attempt_at,created_at)
          values (gen_random_uuid(),new.id,'received','email',v_email,'Your EV Exec airport transfer is booked (Ref '||new.ref||')',v_conf,'<p>'||v_conf||'</p>','pending',0,now(),now());
        else
          -- Two-tap automation: no driver is normally assigned yet at
          -- booking creation, so this always hands off to staff.
          insert into public.operator_sms_tasks (booking_id, kind, customer_name, customer_phone, message, status)
          values (new.id, 'confirmation', v_name, v_phone, v_conf, 'pending')
          on conflict (booking_id, kind) do nothing;
        end if;
      end if;
    end if;
    -- reminder_24h / 7day is no longer created here -- evexec's own reminder
    -- cron (api/reminders/trigger.js) is the single owner for every booking
    -- regardless of source. See migration comment above.

  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      if new.status='En Route' and old.status='Dispatched' then
        v_msg := 'EV Exec: your driver is on the way. Ref '||new.ref||'.';
        v_reminder_type := 'en_route';
      elsif new.status='Arrived' and old.status='En Route' then
        v_msg := 'EV Exec: your driver has arrived at the pickup point. Ref '||new.ref||'.';
        v_reminder_type := 'arrived';
      elsif new.status='Cancelled' and old.status<>'Completed'
            and not (new.operator_response = 'rejected'
                     and old.operator_response is distinct from new.operator_response) then
        v_msg := 'EV Exec: your booking '||new.ref||' has been cancelled. Please contact us if this is unexpected.';
        v_reminder_type := 'cancelled';
      else v_msg := null; end if;

      if v_msg is not null and v_ch is not null then
        if v_ch='email' then
          insert into notification_queue (id,booking_id,type,channel,recipient,subject,body,html,status,attempts,next_attempt_at,created_at)
          values (gen_random_uuid(),new.id,'status_update','email',v_email,'Update on your EV Exec transfer (Ref '||new.ref||')',v_msg,'<p>'||v_msg||'</p>','pending',0,now(),now());
        elsif v_reminder_type in ('en_route', 'arrived') then
          -- No handoff: the driver app opens a pre-filled customer SMS on the
          -- En Route / Arrived swipe itself (2026-10-03).
          null;
        else
          -- Two-tap automation instead of a direct Twilio send: hand the SMS
          -- off to the assigned driver, or to staff if a booking is cancelled
          -- before any driver was ever assigned.
          if v_did is not null then
            insert into public.driver_sms_reminders
              (booking_id, driver_id, reminder_type, customer_name, customer_phone, travel_date, travel_time, message, status)
            values
              (new.id, v_did, v_reminder_type, v_name, v_phone, new.travel_date, new.travel_time, v_msg, 'pending')
            on conflict (booking_id, reminder_type) do nothing;
          else
            insert into public.operator_sms_tasks
              (booking_id, kind, customer_name, customer_phone, message, status)
            values
              (new.id, 'cancellation', v_name, v_phone, v_msg, 'pending')
            on conflict (booking_id, kind) do nothing;
          end if;
        end if;
      end if;
    end if;
  end if;

  return new;
end;
$function$;
