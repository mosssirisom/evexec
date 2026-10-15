-- Fix 3: drivers can change only what the Driver App needs.
-- d01 = driver with a login, assigned b1 (Dispatched, Unpaid).

-- ── Legitimate driver writes (what the Driver App does) ─────────────────────
select test.login('bbbbbbbb-0000-0000-0000-000000000d01', 'dr1@example.com');
select test.lives($$update public.bookings set status = 'En Route', tracking_started_at = now(), updated_at = now() where id = 'cccccccc-0000-0000-0000-0000000000b1'$$,
  'driver swipes to En Route');
select test.lives($$update public.bookings set status = 'Arrived', arrived_at = now() where id = 'cccccccc-0000-0000-0000-0000000000b1'$$,
  'driver swipes to Arrived');
select test.lives($$update public.bookings set driver_notes = 'Waiting at gate 3' where id = 'cccccccc-0000-0000-0000-0000000000b1'$$,
  'driver saves a note');
select test.lives($$update public.bookings set driver_confirmed_at = now(), attestation_status = 'confirmed' where id = 'cccccccc-0000-0000-0000-0000000000b1'$$,
  'driver confirms pickup');
select test.lives($$update public.drivers set current_lat = 53.8, current_lng = -3.0, location_updated_at = now() where id = 'bbbbbbbb-0000-0000-0000-000000000d01'$$,
  'driver app shares GPS position');

-- ── Unauthorised column changes on the driver's own job ─────────────────────
select test.throws($$update public.bookings set quoted_price = 1 where id = 'cccccccc-0000-0000-0000-0000000000b1'$$, 'driver cannot change the price');
select test.throws($$update public.bookings set payment_status = 'Paid' where id = 'cccccccc-0000-0000-0000-0000000000b1'$$, 'driver cannot mark a booking Paid');
select test.throws($$update public.bookings set tenant_id = '00000000-0000-0000-0000-000000000002' where id = 'cccccccc-0000-0000-0000-0000000000b1'$$, 'driver cannot move a booking to another business');
select test.throws($$update public.bookings set customer_phone = '07000000000' where id = 'cccccccc-0000-0000-0000-0000000000b1'$$, 'driver cannot change customer details');
select test.throws($$update public.bookings set operator_response = 'accepted' where id = 'cccccccc-0000-0000-0000-0000000000b1'$$, 'driver cannot accept/decline for the office');
select test.throws($$update public.bookings set status = 'Unassigned' where id = 'cccccccc-0000-0000-0000-0000000000b1'$$, 'driver cannot set an office-only status');

-- ── Reassignment and other drivers' jobs ────────────────────────────────────
select test.throws($$update public.bookings set assigned_driver_id = 'bbbbbbbb-0000-0000-0000-000000000d02', driver_id = 'bbbbbbbb-0000-0000-0000-000000000d02' where id = 'cccccccc-0000-0000-0000-0000000000b1'$$,
  'driver cannot hand a job to someone else');
update public.bookings set driver_notes = 'hijack' where id = 'cccccccc-0000-0000-0000-0000000000b2';
select test.as_owner();
select test.ok((select driver_notes is null from public.bookings where id = 'cccccccc-0000-0000-0000-0000000000b2'), 'driver cannot touch another driver''s job');

-- ── Driver record ───────────────────────────────────────────────────────────
select test.login('bbbbbbbb-0000-0000-0000-000000000d01', 'dr1@example.com');
select test.throws($$update public.drivers set tenant_id = '00000000-0000-0000-0000-000000000002' where id = 'bbbbbbbb-0000-0000-0000-000000000d01'$$, 'driver cannot change their business');
select test.throws($$update public.drivers set kind = 'partner' where id = 'bbbbbbbb-0000-0000-0000-000000000d01'$$, 'driver cannot change driver/partner type');
select test.throws($$update public.drivers set email = 'new@example.com' where id = 'bbbbbbbb-0000-0000-0000-000000000d01'$$, 'driver cannot change their login email on the record');
update public.drivers set current_lat = 1 where id = 'bbbbbbbb-0000-0000-0000-000000000d02';
select test.as_owner();
select test.ok((select current_lat is null from public.drivers where id = 'bbbbbbbb-0000-0000-0000-000000000d02'), 'driver cannot update another driver''s record');

-- ── Email-only match no longer grants anything ──────────────────────────────
-- A login whose email equals driver d02's email but whose id is different.
select test.login('eeeeeeee-0000-0000-0000-00000000e0e0', 'dr2@example.com');
update public.bookings set status = 'En Route' where id = 'cccccccc-0000-0000-0000-0000000000b2';
update public.drivers set current_lat = 2 where id = 'bbbbbbbb-0000-0000-0000-000000000d02';
select test.as_owner();
select test.ok((select status = 'Dispatched' from public.bookings where id = 'cccccccc-0000-0000-0000-0000000000b2'), 'email-only login cannot update the driver''s jobs');
select test.ok((select current_lat is null from public.drivers where id = 'bbbbbbbb-0000-0000-0000-000000000d02'), 'email-only login cannot update the driver record');

