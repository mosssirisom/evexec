-- Driver job emails: one 24-hour reminder, correct "collect" instruction,
-- stops in the route.
--
-- Based on the live definition of public.enqueue_driver_notifications()
-- (2026-10-06). Everything else is unchanged.
--
-- 1. The trigger no longer queues its own 24-hour driver reminder. The
--    send-driver-reminders edge function already reminds the driver at
--    exactly 24 hours and 1 hour before pickup (push, with an email fallback
--    the website sends), so drivers were getting two 24-hour reminders. The
--    payment-change branch only existed to rewrite that queued reminder, so
--    it goes too: the trigger now acts only when the assigned driver changes.
--    Its still-pending rows are deleted below.
-- 2. The "Fare" line follows the real payment method + status. Before,
--    website cash-on-the-day bookings (stored as cash / Invoiced) told the
--    driver "Invoiced to account, do not collect", and an unpaid bank
--    transfer or payment link said "£X to collect".
-- 3. The route lists stops (the "Stop N: address" lines in notes) in travel
--    order between pickup and drop-off.

create or replace function public.enqueue_driver_notifications()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_new_driver uuid := coalesce(new.assigned_driver_id, new.driver_id);
  v_old_driver uuid := case when tg_op='UPDATE' then coalesce(old.assigned_driver_id, old.driver_id) else null end;
  v_driver_changed boolean := (tg_op='INSERT' and v_new_driver is not null) or (tg_op='UPDATE' and v_new_driver is distinct from v_old_driver);
  v_phone text; v_email text; v_route text; v_routed text; v_from text; v_to text; v_stops text;
  v_time5   text := substring(coalesce(new.travel_time,'') from 1 for 5);
  v_ukdate  text := case when new.travel_date is not null then to_char(new.travel_date,'DD/MM/YYYY') else null end;
  v_timetxt text := nullif(btrim(coalesce(v_time5,'') || ' ' || coalesce(v_ukdate,'')), '');
  v_cust text := coalesce(nullif(trim(new.customer_name),''),'Customer');
  v_custphone text := nullif(trim(new.customer_phone),'');
  v_status text := lower(coalesce(new.payment_status,''));
  v_method text := lower(btrim(coalesce(new.payment_method,'')));
  v_price text := case when new.quoted_price is not null and new.quoted_price > 0
                       then '£' || trim(to_char(new.quoted_price,'FM999990.00')) else null end;
  v_outbound_ref text := substring(coalesce(new.notes,'') from 'Outbound ref:\s*(\S+)');
  v_fare text; v_farev text; v_alloc text;
  v_drows jsonb; v_alloc_html text;
begin
  -- Legacy: clear any 24-hour reminder this trigger used to queue for the
  -- previous driver.
  if tg_op='UPDATE' and v_new_driver is distinct from v_old_driver then
    delete from notification_queue where booking_id=new.id and type='driver_reminder_24h' and status='pending'
      and next_attempt_at > created_at + interval '1 hour';
  end if;
  if v_new_driver is null or not v_driver_changed then return new; end if;

  select nullif(trim(phone),''), nullif(trim(email),'') into v_phone, v_email from drivers where id=v_new_driver;
  if v_email is null then return new; end if;

  -- Stored addresses first; the airport only fills a missing side (as before).
  if nullif(new.pickup_location,'') is not null and nullif(new.dropoff_address,'') is not null then
    v_from := new.pickup_location; v_to := new.dropoff_address;
  elsif new.direction='Destination → Airport' then
    v_from := coalesce(nullif(new.dropoff_address,''),nullif(new.pickup_location,''),'Pickup'); v_to := coalesce(nullif(new.airport,''),'Airport');
  else
    v_from := coalesce(nullif(new.airport,''),'Airport'); v_to := coalesce(nullif(new.dropoff_address,''),nullif(new.pickup_location,''),'Destination');
  end if;
  select string_agg(btrim(regexp_replace(btrim(x.line), '^Stop \d+:\s*', '', 'i')), ' -> ' order by x.n)
    into v_stops
    from regexp_split_to_table(coalesce(new.notes,''), E'\n') with ordinality as x(line, n)
   where btrim(x.line) ~* '^Stop \d+:\s*\S';
  v_route := concat_ws(' -> ', v_from, v_stops, v_to);
  v_routed := replace(v_route, ' -> ', ' → ');

  -- What the driver collects, from the real payment method + status.
  if coalesce(new.notes,'') ~* '^Return leg created automatically' then
    v_farev := 'Included with booking ' || coalesce(rtrim(v_outbound_ref, '.,'), 'outbound') || ', nothing to collect';
  elsif v_status = 'paid' then
    v_farev := 'Paid in advance, nothing to collect';
  elsif v_method = 'cash' then
    v_farev := coalesce(v_price || ' to collect in cash', 'Cash on the day, amount TBC');
  elsif v_method in ('bank transfer','bank_transfer') then
    v_farev := 'Bank transfer, do not collect';
  elsif v_method = 'payment link' then
    v_farev := 'Payment link sent to the customer, do not collect';
  elsif v_method = 'card' then
    v_farev := 'Card payment pending, do not collect';
  elsif v_status = 'invoiced' then
    v_farev := 'Invoiced to account, do not collect';
  else
    v_farev := 'Payment required, check with the operator' || coalesce(' (' || v_price || ')', '');
  end if;
  v_fare := ' Fare: ' || v_farev || '.';

  v_drows := jsonb_build_array(
    jsonb_build_object('label','Reference',  'value', new.ref),
    jsonb_build_object('label','When',       'value', v_timetxt),
    jsonb_build_object('label','Journey',    'value', v_routed),
    jsonb_build_object('label','Customer',   'value', v_cust || coalesce(' · ' || v_custphone,'')),
    jsonb_build_object('label','Flight',     'value', nullif(new.flight_number,'')),
    jsonb_build_object('label','Passengers', 'value', new.passengers::text),
    jsonb_build_object('label','Bags',       'value', nullif(new.luggage,'')),
    jsonb_build_object('label','Fare',       'value', v_farev)
  );

  v_alloc := 'EV Exec NEW JOB ' || new.ref || ': ' || v_route || coalesce(' on ' || v_timetxt,'')
    || '. Customer ' || v_cust || coalesce(' ' || v_custphone,'') || coalesce('. Flight ' || nullif(new.flight_number,''),'')
    || coalesce('. Pax ' || new.passengers::text,'') || coalesce('. Bags ' || nullif(new.luggage,''),'') || '.' || v_fare;
  v_alloc_html := evexec_notification_email(
    'New job', '#fbf3e0', '#8a6516',
    'A new job has been assigned to you.',
    v_drows, 'Please be ready in good time. Drive safely.');

  insert into notification_queue (id,booking_id,type,channel,recipient,subject,body,html,status,attempts,next_attempt_at,created_at)
  select gen_random_uuid(),new.id,'driver_allocated','email',v_email,'New job '||new.ref||': '||v_routed,v_alloc,v_alloc_html,'pending',0,now(),now()
  where not exists (select 1 from notification_queue q where q.booking_id=new.id and q.type='driver_allocated' and q.status='pending');

  return new;
end;
$function$;

-- The 24-hour reminders this trigger had already queued (scheduled ahead,
-- pre-written HTML). Reminders queued by send-driver-reminders are sent
-- straight away, so they are never caught by this.
delete from public.notification_queue
 where type = 'driver_reminder_24h' and status = 'pending'
   and html is not null and next_attempt_at > created_at + interval '1 hour';
