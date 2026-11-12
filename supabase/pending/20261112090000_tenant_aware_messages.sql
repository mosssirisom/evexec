-- Messages built inside the database name the booking's own business.
--
-- DRAFT (12/11/2026): not applied to live. Found by a second-business test run
-- on live inside a rolled-back transaction: a business other than EV Exec got
-- "EV Exec: Hi ..." customer texts, "EV Exec NEW JOB / REMINDER" driver text and
-- an EV Exec email footer, because three functions carried EV Exec's name,
-- number and address in their text.
--
-- What changes
--   * public.tenant_brand(tenant)            the business's name, phone, email, web
--                                            address, tagline and licence from its
--                                            tenants row ('' for anything not set;
--                                            never another business's). Server-only.
--   * public.tenant_notification_email(tenant, ...)  the email shell for that business.
--   * public.evexec_notification_email(...)  now a thin wrapper for the default
--                                            business (EV Exec), so existing callers
--                                            keep working.
--   * enqueue_operator_customer_notifications and enqueue_driver_notifications
--                                            use the booking's own business.
--
-- For EV Exec the customer and driver texts and the email subjects read exactly as
-- before. The email shell footer now matches the apps' canonical footer (tagline,
-- website address, licence); the old "PREMIUM AIRPORT TRANSFERS" sub-heading is
-- gone. Those stored emails are re-rendered by the website at send time anyway.
-- No DROP statements: new functions plus CREATE OR REPLACE of existing ones.

-- ─── 1. A business's own details ────────────────────────────────────────────

