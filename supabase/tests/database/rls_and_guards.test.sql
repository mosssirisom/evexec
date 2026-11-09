-- Row-level security and guard-trigger tests for the shared EV Exec database
-- (website, Operator app, Driver App).
--
-- What it locks in: who can read and change bookings, drivers and the other
-- staff tables, per role (not signed in, customer, driver, office staff) and
-- per operator business (tenant). Written against the live behaviour on
-- 09/11/2026; every assertion outside a TODO block passed there.
--
-- Everything runs in one transaction that is rolled back: it creates its own
-- two test businesses and never reads or changes real rows.
--
-- TODO blocks are known gaps with an agreed fix. They are expected to fail
-- today and will report "TODO passed" once fixed; then move them out of the
-- TODO block.
--
-- Do not complete a priced booking in here: that draws an invoice number
-- from invoice_seq, and a rollback does not give it back.

begin;

create extension if not exists pgtap with schema extensions;

select * from no_plan();

-- ─── Fixtures ────────────────────────────────────────────────────────────────
-- t1 / t2: two operator businesses.  a1 / b1: office staff of each.
-- c1 / c2: customers.  d1, d2: drivers of t1.  d3: driver of t2.

insert into public.tenants (id, slug, name) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'rls-test-one', 'RLS Test One'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'rls-test-two', 'RLS Test Two');

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('aaaaaaaa-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'staff.one@rls-test.invalid', '{}', '{}', now(), now()),
  ('aaaaaaaa-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'staff.two@rls-test.invalid', '{}', '{}', now(), now()),
  ('aaaaaaaa-0000-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'customer.one@rls-test.invalid', '{}', '{}', now(), now()),
  ('aaaaaaaa-0000-4000-8000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'customer.two@rls-test.invalid', '{}', '{}', now(), now());

insert into public.tenant_users (user_id, tenant_id, role) values
  ('aaaaaaaa-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-000000000001', 'operator_admin'),
  ('aaaaaaaa-0000-4000-8000-0000000000b1', 'aaaaaaaa-0000-4000-8000-000000000002', 'dispatcher');

insert into public.drivers (id, tenant_id, name, full_name, email) values
  ('aaaaaaaa-0000-4000-8000-0000000000d1', 'aaaaaaaa-0000-4000-8000-000000000001', 'Driver One',   'Driver One',   'driver.one@rls-test.invalid'),
  ('aaaaaaaa-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-000000000001', 'Driver Two',   'Driver Two',   'driver.two@rls-test.invalid'),
  ('aaaaaaaa-0000-4000-8000-0000000000d3', 'aaaaaaaa-0000-4000-8000-000000000002', 'Driver Three', 'Driver Three', 'driver.three@rls-test.invalid');

-- b1: t1, driver d1, Dispatched, priced, unpaid   (the driver's working job)
-- b2: t1, driver d2, Dispatched                   (another driver's job)
-- b3: t1, no driver, Unassigned, customer c1's
-- b4: t2, driver d3, Dispatched                   (the other business)
-- b5: t1, no driver, pending                      (open request)
-- b6: t1, driver d1, Completed, no price
-- b7: t1, driver d1, Arrived                      (for the no-show case)
insert into public.bookings
  (id, tenant_id, ref, customer_name, customer_phone, travel_date, travel_time, status, payment_status, quoted_price, assigned_driver_id, user_id)
values
  ('aaaaaaaa-0000-4000-8000-00000000b001', 'aaaaaaaa-0000-4000-8000-000000000001', 'EVX-RLSTEST1', 'Test One',   '07000000001', '2099-01-01', '10:00', 'Dispatched', 'Unpaid', 90,   'aaaaaaaa-0000-4000-8000-0000000000d1', null),
  ('aaaaaaaa-0000-4000-8000-00000000b002', 'aaaaaaaa-0000-4000-8000-000000000001', 'EVX-RLSTEST2', 'Test Two',   '07000000002', '2099-01-02', '10:00', 'Dispatched', 'Unpaid', 90,   'aaaaaaaa-0000-4000-8000-0000000000d2', null),
  ('aaaaaaaa-0000-4000-8000-00000000b003', 'aaaaaaaa-0000-4000-8000-000000000001', 'EVX-RLSTEST3', 'Test Three', '07000000003', '2099-01-03', '10:00', 'Unassigned', 'Unpaid', 90,   null, 'aaaaaaaa-0000-4000-8000-0000000000c1'),
  ('aaaaaaaa-0000-4000-8000-00000000b004', 'aaaaaaaa-0000-4000-8000-000000000002', 'EVX-RLSTEST4', 'Test Four',  '07000000004', '2099-01-04', '10:00', 'Dispatched', 'Unpaid', 90,   'aaaaaaaa-0000-4000-8000-0000000000d3', null),
  ('aaaaaaaa-0000-4000-8000-00000000b005', 'aaaaaaaa-0000-4000-8000-000000000001', 'EVX-RLSTEST5', 'Test Five',  '07000000005', '2099-01-05', '10:00', 'pending',    'Unpaid', 90,   null, null),
  ('aaaaaaaa-0000-4000-8000-00000000b006', 'aaaaaaaa-0000-4000-8000-000000000001', 'EVX-RLSTEST6', 'Test Six',   '07000000006', '2099-01-06', '10:00', 'Completed',  'Unpaid', null, 'aaaaaaaa-0000-4000-8000-0000000000d1', null),
  ('aaaaaaaa-0000-4000-8000-00000000b007', 'aaaaaaaa-0000-4000-8000-000000000001', 'EVX-RLSTEST7', 'Test Seven', '07000000007', '2099-01-07', '10:00', 'Arrived',    'Unpaid', null, 'aaaaaaaa-0000-4000-8000-0000000000d1', null);

-- ─── 1. Structure ────────────────────────────────────────────────────────────

select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity $$,
  'every table in public has row-level security switched on'
);

select set_eq(
  $$ select tablename || '.' || policyname from pg_policies
     where schemaname = 'public' and 'anon' = any (roles) $$,
  $$ values ('contact_messages.anon_insert_contact_messages'),
            ('quote_requests.anon_insert'),
            ('reviews.public_read_reviews') $$,
  'the only policies written for visitors who are not signed in are the contact form, the quote form and reading reviews'
);

select has_trigger('public', 'bookings', 'zz_guard_driver_booking_update', 'bookings has the driver guard trigger');
select has_trigger('public', 'bookings', 'booking_status_transition',      'bookings has the status transition trigger');
select has_trigger('public', 'drivers',  'zz_guard_driver_record_update',  'drivers has the driver record guard trigger');

select todo_start('Audit item 1: revoke TRUNCATE, REFERENCES and TRIGGER from anon and authenticated');
select is_empty(
  $$ select table_name || ' ' || grantee || ' ' || privilege_type from information_schema.role_table_grants
     where table_schema = 'public' and grantee in ('anon', 'authenticated')
       and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER') $$,
  'app roles hold no TRUNCATE, REFERENCES or TRIGGER rights on public tables'
);
select todo_end();

-- ─── 2. Not signed in ────────────────────────────────────────────────────────

set local role anon;
set local "request.jwt.claims" to '{"role":"anon"}';

select is((select count(*)::int from public.bookings),     0, 'not signed in: sees no bookings');
select is((select count(*)::int from public.drivers),      0, 'not signed in: sees no drivers');
select is((select count(*)::int from public.missed_calls), 0, 'not signed in: sees no missed calls');
select is((select count(*)::int from public.audit_log),    0, 'not signed in: sees no audit log');
select is((select count(*)::int from public.error_log),    0, 'not signed in: sees no error log');
select is((select count(*)::int from public.invoices),     0, 'not signed in: sees no invoices');
select is((select count(*)::int from public.tenants),      0, 'not signed in: sees no operator businesses');
select is((select count(*)::int from public.tenant_users), 0, 'not signed in: sees no staff roles');

select throws_ok(
  $$ insert into public.bookings (tenant_id, ref, customer_name, customer_phone, travel_date, travel_time, status, payment_status)
     values ('aaaaaaaa-0000-4000-8000-000000000001', 'EVX-RLSANON', 'Anon', '07000000000', '2099-02-01', '10:00', 'pending', 'Unpaid') $$,
  '42501', null,
  'not signed in: cannot insert a booking directly (the website goes through its own server)'
);

update public.bookings set quoted_price = 1 where id = 'aaaaaaaa-0000-4000-8000-00000000b001';
update public.drivers  set rating = 1       where id = 'aaaaaaaa-0000-4000-8000-0000000000d1';

reset role;

select is((select quoted_price from public.bookings where id = 'aaaaaaaa-0000-4000-8000-00000000b001'), 90::numeric, 'not signed in: an update to a booking changes nothing');
select is((select rating from public.drivers where id = 'aaaaaaaa-0000-4000-8000-0000000000d1') is distinct from 1, true, 'not signed in: an update to a driver changes nothing');

-- ─── 3. Office staff, business one ───────────────────────────────────────────

set local "request.jwt.claims" to '{"sub":"aaaaaaaa-0000-4000-8000-0000000000a1","role":"authenticated","email":"staff.one@rls-test.invalid"}';
set local role authenticated;

select is(
  (select count(*)::int from public.bookings where ref like 'EVX-RLSTEST%'), 6,
  'staff: see all six bookings of their own business'
);
select is(
  (select count(*)::int from public.bookings where tenant_id = 'aaaaaaaa-0000-4000-8000-000000000002'), 0,
  'staff: see no bookings of another business'
);
select is(
  (select count(*)::int from public.drivers where email like '%@rls-test.invalid'), 2,
  'staff: see only their own business''s drivers'
);
select is(
  (select count(*)::int from public.tenants where slug like 'rls-test-%'), 1,
  'staff: see only their own business record'
);
select is(
  (select count(*)::int from public.tenant_users), 1,
  'staff: see only their own role row'
);

select lives_ok(
  $$ update public.bookings set quoted_price = 95 where id = 'aaaaaaaa-0000-4000-8000-00000000b003' $$,
  'staff: can change the price of their own business''s booking'
);
select lives_ok(
  $$ update public.bookings set payment_status = 'Paid', payment_method = 'Cash' where id = 'aaaaaaaa-0000-4000-8000-00000000b002' $$,
  'staff: can record a payment'
);
select lives_ok(
  $$ update public.drivers set rating = 4.5 where id = 'aaaaaaaa-0000-4000-8000-0000000000d1' $$,
  'staff: can edit their own business''s driver record'
);
select throws_ok(
  $$ insert into public.bookings (tenant_id, ref, customer_name, customer_phone, travel_date, travel_time, status, payment_status)
     values ('aaaaaaaa-0000-4000-8000-000000000002', 'EVX-RLSCROSS', 'Cross', '07000000000', '2099-02-02', '10:00', 'Unassigned', 'Unpaid') $$,
  '42501', null,
  'staff: cannot create a booking inside another business'
);
select throws_ok(
  $$ update public.bookings set tenant_id = 'aaaaaaaa-0000-4000-8000-000000000002' where id = 'aaaaaaaa-0000-4000-8000-00000000b003' $$,
  '42501', null,
  'staff: cannot move a booking into another business'
);
select throws_ok(
  $$ update public.bookings set status = 'Cancelled' where id = 'aaaaaaaa-0000-4000-8000-00000000b006' $$,
  'P0001', null,
  'staff: a Completed booking cannot be cancelled'
);
select throws_ok(
  $$ update public.bookings set status = 'Completed' where id = 'aaaaaaaa-0000-4000-8000-00000000b003' $$,
  'P0001', null,
  'staff: an Unassigned booking cannot jump straight to Completed'
);

update public.bookings set quoted_price = 1 where id = 'aaaaaaaa-0000-4000-8000-00000000b004';
update public.drivers  set rating = 1       where id = 'aaaaaaaa-0000-4000-8000-0000000000d3';

reset role;

select is((select quoted_price from public.bookings where id = 'aaaaaaaa-0000-4000-8000-00000000b003'), 95::numeric, 'staff: the price change was saved');
select is((select payment_status from public.bookings where id = 'aaaaaaaa-0000-4000-8000-00000000b002'), 'Paid', 'staff: the payment was saved');
select is((select quoted_price from public.bookings where id = 'aaaaaaaa-0000-4000-8000-00000000b004'), 90::numeric, 'staff: an update to another business''s booking changes nothing');
select is((select rating from public.drivers where id = 'aaaaaaaa-0000-4000-8000-0000000000d3') is distinct from 1, true, 'staff: an update to another business''s driver changes nothing');

-- ─── 4. Office staff, business two ───────────────────────────────────────────

set local "request.jwt.claims" to '{"sub":"aaaaaaaa-0000-4000-8000-0000000000b1","role":"authenticated","email":"staff.two@rls-test.invalid"}';
set local role authenticated;

select is(
  (select array_agg(ref order by ref) from public.bookings where ref like 'EVX-RLSTEST%'), array['EVX-RLSTEST4'],
  'staff of business two: see only their own booking'
);
select is(
  (select array_agg(name order by name) from public.drivers where email like '%@rls-test.invalid'), array['Driver Three'],
  'staff of business two: see only their own driver'
);

reset role;

-- ─── 5. Customer ─────────────────────────────────────────────────────────────

set local "request.jwt.claims" to '{"sub":"aaaaaaaa-0000-4000-8000-0000000000c1","role":"authenticated","email":"customer.one@rls-test.invalid"}';
set local role authenticated;

select is(
  (select array_agg(ref order by ref) from public.bookings), array['EVX-RLSTEST3'],
  'customer: sees only their own booking'
);
select is((select count(*)::int from public.drivers), 0, 'customer: sees no drivers');
select is((select count(*)::int from public.tenants), 0, 'customer: sees no operator businesses');

update public.bookings set quoted_price = 1, status = 'Cancelled' where id = 'aaaaaaaa-0000-4000-8000-00000000b003';

reset role;

select is((select quoted_price from public.bookings where id = 'aaaaaaaa-0000-4000-8000-00000000b003'), 95::numeric, 'customer: cannot change the price of their own booking');
select is((select status from public.bookings where id = 'aaaaaaaa-0000-4000-8000-00000000b003'), 'Unassigned', 'customer: cannot change the status of their own booking directly');

set local "request.jwt.claims" to '{"sub":"aaaaaaaa-0000-4000-8000-0000000000c2","role":"authenticated","email":"customer.two@rls-test.invalid"}';
set local role authenticated;

select is((select count(*)::int from public.bookings), 0, 'another customer: sees no bookings');

reset role;

-- ─── 6. Driver: bookings ─────────────────────────────────────────────────────

set local "request.jwt.claims" to '{"sub":"aaaaaaaa-0000-4000-8000-0000000000d1","role":"authenticated","email":"driver.one@rls-test.invalid"}';
set local role authenticated;

select is(
  (select array_agg(ref order by ref) from public.bookings where assigned_driver_id is not null),
  array['EVX-RLSTEST1', 'EVX-RLSTEST6', 'EVX-RLSTEST7'],
  'driver: of the assigned jobs, sees only their own'
);
select is(
  (select count(*)::int from public.bookings where id = 'aaaaaaaa-0000-4000-8000-00000000b003'), 0,
  'driver: does not see an Unassigned booking'
);
select is(
  (select array_agg(name) from public.drivers), array['Driver One'],
  'driver: sees only their own driver record'
);

select todo_start('Decision 09/11/2026: drivers see only their own assigned jobs');
select is(
  (select count(*)::int from public.bookings where id = 'aaaaaaaa-0000-4000-8000-00000000b005'), 0,
  'driver: does not see an open request with no driver (customer name and phone)'
);
select todo_end();

select lives_ok(
  $$ update public.bookings set status = 'En Route', tracking_started_at = now(), driver_notes = 'On my way'
     where id = 'aaaaaaaa-0000-4000-8000-00000000b001' $$,
  'driver: can move their own job to En Route and add a note'
);
select throws_ok(
  $$ update public.bookings set quoted_price = 500 where id = 'aaaaaaaa-0000-4000-8000-00000000b001' $$,
  '42501', null, 'driver: cannot change the price'
);
select throws_ok(
  $$ update public.bookings set customer_phone = '07999999999' where id = 'aaaaaaaa-0000-4000-8000-00000000b001' $$,
  '42501', null, 'driver: cannot change the customer''s phone number'
);
select throws_ok(
  $$ update public.bookings set pickup_location = 'Somewhere else' where id = 'aaaaaaaa-0000-4000-8000-00000000b001' $$,
  '42501', null, 'driver: cannot change the pickup'
);
-- driver_id is the source of truth for who has the job. A change to
-- assigned_driver_id alone is put back by the sync trigger without an error;
-- a change to driver_id is refused. Either way the job stays where it was
-- (checked again after "reset role" below).
select throws_ok(
  $$ update public.bookings set driver_id = 'aaaaaaaa-0000-4000-8000-0000000000d2' where id = 'aaaaaaaa-0000-4000-8000-00000000b001' $$,
  '42501', null, 'driver: cannot hand their job to another driver'
);
select throws_ok(
  $$ update public.bookings set driver_id = null, assigned_driver_id = null where id = 'aaaaaaaa-0000-4000-8000-00000000b001' $$,
  '42501', null, 'driver: cannot unassign themselves from a job'
);
update public.bookings set assigned_driver_id = 'aaaaaaaa-0000-4000-8000-0000000000d2' where id = 'aaaaaaaa-0000-4000-8000-00000000b001';
select throws_ok(
  $$ update public.bookings set tenant_id = 'aaaaaaaa-0000-4000-8000-000000000002' where id = 'aaaaaaaa-0000-4000-8000-00000000b001' $$,
  '42501', null, 'driver: cannot move a booking into another business'
);
select throws_ok(
  $$ update public.bookings set status = 'Dispatched' where id = 'aaaaaaaa-0000-4000-8000-00000000b001' $$,
  '42501', null, 'driver: cannot set an office status (Dispatched)'
);
select throws_ok(
  $$ update public.bookings set status = 'Completed' where id = 'aaaaaaaa-0000-4000-8000-00000000b001' $$,
  'P0001', null, 'driver: cannot skip from En Route straight to Completed'
);

-- Payment is the office's. The guard puts payment_status back without an
-- error, so the Driver App must not report "paid" from this write.
select lives_ok(
  $$ update public.bookings set payment_status = 'Paid', payment_method = 'Card' where id = 'aaaaaaaa-0000-4000-8000-00000000b001' $$,
  'driver: a payment write does not raise an error'
);

update public.bookings set driver_notes = 'not mine' where id = 'aaaaaaaa-0000-4000-8000-00000000b002';

select todo_start('Audit item 4: a driver records a no-show as the No Show status');
select lives_ok(
  $$ update public.bookings set status = 'No Show' where id = 'aaaaaaaa-0000-4000-8000-00000000b007' $$,
  'driver: can mark an Arrived job as No Show'
);
select todo_end();

reset role;

select is((select status from public.bookings where id = 'aaaaaaaa-0000-4000-8000-00000000b001'), 'En Route', 'driver: the status change was saved');
select is((select payment_status from public.bookings where id = 'aaaaaaaa-0000-4000-8000-00000000b001'), 'Unpaid', 'driver: payment_status stays as the office left it');
select is((select payment_method from public.bookings where id = 'aaaaaaaa-0000-4000-8000-00000000b001'), 'Card', 'driver: the payment method is recorded while the booking is unpaid');
select is((select quoted_price from public.bookings where id = 'aaaaaaaa-0000-4000-8000-00000000b001'), 90::numeric, 'driver: the price is unchanged');
select is(
  (select assigned_driver_id::text || ' ' || driver_id::text from public.bookings where id = 'aaaaaaaa-0000-4000-8000-00000000b001'),
  'aaaaaaaa-0000-4000-8000-0000000000d1 aaaaaaaa-0000-4000-8000-0000000000d1',
  'driver: the job is still assigned to the same driver'
);
select is((select driver_notes from public.bookings where id = 'aaaaaaaa-0000-4000-8000-00000000b002'), null, 'driver: an update to another driver''s job changes nothing');

-- ─── 7. Driver: own record ───────────────────────────────────────────────────

set local "request.jwt.claims" to '{"sub":"aaaaaaaa-0000-4000-8000-0000000000d1","role":"authenticated","email":"driver.one@rls-test.invalid"}';
set local role authenticated;

select lives_ok(
  $$ update public.drivers set current_lat = 53.8, current_lng = -3.05, location_updated_at = now(), is_online = true
     where id = 'aaaaaaaa-0000-4000-8000-0000000000d1' $$,
  'driver: can post their location and go online'
);
select throws_ok(
  $$ update public.drivers set rating = 5 where id = 'aaaaaaaa-0000-4000-8000-0000000000d1' $$,
  '42501', null, 'driver: cannot change their own rating'
);
select throws_ok(
  $$ update public.drivers set tenant_id = 'aaaaaaaa-0000-4000-8000-000000000002' where id = 'aaaaaaaa-0000-4000-8000-0000000000d1' $$,
  '42501', null, 'driver: cannot move themselves to another business'
);
select throws_ok(
  $$ update public.drivers set kind = 'partner' where id = 'aaaaaaaa-0000-4000-8000-0000000000d1' $$,
  '42501', null, 'driver: cannot change their driver type'
);
select throws_ok(
  $$ update public.drivers set pcol_expiry = '2099-12-31' where id = 'aaaaaaaa-0000-4000-8000-0000000000d1' $$,
  '42501', null, 'driver: cannot change their own licence expiry date'
);

update public.drivers set current_lat = 1 where id = 'aaaaaaaa-0000-4000-8000-0000000000d2';

reset role;

select is((select is_online from public.drivers where id = 'aaaaaaaa-0000-4000-8000-0000000000d1'), true, 'driver: the location update was saved');
select is((select rating from public.drivers where id = 'aaaaaaaa-0000-4000-8000-0000000000d1'), 4.5::numeric, 'driver: the rating is as the office set it');
select is((select current_lat from public.drivers where id = 'aaaaaaaa-0000-4000-8000-0000000000d2'), null, 'driver: an update to another driver''s record changes nothing');

select * from finish();
rollback;
