begin;

-- Customer live status pings (En Route / Arrived / Cancelled) were the one
-- remaining automated flow still calling Twilio directly: the trigger below
-- already picks email over SMS per row (v_ch), but its "else sms" branch
-- inserted straight into notification_queue with channel='sms', which
-- evexec's daily /api/notifications/retry cron then sends via real Twilio.
-- Route that fallback through the two-tap automation instead: hand off to
-- the assigned driver (they're the one physically on the job at En
-- Route/Arrived) via driver_sms_reminders, or to staff via
-- operator_sms_tasks if no driver is assigned yet (a booking can be
-- cancelled before ever reaching that point).

alter table public.driver_sms_reminders drop constraint driver_sms_reminders_reminder_type_check;
alter table public.driver_sms_reminders add constraint driver_sms_reminders_reminder_type_check
  check (reminder_type in ('7day', '24hr', 'en_route', 'arrived', 'cancelled'));

alter table public.operator_sms_tasks drop constraint operator_sms_tasks_kind_check;
alter table public.operator_sms_tasks add constraint operator_sms_tasks_kind_check
  check (kind in ('confirmation', 'rejection', 'cancellation'));

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
  v_time5   text := substring(coalesce(new.travel_time,'') from 1 for 5);
  v_ukdate  text := case when new.travel_date is not null then to_char(new.travel_date,'DD/MM/YYYY') else null end;
  v_timetxt text := nullif(btrim(coalesce(v_time5,'') || ' ' || coalesce(v_ukdate,'')), '');
  v_sched   timestamptz := coalesce(
              new.pickup_time,
              case when new.travel_date is not null and new.travel_time ~ '^[0-2]?[0-9]:[0-5][0-9](:[0-5][0-9])?$'
                   then (new.travel_date::text || ' ' || new.travel_time)::timestamp at time zone 'Europe/London'
                   else null end);
  v_status  text := lower(coalesce(new.payment_status, ''));
  v_fare    text;
  v_did     uuid := coalesce(new.assigned_driver_id, new.driver_id);
  v_dname text; v_dfirst text; v_dvehicle text; v_dplate text;
  v_dclause text := '';
  v_vehval  text;
  v_croute  text;
  v_reminder text; v_reminder_html text; v_msg text; v_conf text; v_ch text;
  v_is_operator boolean := coalesce(new.source, 'website') = 'operator';
  v_reminder_type text;
