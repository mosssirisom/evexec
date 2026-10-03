-- Remove em dashes from the driver new-job / reminder emails written by
-- enqueue_driver_notifications() (house style, 2026-10-03). Wording only;
-- logic unchanged. Applied to production as a text replace on the live
-- function definition.
do $do$
declare d text := pg_get_functiondef('public.enqueue_driver_notifications'::regproc);
begin
  d := replace(d, '''Paid in advance — nothing to collect''', '''Paid in advance, nothing to collect''');
  d := replace(d, ''' Fare: PAID in advance — nothing to collect.''', ''' Fare: PAID in advance, nothing to collect.''');
  d := replace(d, ''' Fare: invoiced to account — do not collect.''', ''' Fare: invoiced to account, do not collect.''');
  d := replace(d, '''Invoiced to account — do not collect''', '''Invoiced to account, do not collect''');
  d := replace(d, '''EV Exec REMINDER — Job ''', '''EV Exec REMINDER: Job ''');
  d := replace(d, '''Reminder — job tomorrow''', '''Reminder: job tomorrow''');
  d := replace(d, '''New job ''||new.ref||'' — ''||v_routed', '''New job ''||new.ref||'': ''||v_routed');
  if position('—' in d) > 0 then raise exception 'em dash still present'; end if;
  execute d;
end $do$;