create or replace function public.tenant_brand(p_tenant uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  with t as (
    select t.name, t.contact_email, t.contact_phone, t.brand
    from public.tenants t
    where t.id = coalesce(p_tenant, '00000000-0000-0000-0000-000000000001'::uuid)
  ),
  p as (
    select t.*,
           regexp_replace(coalesce(t.contact_phone, ''), '[\s()-]', '', 'g') as digits
    from t
  ),
  n as (
    select p.*,
           case when p.digits like '+44%'  then '0' || substr(p.digits, 4)
                when p.digits like '0044%' then '0' || substr(p.digits, 5)
                else p.digits end as national
    from p
  )
  select jsonb_build_object(
    'name',     btrim(coalesce(n.name, '')),
    'wordmark', upper(btrim(coalesce(n.name, ''))),
    'phone',    case when n.national ~ '^07[0-9]{9}$' then substr(n.national, 1, 5) || ' ' || substr(n.national, 6)
                     else btrim(coalesce(n.contact_phone, '')) end,
    'email',    btrim(coalesce(n.contact_email, '')),
    'domain',   case when coalesce(n.brand->>'site_url', '') ~* '^https?://'
                     then regexp_replace(regexp_replace(btrim(n.brand->>'site_url'), '^https?://', '', 'i'), '/+$', '')
                     else '' end,
    'tagline',  btrim(coalesce(n.brand->>'tagline', '')),
    'licence',  btrim(coalesce(n.brand->>'licence', ''))
  )
  from n
  union all
  select jsonb_build_object('name','','wordmark','','phone','','email','','domain','','tagline','','licence','')
  where not exists (select 1 from t)
  limit 1
$fn$;
revoke all on function public.tenant_brand(uuid) from public, anon, authenticated;
grant execute on function public.tenant_brand(uuid) to service_role;

-- ─── 2. The email shell for a business ──────────────────────────────────────

create or replace function public.tenant_notification_email(
  p_tenant uuid, p_pill text, p_pill_bg text, p_pill_fg text, p_lead text, p_rows jsonb, p_footnote text)
returns text
language sql
stable
set search_path to 'public', 'pg_temp'
as $fn$
  select
     '<!doctype html><html lang="en"><head>'
  || '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
  || '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">'
  || '<style>:root{color-scheme:light;supported-color-schemes:light}</style></head>'
  || '<body style="margin:0;background:#E9EBF2;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#0f1b33">'
  || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#E9EBF2" style="background:#E9EBF2"><tr><td align="center">'
  || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e5ee">'
  || '<tr><td bgcolor="#0B132B" style="background:#0B132B;padding:22px 28px">'
  ||   '<div style="color:#d7a23f;font-size:20px;font-weight:800;letter-spacing:.22em">' || evexec_esc(b.v->>'wordmark') || '</div>'
  || '</td></tr>'
  || '<tr><td bgcolor="#C9A550" style="background:#C9A550;height:4px;line-height:4px;font-size:0">&nbsp;</td></tr>'
  || '<tr><td bgcolor="#ffffff" style="background:#ffffff;padding:26px 28px">'
  ||   '<span style="display:inline-block;background:' || p_pill_bg || ';color:' || p_pill_fg || ';border-radius:999px;padding:6px 14px;font-size:12px;font-weight:700">' || p_pill || '</span>'
  ||   '<p style="margin:18px 0 16px;font-size:15px;line-height:1.6;color:#0f1b33">' || p_lead || '</p>'
  ||   '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin:0">'
  ||   coalesce((
         select string_agg(
                  '<tr><td style="padding:9px 0;color:#64748b;width:118px;border-bottom:1px solid #eef0f3;font-size:12px;text-transform:uppercase;letter-spacing:.04em;vertical-align:top">'
                  || evexec_esc(e->>'label')
                  || '</td><td style="padding:9px 0;font-weight:700;color:#0f1b33;border-bottom:1px solid #eef0f3;font-size:14px;vertical-align:top">'
                  || evexec_esc(e->>'value') || '</td></tr>',
                  '' order by ord)
         from jsonb_array_elements(p_rows) with ordinality as t(e, ord)
         where nullif(btrim(e->>'value'),'') is not null
       ),'')
  ||   '</table>'
  ||   case when nullif(btrim(coalesce(p_footnote,'')),'') is not null
            then '<p style="margin:18px 0 0;font-size:14px;line-height:1.6;color:#475569">' || p_footnote || '</p>'
            else '' end
  || '</td></tr>'
  || '<tr><td bgcolor="#0B132B" style="background:#0B132B;padding:14px 28px;color:#9aa3b2;font-size:11px">'
  ||   evexec_esc(concat_ws(' · ', nullif(b.v->>'name',''), nullif(b.v->>'tagline',''), nullif(b.v->>'phone',''), nullif(b.v->>'email',''), nullif(b.v->>'domain','')))
  ||   case when nullif(b.v->>'licence','') is not null then '<br>Private hire operator licence ' || evexec_esc(b.v->>'licence') else '' end
  ||   '</td></tr>'
  || '</table></td></tr></table></body></html>'
  from (select public.tenant_brand(p_tenant) as v) b
$fn$;
revoke all on function public.tenant_notification_email(uuid, text, text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.tenant_notification_email(uuid, text, text, text, text, jsonb, text) to service_role;

-- The old name keeps working for the default business (EV Exec).
create or replace function public.evexec_notification_email(p_pill text, p_pill_bg text, p_pill_fg text, p_lead text, p_rows jsonb, p_footnote text)
returns text
language sql
stable
set search_path to 'public', 'pg_temp'
as $fn$
  select public.tenant_notification_email('00000000-0000-0000-0000-000000000001'::uuid, p_pill, p_pill_bg, p_pill_fg, p_lead, p_rows, p_footnote)
$fn$;

-- ─── 3. Customer and driver messages use the booking's business ─────────────

CREATE OR REPLACE FUNCTION public.enqueue_operator_customer_notifications()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  -- This business's own name and number (never another business's).
  v_b       jsonb := public.tenant_brand(new.tenant_id);
  v_biz     text  := nullif(v_b->>'name', '');
  v_bn      text  := coalesce(v_biz || ' ', '');
  v_pre     text  := coalesce(v_biz || ': ', '');
  v_foot    text  := case when nullif(v_b->>'phone', '') is not null
                          then 'Questions? Call or WhatsApp ' || (v_b->>'phone') || '.' end;
begin
  if v_phone is null and v_email is null then return new; end if;

  v_ch := case when v_email is not null then 'email'
               when v_phone is not null then 'sms'
               else null end;

  v_timetxt := coalesce(
    to_char(new.pickup_time at time zone 'Europe/London', 'DD/MM/YYYY HH24:MI'),
    nullif(btrim(coalesce(to_char(new.travel_date, 'DD/MM/YYYY'), '')
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
    if v_is_operator and v_ch is not null
       and coalesce(new.notes, '') !~* '^Return leg created automatically' then
      v_conf := v_pre || 'Hi ' || v_name || ', your airport transfer' || coalesce(' (' || v_timetxt || ')','') || ' is booked. Ref ' || new.ref || '.';

      if not exists (select 1 from notification_queue q where q.booking_id=new.id and q.type='received')
         and not exists (select 1 from notification_log   l where l.booking_id=new.id and l.type='received')
         and not exists (select 1 from operator_sms_tasks  t where t.booking_id=new.id and t.kind='confirmation') then
        if v_ch='email' then
          v_html := tenant_notification_email(new.tenant_id, 
            'Booking confirmed', '#fbf3e0', '#8a6516',
            'Hi ' || evexec_esc(v_first) || ', your airport transfer is booked. We look forward to seeing you.',
            v_rows, v_foot);
          insert into notification_queue (id,booking_id,type,channel,recipient,subject,body,html,status,attempts,next_attempt_at,created_at)
          values (gen_random_uuid(),new.id,'received','email',v_email,'Your '||v_bn||'airport transfer is booked (Ref '||new.ref||')',v_conf,v_html,'pending',0,now(),now());
        else
          insert into public.operator_sms_tasks (tenant_id, booking_id, kind, customer_name, customer_phone, message, status)
          values (new.tenant_id, new.id, 'confirmation', v_name, v_phone, v_conf, 'pending')
          on conflict (booking_id, kind) do nothing;
        end if;
      end if;
    end if;

  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      if new.status='En Route' and old.status='Dispatched' then
        v_msg := v_pre||'your driver is on the way. Ref '||new.ref||'.';
        v_reminder_type := 'en_route';
        v_html := tenant_notification_email(new.tenant_id, 
          'Driver on the way', '#e6effb', '#1e4a8a',
          'Hi ' || evexec_esc(v_first) || ', your driver is now on the way to your pickup point.',
          v_rows || jsonb_build_array(
            jsonb_build_object('label', 'Driver',  'value', v_drv_name),
            jsonb_build_object('label', 'Vehicle', 'value', v_drv_vehicle)),
          v_foot);
      elsif new.status='Arrived' and old.status='En Route' then
        v_msg := v_pre||'your driver has arrived at the pickup point. Ref '||new.ref||'.';
        v_reminder_type := 'arrived';
        v_html := tenant_notification_email(new.tenant_id, 
          'Driver arrived', '#dcfce7', '#166534',
          'Hi ' || evexec_esc(v_first) || ', your driver has arrived at your pickup point and is ready when you are.',
          v_rows || jsonb_build_array(
            jsonb_build_object('label', 'Driver',  'value', v_drv_name),
            jsonb_build_object('label', 'Vehicle', 'value', v_drv_vehicle)),
          v_foot);
      elsif new.status='Cancelled' and old.status<>'Completed'
            and not (new.operator_response = 'rejected'
                     and old.operator_response is distinct from new.operator_response) then
        v_msg := v_pre||'your booking '||new.ref||' has been cancelled. Please contact us if this is unexpected.';
        v_reminder_type := 'cancelled';
        v_html := tenant_notification_email(new.tenant_id, 
          'Booking cancelled', '#fee2e2', '#991b1b',
          'Hi ' || evexec_esc(v_first) || ', your booking has been cancelled. If this is unexpected, please get in touch.',
          v_rows, v_foot);
      else v_msg := null; end if;

      if v_msg is not null and v_ch is not null then
        if v_ch='email' then
          insert into notification_queue (id,booking_id,type,channel,recipient,subject,body,html,status,attempts,next_attempt_at,created_at)
          values (gen_random_uuid(),new.id,'status_update','email',v_email,'Update on your '||v_bn||'transfer (Ref '||new.ref||')',v_msg,v_html,'pending',0,now(),now());
        elsif v_reminder_type in ('en_route', 'arrived') then
          null;
        else
          -- No email: the office sends the cancellation text (Today -> Texts to send).
          insert into public.operator_sms_tasks
            (tenant_id, booking_id, kind, customer_name, customer_phone, message, status)
          values
            (new.tenant_id, new.id, 'cancellation', v_name, v_phone, v_msg, 'pending')
          on conflict (booking_id, kind) do nothing;
        end if;
      end if;
    end if;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.enqueue_driver_notifications()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_new_driver uuid := coalesce(new.assigned_driver_id, new.driver_id);
  v_old_driver uuid := case when tg_op='UPDATE' then coalesce(old.assigned_driver_id, old.driver_id) else null end;
  v_driver_changed boolean := (tg_op='INSERT' and v_new_driver is not null) or (tg_op='UPDATE' and v_new_driver is distinct from v_old_driver);
  v_pay_changed boolean := (tg_op='UPDATE' and new.payment_status is distinct from old.payment_status);
  v_phone text; v_email text; v_route text; v_routed text;
  v_time5   text := substring(coalesce(new.travel_time,'') from 1 for 5);
  v_ukdate  text := case when new.travel_date is not null then to_char(new.travel_date,'DD/MM/YYYY') else null end;
  v_timetxt text := nullif(btrim(coalesce(v_time5,'') || ' ' || coalesce(v_ukdate,'')), '');
  v_sched   timestamptz := coalesce(
              new.pickup_time,
              case when new.travel_date is not null and new.travel_time ~ '^[0-2]?[0-9]:[0-5][0-9](:[0-5][0-9])?$'
                   then (new.travel_date::text || ' ' || new.travel_time)::timestamp at time zone 'Europe/London'
                   else null end);
  v_cust text := coalesce(nullif(trim(new.customer_name),''),'Customer');
  v_custphone text := nullif(trim(new.customer_phone),'');
  v_status text := lower(coalesce(new.payment_status,''));
  v_fare text; v_farev text; v_alloc text; v_remind text;
  v_drows jsonb; v_alloc_html text; v_remind_html text;
  v_bn text := coalesce(nullif(public.tenant_brand(new.tenant_id)->>'name', '') || ' ', '');
begin
  if tg_op='UPDATE' and v_new_driver is distinct from v_old_driver then
    delete from notification_queue where booking_id=new.id and type='driver_reminder_24h' and status='pending';
  end if;
  if v_new_driver is null then return new; end if;
  if not v_driver_changed and not v_pay_changed then return new; end if;

  select nullif(trim(phone),''), nullif(trim(email),'') into v_phone, v_email from drivers where id=v_new_driver;
  if v_email is null then return new; end if;

  v_route := case
    when nullif(new.pickup_location,'') is not null and nullif(new.dropoff_address,'') is not null
      then new.pickup_location || ' -> ' || new.dropoff_address
    when new.direction='Destination → Airport'
      then coalesce(nullif(new.dropoff_address,''),nullif(new.pickup_location,''),'Pickup') || ' -> ' || coalesce(nullif(new.airport,''),'Airport')
    else coalesce(nullif(new.airport,''),'Airport') || ' -> ' || coalesce(nullif(new.dropoff_address,''),nullif(new.pickup_location,''),'Destination')
  end;
  v_routed := replace(v_route, ' -> ', ' → ');

  if v_status='paid' then v_fare := ' Fare: PAID in advance, nothing to collect.'; v_farev := 'Paid in advance, nothing to collect';
  elsif v_status='invoiced' then v_fare := ' Fare: invoiced to account, do not collect.'; v_farev := 'Invoiced to account, do not collect';
  elsif new.quoted_price is not null then v_fare := ' Fare to collect GBP ' || trim(to_char(new.quoted_price,'FM999990.00')) || '.'; v_farev := '£' || trim(to_char(new.quoted_price,'FM999990.00')) || ' to collect';
  else v_fare := ' Fare: TBC.'; v_farev := 'TBC'; end if;

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

  v_remind := v_bn || 'REMINDER: Job ' || new.ref || ' tomorrow at ' || coalesce(nullif(v_time5,''),'the booked time') || ': ' || v_route
    || '. Customer ' || v_cust || coalesce(' ' || v_custphone,'') || coalesce('. Flight ' || nullif(new.flight_number,''),'')
    || coalesce('. Pax ' || new.passengers::text,'') || coalesce('. Bags ' || nullif(new.luggage,''),'') || '.' || v_fare;
  v_remind_html := tenant_notification_email(new.tenant_id, 
    'Reminder: job tomorrow', '#e6effb', '#1e4a8a',
    'This is a reminder for your job tomorrow at ' || coalesce(nullif(v_time5,''),'the booked time') || '.',
    v_drows, 'Please be ready in good time. Drive safely.');

  if v_driver_changed then
    v_alloc := v_bn || 'NEW JOB ' || new.ref || ': ' || v_route || coalesce(' on ' || v_timetxt,'')
      || '. Customer ' || v_cust || coalesce(' ' || v_custphone,'') || coalesce('. Flight ' || nullif(new.flight_number,''),'')
      || coalesce('. Pax ' || new.passengers::text,'') || coalesce('. Bags ' || nullif(new.luggage,''),'') || '.';
    v_alloc_html := tenant_notification_email(new.tenant_id, 
      'New job', '#fbf3e0', '#8a6516',
      'A new job has been assigned to you.',
      v_drows, 'Please be ready in good time. Drive safely.');

    insert into notification_queue (id,booking_id,type,channel,recipient,subject,body,html,status,attempts,next_attempt_at,created_at)
    select gen_random_uuid(),new.id,'driver_allocated','email',v_email,'New job '||new.ref||': '||v_routed,v_alloc,v_alloc_html,'pending',0,now(),now()
    where not exists (select 1 from notification_queue q where q.booking_id=new.id and q.type='driver_allocated' and q.status='pending');

    if v_sched is not null and v_sched - interval '24 hours' > now() then
      insert into notification_queue (id,booking_id,type,channel,recipient,subject,body,html,status,attempts,next_attempt_at,created_at)
      values (gen_random_uuid(),new.id,'driver_reminder_24h','email',v_email,'Reminder: job '||new.ref||' tomorrow',v_remind,v_remind_html,'pending',0,v_sched - interval '24 hours',now());
    end if;

  elsif v_pay_changed then
    update notification_queue set body=v_remind, html=case when channel='email' then v_remind_html else html end
     where booking_id=new.id and type='driver_reminder_24h' and status='pending';
  end if;

  return new;
end;
$function$;
