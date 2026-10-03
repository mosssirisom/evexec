-- Branded customer status emails (user decision, 2026-10-03: one email design
-- everywhere, the light "EV EXEC / PREMIUM AIRPORT TRANSFERS" card).
--
-- enqueue_operator_customer_notifications() sent the booking-confirmed
-- (operator-created bookings), driver on the way, driver arrived and booking
-- cancelled emails as a single unstyled <p>. They now use
-- public.evexec_notification_email(), the same helper the driver emails use.
-- Logic, recipients, subjects and the plain-text body are unchanged.

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
  v_first   text := coalesce(nullif(split_part(trim(coalesce(new.customer_name, '')), ' ', 1), ''), 'there');
  v_timetxt text;
  v_status  text := lower(coalesce(new.payment_status, ''));
  v_did     uuid := coalesce(new.assigned_driver_id, new.driver_id);
  v_msg     text; v_conf text; v_ch text;
  v_is_operator boolean := coalesce(new.source, 'website') = 'operator';
  v_reminder_type text;
  v_rows    jsonb;
  v_html    text;
  v_drv_name text; v_drv_vehicle text;
  v_foot    text := 'Questions? Call or WhatsApp 07721 070370.';
begin
  if v_phone is null and v_email is null then return new; end if;

  v_ch := case when v_email is not null then 'email'
               when v_phone is not null then 'sms'
               else null end;

  v_timetxt := coalesce(
    to_char(new.pickup_time at time zone 'Europe/London', 'DD Mon YYYY HH24:MI'),
    nullif(btrim(coalesce(to_char(new.travel_date, 'DD Mon YYYY'), '')
                 || ' ' || coalesce(left(new.travel_time::text, 5), '')), '')
  );

  if v_did is not null then
    select nullif(trim(d.full_name), ''),
           nullif(btrim(coalesce(d.vehicle_model, '') || ' ' || coalesce(upper(d.vehicle_registration), '')), '')
      into v_drv_name, v_drv_vehicle
      from drivers d where d.id = v_did;
  end if;

  v_rows := jsonb_build_array(
    jsonb_build_object('label', 'Reference', 'value', new.ref),
    jsonb_build_object('label', 'Pickup',    'value', coalesce(nullif(new.pickup_location, ''), new.airport)),
    jsonb_build_object('label', 'Drop-off',  'value', coalesce(nullif(new.dropoff_address, ''),
                                                      case when nullif(new.pickup_location, '') is not null then new.airport end)),
    jsonb_build_object('label', 'Date & time', 'value', v_timetxt),
    jsonb_build_object('label', 'Flight',    'value', upper(nullif(new.flight_number, '')))
  );

  if tg_op = 'INSERT' then
    if v_is_operator and v_ch is not null then
      v_conf := 'EV Exec: Hi ' || v_name || ', your airport transfer' || coalesce(' (' || v_timetxt || ')','') || ' is booked. Ref ' || new.ref || '.';

      if not exists (select 1 from notification_queue q where q.booking_id=new.id and q.type='received')
         and not exists (select 1 from notification_log   l where l.booking_id=new.id and l.type='received')
         and not exists (select 1 from operator_sms_tasks  t where t.booking_id=new.id and t.kind='confirmation') then
        if v_ch='email' then
          v_html := evexec_notification_email(
            'Booking confirmed', '#fbf3e0', '#8a6516',
            'Hi ' || evexec_esc(v_first) || ', your airport transfer is booked. We look forward to seeing you.',
            v_rows, v_foot);
          insert into notification_queue (id,booking_id,type,channel,recipient,subject,body,html,status,attempts,next_attempt_at,created_at)
          values (gen_random_uuid(),new.id,'received','email',v_email,'Your EV Exec airport transfer is booked (Ref '||new.ref||')',v_conf,v_html,'pending',0,now(),now());
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
    -- cron (api/reminders/trigger.js) is the single owner for every booking.

  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      if new.status='En Route' and old.status='Dispatched' then
        v_msg := 'EV Exec: your driver is on the way. Ref '||new.ref||'.';
        v_reminder_type := 'en_route';
        v_html := evexec_notification_email(
          'Driver on the way', '#e6effb', '#1e4a8a',
          'Hi ' || evexec_esc(v_first) || ', your driver is now on the way to your pickup point.',
          v_rows || jsonb_build_array(
            jsonb_build_object('label', 'Driver',  'value', v_drv_name),
            jsonb_build_object('label', 'Vehicle', 'value', v_drv_vehicle)),
          v_foot);
      elsif new.status='Arrived' and old.status='En Route' then
        v_msg := 'EV Exec: your driver has arrived at the pickup point. Ref '||new.ref||'.';
        v_reminder_type := 'arrived';
        v_html := evexec_notification_email(
          'Driver arrived', '#dcfce7', '#166534',
          'Hi ' || evexec_esc(v_first) || ', your driver has arrived at your pickup point and is ready when you are.',
          v_rows || jsonb_build_array(
            jsonb_build_object('label', 'Driver',  'value', v_drv_name),
            jsonb_build_object('label', 'Vehicle', 'value', v_drv_vehicle)),
          v_foot);
      elsif new.status='Cancelled' and old.status<>'Completed'
            and not (new.operator_response = 'rejected'
                     and old.operator_response is distinct from new.operator_response) then
        v_msg := 'EV Exec: your booking '||new.ref||' has been cancelled. Please contact us if this is unexpected.';
        v_reminder_type := 'cancelled';
        v_html := evexec_notification_email(
          'Booking cancelled', '#fee2e2', '#991b1b',
          'Hi ' || evexec_esc(v_first) || ', your booking has been cancelled. If this is unexpected, please get in touch.',
          v_rows, v_foot);
      else v_msg := null; end if;

      if v_msg is not null and v_ch is not null then
        if v_ch='email' then
          insert into notification_queue (id,booking_id,type,channel,recipient,subject,body,html,status,attempts,next_attempt_at,created_at)
          values (gen_random_uuid(),new.id,'status_update','email',v_email,'Update on your EV Exec transfer (Ref '||new.ref||')',v_msg,v_html,'pending',0,now(),now());
        elsif v_reminder_type in ('en_route', 'arrived') then
          -- No handoff: the driver app opens a pre-filled customer SMS on the
          -- En Route / Arrived swipe itself (2026-10-03).
          null;
        else
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
