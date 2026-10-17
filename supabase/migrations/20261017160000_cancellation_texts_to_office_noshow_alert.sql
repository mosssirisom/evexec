-- Audit fixes (17/10/2026), applied to the live functions as text patches so
-- nothing else in them changes. Each block fails loudly if its patch no
-- longer matches.
--
-- 1. Cancellation text for a customer with no email: always to the office
--    (operator_sms_tasks, Today -> Texts to send). It went to the assigned
--    driver's driver_sms_reminders as 'cancelled', which the Driver App has
--    no screen for, so it was never sent. The office task rows also get the
--    booking's tenant explicitly (they relied on the column default).
-- 2. A driver marking a no-show (status Cancelled + "[No Show]" in
--    driver_notes) no longer sends that driver a "Job cancelled, do not
--    travel" alert.

do $patch$
declare v_old text; v_new text;
begin
  v_old := pg_get_functiondef('public.enqueue_operator_customer_notifications'::regproc);
  v_new := replace(v_old,
$a$        else
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
        end if;$a$,
$b$        else
          -- No email: the office sends the cancellation text (Today -> Texts to send).
          insert into public.operator_sms_tasks
            (tenant_id, booking_id, kind, customer_name, customer_phone, message, status)
          values
            (new.tenant_id, new.id, 'cancellation', v_name, v_phone, v_msg, 'pending')
          on conflict (booking_id, kind) do nothing;
        end if;$b$);
  if v_new = v_old then raise exception 'cancellation patch did not apply'; end if;

  v_old := v_new;
  v_new := replace(v_old,
$a$          insert into public.operator_sms_tasks (booking_id, kind, customer_name, customer_phone, message, status)
          values (new.id, 'confirmation', v_name, v_phone, v_conf, 'pending')$a$,
$b$          insert into public.operator_sms_tasks (tenant_id, booking_id, kind, customer_name, customer_phone, message, status)
          values (new.tenant_id, new.id, 'confirmation', v_name, v_phone, v_conf, 'pending')$b$);
  if v_new = v_old then raise exception 'confirmation patch did not apply'; end if;
  execute v_new;

  v_old := pg_get_functiondef('public.notify_driver_job_update'::regproc);
  v_new := replace(v_old,
$a$  IF NOT (is_cancelled OR detail_changed) THEN RETURN new; END IF;$a$,
$b$  -- The driver's own no-show: they know, so no "job cancelled" alert.
  IF is_cancelled AND coalesce(new.driver_notes, '') LIKE '%[No Show]%'
     AND coalesce(old.driver_notes, '') NOT LIKE '%[No Show]%' THEN
    RETURN new;
  END IF;

  IF NOT (is_cancelled OR detail_changed) THEN RETURN new; END IF;$b$);
  if v_new = v_old then raise exception 'no-show patch did not apply'; end if;
  execute v_new;
end
$patch$;
