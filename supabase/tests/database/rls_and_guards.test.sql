-- Row-level security and guard-trigger tests for the shared EV Exec database
-- (website, Operator app, Driver App).
--
-- What it locks in: who can read and change bookings, drivers and the other
-- staff tables, per role (not signed in, customer, driver, office staff) and
-- per operator business (tenant). Last run against the live project on
-- 10/11/2026, after hardening stage 1: every assertion outside a TODO block
-- passed.
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
  ('aaaaaaaa-0000-4000-8000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'customer.two@rls-test.invalid', '{}', '{}', now(), now()),
  -- e1: a login that only shares driver two's email address (driver two has no login of their own, like a partner)
  ('aaaaaaaa-0000-4000-8000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'driver.two@rls-test.invalid', '{}', '{}', now(), now()),
  -- f1: platform super admin
  ('aaaaaaaa-0000-4000-8000-0000000000f1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'super@rls-test.invalid', '{}', '{}', now(), now());

insert into public.tenant_users (user_id, tenant_id, role) values
  ('aaaaaaaa-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-000000000001', 'operator_admin'),
  ('aaaaaaaa-0000-4000-8000-0000000000b1', 'aaaaaaaa-0000-4000-8000-000000000002', 'dispatcher'),
  ('aaaaaaaa-0000-4000-8000-0000000000f1', null, 'super_admin');

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
-- b8: t2, driver d1 (of t1!), Dispatched          (assigned across businesses by mistake)
-- b9: t1, driver d1, Dispatched                   (a second job that has not started)
insert into public.bookings
  (id, tenant_id, ref, customer_name, customer_phone, travel_date, travel_time, status, payment_status, quoted_price, assigned_driver_id, user_id)
values
  ('aaaaaaaa-0000-4000-8000-00000000b001', 'aaaaaaaa-0000-4000-8000-000000000001', 'EVX-RLSTEST1', 'Test One',   '07000000001', '2099-01-01', '10:00', 'Dispatched', 'Unpaid', 90,   'aaaaaaaa-0000-4000-8000-0000000000d1', null),
  ('aaaaaaaa-0000-4000-8000-00000000b002', 'aaaaaaaa-0000-4000-8000-000000000001', 'EVX-RLSTEST2', 'Test Two',   '07000000002', '2099-01-02', '10:00', 'Dispatched', 'Unpaid', 90,   'aaaaaaaa-0000-4000-8000-0000000000d2', null),
  ('aaaaaaaa-0000-4000-8000-00000000b003', 'aaaaaaaa-0000-4000-8000-000000000001', 'EVX-RLSTEST3', 'Test Three', '07000000003', '2099-01-03', '10:00', 'Unassigned', 'Unpaid', 90,   null, 'aaaaaaaa-0000-4000-8000-0000000000c1'),
  ('aaaaaaaa-0000-4000-8000-00000000b004', 'aaaaaaaa-0000-4000-8000-000000000002', 'EVX-RLSTEST4', 'Test Four',  '07000000004', '2099-01-04', '10:00', 'Dispatched', 'Unpaid', 90,   'aaaaaaaa-0000-4000-8000-0000000000d3', null),
  ('aaaaaaaa-0000-4000-8000-00000000b005', 'aaaaaaaa-0000-4000-8000-000000000001', 'EVX-RLSTEST5', 'Test Five',  '07000000005', '2099-01-05', '10:00', 'pending',    'Unpaid', 90,   null, null),
  ('aaaaaaaa-0000-4000-8000-00000000b006', 'aaaaaaaa-0000-4000-8000-000000000001', 'EVX-RLSTEST6', 'Test Six',   '07000000006', '2099-01-06', '10:00', 'Completed',  'Unpaid', null, 'aaaaaaaa-0000-4000-8000-0000000000d1', null),
  ('aaaaaaaa-0000-4000-8000-00000000b007', 'aaaaaaaa-0000-4000-8000-000000000001', 'EVX-RLSTEST7', 'Test Seven', '07000000007', '2099-01-07', '10:00', 'Arrived',    'Unpaid', null, 'aaaaaaaa-0000-4000-8000-0000000000d1', null),
  ('aaaaaaaa-0000-4000-8000-00000000b008', 'aaaaaaaa-0000-4000-8000-000000000002', 'EVX-RLSTEST8', 'Test Eight', '07000000008', '2099-01-08', '10:00', 'Dispatched', 'Unpaid', null, 'aaaaaaaa-0000-4000-8000-0000000000d1', null),
  ('aaaaaaaa-0000-4000-8000-00000000b009', 'aaaaaaaa-0000-4000-8000-000000000001', 'EVX-RLSTEST9', 'Test Nine',  '07000000009', '2099-01-09', '10:00', 'Dispatched', 'Unpaid', null, 'aaaaaaaa-0000-4000-8000-0000000000d1', null);

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

-- Permissions the apps rely on. These must keep passing after any revoke.
select is_empty(
  $$ select t || ' ' || p
     from unnest(array['bookings','drivers','invoices','quote_requests','contact_messages','missed_calls',
                       'operator_sms_tasks','driver_sms_reminders','driver_unavailable_dates','booking_photos',
                       'booking_expenses','push_subscriptions']) t,
          unnest(array['SELECT','INSERT','UPDATE','DELETE']) p
     where not has_table_privilege('authenticated', 'public.' || t, p) $$,
  'signed-in users keep read and write rights on the tables the apps use (row-level security decides which rows)'
);
select ok(has_table_privilege('authenticated', 'public.error_log', 'INSERT'), 'signed-in users can still write to the error log');
select ok(has_table_privilege('authenticated', 'public.notification_queue_dashboard', 'SELECT')
      and has_table_privilege('authenticated', 'public.notification_log_dashboard', 'SELECT'), 'signed-in users can still read the two notification status views');
select ok(has_sequence_privilege('authenticated', 'public.invoice_seq', 'USAGE'), 'signed-in users can still draw an invoice number (staff create invoices)');
select ok(has_function_privilege('anon', 'public.get_push_dispatch_bundle(text)', 'EXECUTE'), 'the Operator app push sender can still call get_push_dispatch_bundle without a login (it is gated by its secret)');
select is_empty(
  $$ select c.relname || ' ' || p
     from pg_class c join pg_namespace n on n.oid = c.relnamespace,
          unnest(array['SELECT','INSERT','UPDATE','DELETE']) p
     where n.nspname = 'public' and c.relkind = 'r' and not has_table_privilege('service_role', c.oid, p) $$,
  'the service role keeps full read and write rights on every table'
);
select ok((select rolbypassrls from pg_roles where rolname = 'service_role'), 'the service role still bypasses row-level security');

-- Stage 1, applied 10/11/2026 (migration 20261110064237).
select is_empty(
  $$ select table_name || ' ' || grantee || ' ' || privilege_type from information_schema.role_table_grants
     where table_schema = 'public' and grantee in ('anon', 'authenticated')
       and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER') $$,
  'app roles hold no TRUNCATE, REFERENCES or TRIGGER rights on public tables'
);
select is_empty(
  $$ select pg_get_userbyid(a.grantee) || ' ' || a.privilege_type
     from pg_default_acl d, aclexplode(d.defaclacl) a
     where d.defaclnamespace = 'public'::regnamespace and d.defaclobjtype = 'r'
       and pg_get_userbyid(d.defaclrole) = 'postgres'
       and pg_get_userbyid(a.grantee) in ('anon', 'authenticated')
       and a.privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER') $$,
  'new tables created by postgres do not hand TRUNCATE, REFERENCES or TRIGGER to app roles'
);

select todo_start('Stage 2 (proposed): sequence rights only where needed');
select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'S'
       and (has_sequence_privilege('anon', c.oid, 'USAGE')
            or (c.relname <> 'invoice_seq' and has_sequence_privilege('authenticated', c.oid, 'USAGE'))) $$,
  'visitors hold no sequence rights; signed-in users only on invoice_seq'
);
select todo_end();

select todo_start('Stage 3 (proposed, needs app check first): visitors hold only the table rights their three policies use');
select is_empty(
  $$ select c.relname || ' ' || p
     from pg_class c join pg_namespace n on n.oid = c.relnamespace,
          unnest(array['SELECT','INSERT','UPDATE','DELETE']) p
     where n.nspname = 'public' and c.relkind in ('r','v') and has_table_privilege('anon', c.oid, p)
       and (c.relname, p) not in (('contact_messages','INSERT'), ('quote_requests','INSERT'), ('reviews','SELECT')) $$,
  'visitors who are not signed in hold no table rights beyond the contact form, the quote form and reading reviews'
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
  (select count(*)::int from public.bookings where ref like 'EVX-RLSTEST%'), 7,
  'staff: see all seven bookings of their own business'
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
  (select array_agg(ref order by ref) from public.bookings where ref like 'EVX-RLSTEST%'), array['EVX-RLSTEST4', 'EVX-RLSTEST8'],
  'staff of business two: see only their own bookings'
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
  (select array_agg(ref order by ref) from public.bookings
   where assigned_driver_id is not null and tenant_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  array['EVX-RLSTEST1', 'EVX-RLSTEST6', 'EVX-RLSTEST7', 'EVX-RLSTEST9'],
  'driver: of the assigned jobs in their business, sees only their own'
);
select is(
  (select count(*)::int from public.bookings where id = 'aaaaaaaa-0000-4000-8000-00000000b004'), 0,
  'driver: does not see another business''s job'
);
select is(
  (select count(*)::int from public.bookings where id = 'aaaaaaaa-0000-4000-8000-00000000b003'), 0,
  'driver: does not see an Unassigned booking'
);
select is(
  (select array_agg(name) from public.drivers), array['Driver One'],
  'driver: sees only their own driver record'
);

-- Stage 1, applied 10/11/2026: own assigned jobs only, same business only.
select is(
  (select count(*)::int from public.bookings where id = 'aaaaaaaa-0000-4000-8000-00000000b005'), 0,
  'driver: does not see an open request with no driver (customer name and phone)'
);
select is(
  (select count(*)::int from public.bookings where id = 'aaaaaaaa-0000-4000-8000-00000000b008'), 0,
  'driver: does not see a job in another business, even if it was assigned to them there by mistake'
);

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

-- The rest of a normal job: arrive, passenger on board. (Not completed here:
-- completing a priced booking draws an invoice number.)
select lives_ok(
  $$ update public.bookings set status = 'Arrived', arrived_at = now() where id = 'aaaaaaaa-0000-4000-8000-00000000b001' $$,
  'driver: can mark their own job Arrived'
);
select lives_ok(
  $$ update public.bookings set status = 'Passenger On Board', passenger_onboard_at = now() where id = 'aaaaaaaa-0000-4000-8000-00000000b001' $$,
  'driver: can mark the passenger on board'
);
select lives_ok(
  $$ update public.bookings set driver_confirmed_at = now(), attestation_status = 'confirmed' where id = 'aaaaaaaa-0000-4000-8000-00000000b009' $$,
  'driver: can confirm an upcoming job'
);
select lives_ok(
  $$ insert into public.driver_sms_reminders (tenant_id, booking_id, driver_id, reminder_type, customer_phone, message, status)
     values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000b001', 'aaaaaaaa-0000-4000-8000-0000000000d1', '24hr', '07000000001', 'Reminder', 'sent') $$,
  'driver: can record a customer reminder for their own job'
);
select throws_ok(
  $$ insert into public.driver_sms_reminders (tenant_id, booking_id, driver_id, reminder_type, customer_phone, message, status)
     values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000b002', 'aaaaaaaa-0000-4000-8000-0000000000d1', '24hr', '07000000002', 'Reminder', 'sent') $$,
  '42501', null, 'driver: cannot record a reminder against another driver''s job'
);

update public.bookings set driver_notes = 'not mine' where id = 'aaaaaaaa-0000-4000-8000-00000000b002';

select todo_start('Proposed, needs a decision: a driver cannot cancel a job that has not started');
select throws_ok(
  $$ update public.bookings set status = 'Cancelled' where id = 'aaaaaaaa-0000-4000-8000-00000000b009' $$,
  '42501', null, 'driver: cannot cancel a Dispatched job (cancelling tells the customer)'
);
select todo_end();

select todo_start('Audit item 4: a driver records a no-show as the No Show status');
select lives_ok(
  $$ update public.bookings set status = 'No Show' where id = 'aaaaaaaa-0000-4000-8000-00000000b007' $$,
  'driver: can mark an Arrived job as No Show'
);
select todo_end();

reset role;

select is((select status from public.bookings where id = 'aaaaaaaa-0000-4000-8000-00000000b001'), 'Passenger On Board', 'driver: the status changes were saved');
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

-- ─── 8. A login that only shares a driver's email address ───────────────────
-- Driver two has no login (like a partner). Some policies also match drivers
-- by email, so a separate account with the same address is treated as them.

set local "request.jwt.claims" to '{"sub":"aaaaaaaa-0000-4000-8000-0000000000e1","role":"authenticated","email":"driver.two@rls-test.invalid"}';
set local role authenticated;
select is((select count(*)::int from public.bookings), 0, 'same-email login: sees no jobs');
select todo_start('Stage 2 (proposed): drivers are matched by login id only, never by email');
select is((select count(*)::int from public.drivers),  0, 'same-email login: sees no driver record');
select todo_end();
reset role;

-- ─── 9. Platform super admin ─────────────────────────────────────────────────

set local "request.jwt.claims" to '{"sub":"aaaaaaaa-0000-4000-8000-0000000000f1","role":"authenticated","email":"super@rls-test.invalid"}';
set local role authenticated;

select is((select count(*)::int from public.bookings where ref like 'EVX-RLSTEST%'), 9, 'super admin: sees the bookings of every business');
select is((select count(*)::int from public.drivers where email like '%@rls-test.invalid'), 3, 'super admin: sees the drivers of every business');
select is((select count(*)::int from public.tenants where slug like 'rls-test-%'), 2, 'super admin: sees every business record');

reset role;

-- ─── 10. Service role (the servers) ──────────────────────────────────────────

set local "request.jwt.claims" to '{"role":"service_role"}';
set local role service_role;

select is((select count(*)::int from public.bookings where ref like 'EVX-RLSTEST%'), 9, 'service role: reads the bookings of every business');
select lives_ok(
  $$ update public.bookings set payment_status = 'Paid', payment_method = 'Card', quoted_price = 120 where id = 'aaaaaaaa-0000-4000-8000-00000000b004' $$,
  'service role: can record a payment and change a price (the website payment flow)'
);
select lives_ok($$ select count(*) from public.notification_queue $$,    'service role: can read the notification queue');
select lives_ok($$ select count(*) from public.push_config $$,           'service role: can read the push settings');
select lives_ok($$ select count(*) from public.stripe_webhook_events $$, 'service role: can read the payment event log');

reset role;

select is((select payment_status from public.bookings where id = 'aaaaaaaa-0000-4000-8000-00000000b004'), 'Paid', 'service role: the payment was saved (the driver guard does not apply to servers)');

select * from finish();
rollback;