begin
  if v_phone is null and v_email is null then return new; end if;

  v_ch := case when v_email is not null then 'email'
               when v_phone is not null then 'sms'
               else null end;

  if v_status = 'paid' then v_fare := ' Your fare has been paid in advance — nothing to pay the driver.';
  elsif v_status = 'invoiced' then v_fare := ' Your fare will be invoiced.';
  elsif new.quoted_price is not null then v_fare := ' Please have £' || trim(to_char(new.quoted_price,'FM999990.00')) || ' ready for your driver.';
  else v_fare := ''; end if;

  if v_did is not null then
    select name, vehicle, plate into v_dname, v_dvehicle, v_dplate from drivers where id = v_did;
    v_dfirst := split_part(trim(coalesce(v_dname,'')),' ',1);
    if nullif(v_dfirst,'') is not null then
      v_dclause := ' Your driver, ' || v_dfirst || ', will be in a ' || coalesce(nullif(trim(v_dvehicle),''),'vehicle')
        || coalesce(' (registration ' || nullif(trim(v_dplate),'') || ')','') || '.';
    end if;
    v_vehval := nullif(btrim(coalesce(nullif(trim(v_dvehicle),''),'') || coalesce(' · ' || nullif(trim(v_dplate),''),'')), '');
  end if;

  v_croute := case
    when nullif(new.pickup_location,'') is not null and nullif(new.dropoff_address,'') is not null
      then new.pickup_location || ' → ' || new.dropoff_address
    when new.direction='Destination → Airport'
      then coalesce(nullif(new.dropoff_address,''),nullif(new.pickup_location,''),'Pickup') || ' → ' || coalesce(nullif(new.airport,''),'Airport')
    else coalesce(nullif(new.airport,''),'Airport') || ' → ' || coalesce(nullif(new.dropoff_address,''),nullif(new.pickup_location,''),'Destination')
  end;

  if nullif(v_time5,'') is not null then
    v_reminder := 'EV Exec reminder: your airport transfer is tomorrow at ' || v_time5 || '.' || v_dclause
      || ' Ref ' || new.ref || '.' || v_fare;
    v_reminder_html := evexec_notification_email(
      'Reminder — trip tomorrow', '#e6effb', '#1e4a8a',
      'Hi ' || evexec_esc(v_name) || ', this is a friendly reminder that your airport transfer is tomorrow at ' || v_time5 || '.',
      jsonb_build_array(
        jsonb_build_object('label','When',      'value', v_timetxt),
        jsonb_build_object('label','Journey',   'value', v_croute),
        jsonb_build_object('label','Driver',    'value', v_dfirst),
        jsonb_build_object('label','Vehicle',   'value', v_vehval),
        jsonb_build_object('label','Reference', 'value', new.ref)
      ),
      nullif(btrim(v_fare),'')
    );
  end if;

  if tg_op = 'INSERT' then
    if v_is_operator and v_ch is not null then
      v_conf := 'EV Exec: Hi ' || v_name || ', your airport transfer' || coalesce(' (' || v_timetxt || ')','') || ' is booked. Ref ' || new.ref || '.';
      if not exists (select 1 from notification_queue q where q.booking_id=new.id and q.type='received')
         and not exists (select 1 from notification_log   l where l.booking_id=new.id and l.type='received') then
        if v_ch='email' then
          insert into notification_queue (id,booking_id,type,channel,recipient,subject,body,html,status,attempts,next_attempt_at,created_at)
          values (gen_random_uuid(),new.id,'received','email',v_email,'Your EV Exec airport transfer is booked (Ref '||new.ref||')',v_conf,'<p>'||v_conf||'</p>','pending',0,now(),now());
        else
          insert into notification_queue (id,booking_id,type,channel,recipient,body,status,attempts,next_attempt_at,created_at)
          values (gen_random_uuid(),new.id,'received','sms',v_phone,v_conf,'pending',0,now(),now());
        end if;
      end if;
    end if;

    if v_sched is not null and v_sched - interval '24 hours' > now() and v_reminder is not null and v_ch is not null then
      if not exists (select 1 from notification_queue q where q.booking_id=new.id and q.type='reminder_24h') then
        if v_ch='email' then
          insert into notification_queue (id,booking_id,type,channel,recipient,subject,body,html,status,attempts,next_attempt_at,created_at)
          values (gen_random_uuid(),new.id,'reminder_24h','email',v_email,'Reminder: your EV Exec transfer is tomorrow',v_reminder,v_reminder_html,'pending',0,v_sched - interval '24 hours',now());
        else
          insert into notification_queue (id,booking_id,type,channel,recipient,body,status,attempts,next_attempt_at,created_at)
          values (gen_random_uuid(),new.id,'reminder_24h','sms',v_phone,v_reminder,'pending',0,v_sched - interval '24 hours',now());
        end if;
      end if;
    end if;

  elsif tg_op = 'UPDATE' then
    if new.status = 'Cancelled' and old.status is distinct from 'Cancelled' then
      delete from notification_queue
        where booking_id = new.id and type = 'reminder_24h' and status = 'pending';
    end if;

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
        else
          -- Two-tap automation instead of a direct Twilio send: hand the SMS
          -- off to the assigned driver (present at En Route/Arrived by
          -- definition), or to staff if a booking is cancelled before any
          -- driver was ever assigned.
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

    if (new.payment_status is distinct from old.payment_status
        or coalesce(new.assigned_driver_id,new.driver_id) is distinct from coalesce(old.assigned_driver_id,old.driver_id))
       and v_reminder is not null then
      update notification_queue
         set body = v_reminder,
             html = case when channel='email' then v_reminder_html else html end
       where booking_id=new.id and type='reminder_24h' and status='pending';
    end if;
  end if;

  return new;
end;
$function$;

commit;
