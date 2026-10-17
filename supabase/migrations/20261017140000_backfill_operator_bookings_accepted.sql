-- Operator-made bookings are accepted from the start (the Operator app sets
-- operator_response = 'accepted' since 17/10/2026). Bookings it made before
-- that were stored with no response; mark them accepted so every booking
-- method records the same thing. Website requests are not touched.
--
-- Only operator_response / operator_responded_at change: no booking trigger
-- reacts to these columns (no email, push, driver notice or audit row).
-- operator_responded_at is set to the booking's own created_at, so these rows
-- can be told apart from live decisions.
update public.bookings
   set operator_response = 'accepted',
       operator_responded_at = created_at
 where source = 'operator'
   and operator_response is null;
