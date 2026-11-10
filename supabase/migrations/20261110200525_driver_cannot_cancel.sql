-- Last step of the driver cancel rule: a driver-only login can no longer set
-- Cancelled at all. A no-show is recorded as No Show (Driver App, live since
-- 10/11/2026), and only from En Route or Arrived. Cancelling is the office's.
--
-- Applied live 10/11/2026 as migration 20261110200525.
-- Done as exact text replacements on the live function, each checked to match
-- once, so nothing else in the guard changes.
--
-- Rollback: put 'Cancelled' back into driver_statuses and change
-- "new.status = 'No Show'" back to "new.status in ('Cancelled', 'No Show')".

do $mig$
declare
  src text := pg_get_functiondef('private.guard_driver_booking_update()'::regprocedure);
  a1 constant text := $t$'En Route', 'Arrived', 'Passenger On Board', 'Completed', 'Cancelled', 'No Show'$t$;
  b1 constant text := $t$'En Route', 'Arrived', 'Passenger On Board', 'Completed', 'No Show'$t$;
  a2 constant text := $t$  if new.status is distinct from old.status and not (new.status = any(driver_statuses)) then$t$;
  b2 constant text := $t$  if new.status is distinct from old.status and new.status = 'Cancelled' then
    raise exception 'Drivers can''t cancel a job. Record a no-show at the pickup, or ask the office to cancel it.'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status and not (new.status = any(driver_statuses)) then$t$;
  a3 constant text := $t$new.status in ('Cancelled', 'No Show')$t$;
  b3 constant text := $t$new.status = 'No Show'$t$;
  a4 constant text := $t$-- A driver may end a job only at the pickup stage (a no-show). Cancelling a
  -- job that has not started, or one with the passenger on board, is the office's.$t$;
  b4 constant text := $t$-- A driver may end a job only at the pickup stage, and only as a no-show.
  -- Cancelling a job is always the office's.$t$;
begin
  if (length(src) - length(replace(src, a1, ''))) / length(a1) <> 1
     or (length(src) - length(replace(src, a2, ''))) / length(a2) <> 1
     or (length(src) - length(replace(src, a3, ''))) / length(a3) <> 1
     or (length(src) - length(replace(src, a4, ''))) / length(a4) <> 1 then
    raise exception 'guard_driver_booking_update is not in the expected form; nothing changed';
  end if;
  src := replace(replace(replace(replace(src, a1, b1), a2, b2), a3, b3), a4, b4);
  execute src;
end
$mig$;
