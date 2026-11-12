-- Per-business booking-reference prefix (draft migration
-- supabase/pending/20261112150000_booking_ref_prefix.sql, parts A and B).
-- Rolls back; creates its own fixtures.

begin;

create extension if not exists pgtap with schema extensions;

select * from no_plan();

select is((select ref_prefix from public.tenants where id = '00000000-0000-0000-0000-000000000001'), 'EVX', 'EV Exec keeps the EVX prefix');
select is((select ref_prefix from public.provision_tenant('coastal-cars', 'Coastal Cars')), 'COAS', 'a new business gets a prefix from its short name');
select is((select ref_prefix from public.provision_tenant('a1-2b', 'Digits')), 'AB', 'digits and hyphens are left out of the prefix');
select is((select ref_prefix from public.provision_tenant('7-7', 'No Letters')), 'BKG', 'a short name with fewer than two letters falls back to BKG');

select throws_ok($$update public.tenants set ref_prefix = 'x' where slug = 'coastal-cars'$$, '23514', null, 'a prefix must be 2 to 5 capital letters');
select throws_ok($$update public.tenants set ref_prefix = 'TOOLONG' where slug = 'coastal-cars'$$, '23514', null, 'a prefix over 5 letters is refused');
select lives_ok($$update public.tenants set ref_prefix = 'CCAR' where slug = 'coastal-cars'$$, 'a valid prefix can be set');

create temp table t as select id from public.tenants where slug = 'coastal-cars';
select lives_ok(
  $$insert into public.bookings (ref, tenant_id, customer_name, customer_phone, travel_date, travel_time, status, payment_status, pickup_location, dropoff_address) select 'COAS-ABC123', id, 'Jo', '07000000001', current_date + 10, '09:00', 'Unassigned', 'Unpaid', '1 Test Street', 'Liverpool Airport' from t$$,
  'a booking with the business''s own prefix is accepted');
select lives_ok(
  $$insert into public.bookings (ref, tenant_id, customer_name, customer_phone, travel_date, travel_time, status, payment_status, pickup_location, dropoff_address) select 'EVX-ZZ9', id, 'Jo', '07000000001', current_date + 10, '09:00', 'Unassigned', 'Unpaid', '1 Test Street', 'Liverpool Airport' from t$$,
  'an EVX- reference is still accepted');
select throws_ok(
  $$insert into public.bookings (ref, tenant_id, customer_name, customer_phone, travel_date, travel_time, status, payment_status, pickup_location, dropoff_address) select 'bad ref', id, 'Jo', '07000000001', current_date + 10, '09:00', 'Unassigned', 'Unpaid', '1 Test Street', 'Liverpool Airport' from t$$,
  '23514', null, 'a malformed reference is still refused');
select throws_ok(
  $$insert into public.bookings (ref, tenant_id, customer_name, customer_phone, travel_date, travel_time, status, payment_status, pickup_location, dropoff_address) select 'X-1', id, 'Jo', '07000000001', current_date + 10, '09:00', 'Unassigned', 'Unpaid', '1 Test Street', 'Liverpool Airport' from t$$,
  '23514', null, 'a one-letter prefix is refused');

select * from finish();
rollback;