-- ── Office staff and the service role are unaffected ────────────────────────
select test.login('aaaaaaaa-0000-0000-0000-0000000000a1', 'admin@example.com');
select test.lives($$update public.bookings set quoted_price = 95, payment_status = 'Paid', payment_method = 'Card' where id = 'cccccccc-0000-0000-0000-0000000000b2'$$,
  'operator_admin can change price and payment');
select test.lives($$update public.bookings set assigned_driver_id = 'bbbbbbbb-0000-0000-0000-000000000d01', driver_id = 'bbbbbbbb-0000-0000-0000-000000000d01' where id = 'cccccccc-0000-0000-0000-0000000000b2'$$,
  'operator_admin can reassign');
select test.lives($$update public.drivers set kind = 'partner', email = 'x@example.com' where id = 'bbbbbbbb-0000-0000-0000-000000000d02'$$,
  'operator_admin can edit a driver record');
select test.login('aaaaaaaa-0000-0000-0000-0000000000e2', 'other@example.com');
update public.bookings set quoted_price = 1 where id = 'cccccccc-0000-0000-0000-0000000000b1';
select test.as_owner();
select test.ok((select quoted_price <> 1 from public.bookings where id = 'cccccccc-0000-0000-0000-0000000000b1'), 'another business''s admin cannot change EV Exec bookings');

-- A person who is both office admin and driver (the owner) keeps full access.
insert into public.tenant_users (tenant_id, user_id, role) values ('00000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000d01', 'operator_admin');
select test.login('bbbbbbbb-0000-0000-0000-000000000d01', 'dr1@example.com');
select test.lives($$update public.bookings set quoted_price = 100 where id = 'cccccccc-0000-0000-0000-0000000000b1'$$, 'owner who is also a driver can change the price');

select test.as_service();
select test.lives($$update public.bookings set payment_status = 'Paid', stripe_session_id = 'cs_test' where id = 'cccccccc-0000-0000-0000-0000000000b1'$$,
  'service role (website, Stripe webhook) can record payment');

-- ── Two-tap reminder rows: own rows only, matched by login id ───────────────
select test.as_owner();
insert into public.driver_sms_reminders (booking_id, driver_id, reminder_type, customer_phone, message) values
  ('cccccccc-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000d01', '24hr', '07000000001', 'msg1'),
  ('cccccccc-0000-0000-0000-0000000000b2', 'bbbbbbbb-0000-0000-0000-000000000d02', '24hr', '07000000002', 'msg2');
select test.login('eeeeeeee-0000-0000-0000-00000000e0e0', 'dr2@example.com');
update public.driver_sms_reminders set status = 'sent' where booking_id = 'cccccccc-0000-0000-0000-0000000000b2';
select test.login('bbbbbbbb-0000-0000-0000-000000000d01', 'dr1@example.com');
update public.driver_sms_reminders set status = 'sent', sent_at = now() where booking_id = 'cccccccc-0000-0000-0000-0000000000b1';
select test.as_owner();
select test.ok((select status = 'pending' from public.driver_sms_reminders where booking_id = 'cccccccc-0000-0000-0000-0000000000b2'), 'email-only login cannot mark another driver''s reminder sent');
select test.ok((select status = 'sent' from public.driver_sms_reminders where booking_id = 'cccccccc-0000-0000-0000-0000000000b1'), 'driver can mark their own reminder sent');

-- ── Rollback works without dropping anything ────────────────────────────────
select test.as_owner();
alter table public.bookings disable trigger zz_guard_driver_booking_update;
select test.login('bbbbbbbb-0000-0000-0000-000000000d02', 'dr2@example.com');
select test.as_owner();
update public.bookings set assigned_driver_id = 'bbbbbbbb-0000-0000-0000-000000000d02', driver_id = 'bbbbbbbb-0000-0000-0000-000000000d02' where id = 'cccccccc-0000-0000-0000-0000000000b2';
select test.login('bbbbbbbb-0000-0000-0000-000000000d02', 'dr2@example.com');
select test.lives($$update public.bookings set notes = 'rollback check' where id = 'cccccccc-0000-0000-0000-0000000000b2'$$,
  'with the guard disabled (rollback), the old behaviour returns');
select test.as_owner();
alter table public.bookings enable trigger zz_guard_driver_booking_update;
