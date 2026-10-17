-- Operator-made return bookings: one confirmation, not one per leg.
--
-- The Operator app now stores a return booking the way the website does: the
-- outbound booking carries the whole fare and the return details, and the
-- return leg is a £0 job whose notes start "Return leg created automatically".
-- enqueue_operator_customer_notifications() sent a 'received' confirmation for
-- every operator-sourced INSERT, so the customer got a second "is booked"
-- email (or two-tap text) for the return leg. The outbound confirmation already
-- lists both journeys and the one price, so the return leg is skipped.
--
-- Patches the live function body in place (one condition), so nothing else in
-- it changes. Idempotent; fails loudly if the expected text is not found.
do $$
declare
  d   text := pg_get_functiondef('public.enqueue_operator_customer_notifications'::regproc);
  v_old text := 'if v_is_operator and v_ch is not null then';
  v_new text := 'if v_is_operator and v_ch is not null'
              || E'\n       and coalesce(new.notes, '''') !~* ''^Return leg created automatically'' then';
begin
  if position('Return leg created automatically' in d) > 0 then
    return; -- already applied
  end if;
  if (length(d) - length(replace(d, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'enqueue_operator_customer_notifications: expected condition not found exactly once';
  end if;
  execute replace(d, v_old, v_new);
end $$;
