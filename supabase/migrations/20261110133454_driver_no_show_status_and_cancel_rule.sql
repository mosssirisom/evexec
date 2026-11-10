-- Approved and applied 10/11/2026. Same statement as applied to live: exact text
-- replacements on the live function definitions (three of the functions involved
-- come from live migrations that are in no repo, so their full text is not here).
-- Each replacement fails loudly if the expected text is not found.
do $mig$
declare d text; a text;
  missing constant text := 'expected text not found the expected number of times in ';
begin
  -- 1. Status transitions: No Show is reachable from En Route or Arrived, and the
  --    office can reopen a no-show (to Unassigned), as it can a cancellation.
  d := pg_get_functiondef('public.enforce_booking_status_transition()'::regprocedure);
  a := $q$ARRAY['Arrived', 'Passenger On Board', 'Cancelled', 'Dispatched']$q$;
  if (length(d) - length(replace(d, a, ''))) / length(a) <> 1 then raise exception '% transition (en route)', missing; end if;
  d := replace(d, a, $q$ARRAY['Arrived', 'Passenger On Board', 'Cancelled', 'Dispatched', 'No Show']$q$);
  a := $q$ARRAY['Passenger On Board', 'Cancelled', 'En Route']$q$;
  if (length(d) - length(replace(d, a, ''))) / length(a) <> 1 then raise exception '% transition (arrived)', missing; end if;
  d := replace(d, a, $q$ARRAY['Passenger On Board', 'Cancelled', 'En Route', 'No Show']$q$);
  a := $q$      RAISE EXCEPTION 'Booking % is already a No Show and cannot be changed.', NEW.id;$q$;
  if (length(d) - length(replace(d, a, ''))) / length(a) <> 1 then raise exception '% transition (no show)', missing; end if;
  d := replace(d, a, $q$      IF NEW.status = 'Unassigned' THEN RETURN NEW; END IF;
      RAISE EXCEPTION 'Booking % is already a No Show and cannot be changed.', NEW.id;$q$);
  execute d;

  -- 2. Driver guard: a driver may end a job (Cancelled or No Show) only from
  --    En Route or Arrived.
  d := pg_get_functiondef('private.guard_driver_booking_update()'::regprocedure);
  a := E'\n\n  return new;\nend;';
  if (length(d) - length(replace(d, a, ''))) / length(a) <> 1 then raise exception '% guard', missing; end if;
  d := replace(d, a, $q$

  -- A driver may end a job only at the pickup stage (a no-show). Cancelling a
  -- job that has not started, or one with the passenger on board, is the office's.
  if new.status is distinct from old.status and new.status in ('Cancelled', 'No Show')
     and old.status not in ('En Route', 'en_route', 'Arrived', 'arrived') then
    raise exception 'Drivers can only record a no-show after setting off or arriving. Ask the office to cancel this job.'
      using errcode = '42501';
  end if;

  return new;
end;$q$);
  execute d;

  -- 3. A no-show does not hold the driver's slot in the double-booking check.
  d := pg_get_functiondef('public.prevent_driver_double_booking()'::regprocedure);
  a := $q$('Completed', 'Cancelled')$q$;
  if (length(d) - length(replace(d, a, ''))) / length(a) <> 2 then raise exception '% double booking', missing; end if;
  d := replace(d, a, $q$('Completed', 'Cancelled', 'No Show')$q$);
  execute d;
end $mig$;
