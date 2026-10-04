-- House date style (user decision, 2026-10-04): every EV Exec date is
-- DD/MM/YYYY and every time 24-hour HH:MM.
-- The only database functions that printed dates used 'DD Mon YYYY'; they are
-- re-created from their own live definitions with just that pattern swapped,
-- so nothing else in them changes.
do $$
declare f regprocedure;
begin
  foreach f in array array[
    'public.enqueue_operator_customer_notifications()'::regprocedure,
    'private.award_journey_points(uuid)'::regprocedure
  ] loop
    execute replace(pg_get_functiondef(f), 'DD Mon YYYY', 'DD/MM/YYYY');
  end loop;
end $$;

-- Existing points history notes, rebuilt in the same style.
update public.points_transactions t
   set note = concat_ws(' · ', b.ref, coalesce(b.airport, b.journey_type), to_char(b.travel_date, 'DD/MM/YYYY'))
  from public.bookings b
 where b.id = t.booking_id and t.type = 'journey_completed';
