-- Office alert when a driver records a no-show (applied live 10/11/2026, 20:00 UTC).
--
-- Fires when a booking's status becomes 'No Show', or becomes 'Cancelled' with
-- the "[No Show]" driver note (what a Driver App tab from before the 10/11/2026
-- deploy still sends). Posts to the Operator app's /api/push/dispatch with the
-- notification override, the same way the new-booking and payment alerts do.
-- The customer is sent nothing (owner decision, 10/11/2026).
--
-- Rollback: disable the trigger
--   alter table public.bookings disable trigger trg_operator_no_show_push;

create function public.notify_operator_no_show()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_secret text;
  v_driver text;
  v_when   text;
  v_where  text;
begin
  if not (
    (new.status = 'No Show' and old.status is distinct from 'No Show')
    or (new.status = 'Cancelled' and old.status is distinct from 'Cancelled'
        and coalesce(new.driver_notes, '') like '%[No Show]%')
  ) then
    return new;
  end if;

  begin
    select webhook_secret into v_secret from public.push_config where id = true;
    if v_secret is null then
      return new;
    end if;

    select coalesce(nullif(d.full_name, ''), d.name) into v_driver
      from public.drivers d where d.id = new.assigned_driver_id;

    v_when  := concat_ws(' ', left(new.travel_time, 5), to_char(new.travel_date, 'DD/MM/YYYY'));
    v_where := coalesce(nullif(new.pickup_location, ''), new.airport);

    perform net.http_post(
      url := 'https://evexecoperator.vercel.app/api/push/dispatch',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
      body := jsonb_build_object('notification', jsonb_build_object(
        'title', 'No-show: ' || coalesce(new.customer_name, 'customer'),
        'body',  concat_ws(' · ', v_where, nullif(v_when, ''), 'Driver ' || v_driver, 'Ref ' || new.ref),
        'url',   '/operator/bookings?q=' || new.ref,
        'tag',   'noshow-' || new.ref
      ))
    );
  exception when others then
    null; -- An alert must never stop the driver recording the no-show.
  end;

  return new;
end;
$fn$;

revoke all on function public.notify_operator_no_show() from public, anon, authenticated;

create trigger trg_operator_no_show_push
  after update of status on public.bookings
  for each row execute function public.notify_operator_no_show();
