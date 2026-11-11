-- Tenant scoping of the shared tables (draft migration
-- supabase/pending/20261111120000_tenant_scoping.sql).
--
-- Two businesses, two office staff, one platform super admin, one customer.
-- Checks that office push devices, notification settings and the notification
-- queue and log are separated per business, and that the rest keep working.
-- Runs in one transaction and rolls back; creates its own fixtures.

begin;

create extension if not exists pgtap with schema extensions;

select * from no_plan();

-- ─── Fixtures ────────────────────────────────────────────────────────────────
-- t1 / t2: two businesses.  a1 admin of t1, a2 dispatcher of t1, b1 dispatcher of t2,
-- f1 platform super admin, c1 a customer.

insert into public.tenants (id, slug, name) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'scope-test-one', 'Scope Test One'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'scope-test-two', 'Scope Test Two');

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email, '{}', '{}', now(), now()
from (values
  ('bbbbbbbb-0000-4000-8000-0000000000a1', 'admin.one@scope-test.invalid'),
  ('bbbbbbbb-0000-4000-8000-0000000000a2', 'dispatch.one@scope-test.invalid'),
  ('bbbbbbbb-0000-4000-8000-0000000000b1', 'dispatch.two@scope-test.invalid'),
  ('bbbbbbbb-0000-4000-8000-0000000000c1', 'customer@scope-test.invalid'),
  ('bbbbbbbb-0000-4000-8000-0000000000f1', 'super@scope-test.invalid')
) as u(id, email);

insert into public.tenant_users (user_id, tenant_id, role) values
  ('bbbbbbbb-0000-4000-8000-0000000000a1', 'bbbbbbbb-0000-4000-8000-000000000001', 'operator_admin'),
  ('bbbbbbbb-0000-4000-8000-0000000000a2', 'bbbbbbbb-0000-4000-8000-000000000001', 'dispatcher'),
  ('bbbbbbbb-0000-4000-8000-0000000000b1', 'bbbbbbbb-0000-4000-8000-000000000002', 'dispatcher'),
  ('bbbbbbbb-0000-4000-8000-0000000000f1', null, 'super_admin');

insert into public.bookings (id, tenant_id, ref, customer_name, customer_phone, travel_date, travel_time, status, payment_status)
values
  ('bbbbbbbb-0000-4000-8000-00000000b001', 'bbbbbbbb-0000-4000-8000-000000000001', 'EVX-SCOPE1', 'One', '07000000001', '2099-01-01', '10:00', 'Unassigned', 'Unpaid'),
  ('bbbbbbbb-0000-4000-8000-00000000b002', 'bbbbbbbb-0000-4000-8000-000000000002', 'EVX-SCOPE2', 'Two', '07000000002', '2099-01-02', '10:00', 'Unassigned', 'Unpaid');

insert into public.push_config (id, vapid_public, vapid_private, vapid_subject, webhook_secret)
values (true, 'pub', 'priv', 'mailto:test@scope-test.invalid', 'test-secret')
on conflict (id) do update set webhook_secret = excluded.webhook_secret;

-- ─── 1. Office push devices ──────────────────────────────────────────────────

-- Devices are registered through the function, as the Operator app does.
set local "request.jwt.claims" to '{"sub":"bbbbbbbb-0000-4000-8000-0000000000a1","role":"authenticated"}';
set local role authenticated;
select lives_ok($$ select public.register_operator_push('https://push.test/a1', 'p1', 'a1', 'admin one phone') $$, 'staff can register a device');
reset role;
set local "request.jwt.claims" to '{"sub":"bbbbbbbb-0000-4000-8000-0000000000b1","role":"authenticated"}';
set local role authenticated;
select lives_ok($$ select public.register_operator_push('https://push.test/b1', 'p2', 'a2', 'dispatcher two phone') $$, 'staff of another business can register a device');
reset role;
set local "request.jwt.claims" to '{"sub":"bbbbbbbb-0000-4000-8000-0000000000f1","role":"authenticated"}';
set local role authenticated;
select lives_ok($$ select public.register_operator_push('https://push.test/f1', 'p3', 'a3', 'platform phone') $$, 'a platform super admin can register a device');
reset role;

select is(
  (select tenant_id::text from public.operator_push_subscriptions where endpoint = 'https://push.test/a1'),
  'bbbbbbbb-0000-4000-8000-000000000001',
  'a device is stored under its owner''s business'
);
select is(
  (select tenant_id::text from public.operator_push_subscriptions where endpoint = 'https://push.test/b1'),
  'bbbbbbbb-0000-4000-8000-000000000002',
  'the other business''s device is stored under that business'
);
select is(
  (select tenant_id from public.operator_push_subscriptions where endpoint = 'https://push.test/f1'),
  null,
  'a platform super admin''s device has no business (it hears every business)'
);

-- A signed-in member cannot choose which business a device belongs to.
set local "request.jwt.claims" to '{"sub":"bbbbbbbb-0000-4000-8000-0000000000a2","role":"authenticated"}';
set local role authenticated;
select lives_ok(
  $$ insert into public.operator_push_subscriptions (endpoint, p256dh, auth, user_id, tenant_id)
     values ('https://push.test/a2', 'p', 'a', 'bbbbbbbb-0000-4000-8000-0000000000a2', 'bbbbbbbb-0000-4000-8000-000000000002') $$,
  'a direct insert is accepted'
);
reset role;
select is(
  (select tenant_id::text from public.operator_push_subscriptions where endpoint = 'https://push.test/a2'),
  'bbbbbbbb-0000-4000-8000-000000000001',
  'but the business named in it is ignored: it is taken from the staff role'
);

select is(
  (select jsonb_array_length(public.get_push_dispatch_bundle_for_tenant('test-secret', 'bbbbbbbb-0000-4000-8000-000000000001') -> 'subscriptions')),
  3,
  'business one''s alert goes to its own two devices and the platform device'
);
select ok(
  not exists (
    select 1 from jsonb_array_elements(public.get_push_dispatch_bundle_for_tenant('test-secret', 'bbbbbbbb-0000-4000-8000-000000000001') -> 'subscriptions') e
    where e ->> 'endpoint' = 'https://push.test/b1'
  ),
  'business one''s alert never reaches business two''s device'
);
select ok(
  not exists (
    select 1 from jsonb_array_elements(public.get_push_dispatch_bundle_for_tenant('test-secret', 'bbbbbbbb-0000-4000-8000-000000000002') -> 'subscriptions') e
    where e ->> 'endpoint' in ('https://push.test/a1', 'https://push.test/a2')
  ),
  'business two''s alert never reaches business one''s devices'
);
select is(
  (select jsonb_array_length(public.get_push_dispatch_bundle_for_tenant('test-secret', 'bbbbbbbb-0000-4000-8000-000000000002') -> 'subscriptions')),
  2,
  'business two''s alert goes to its own device and the platform device'
);
select is(public.get_push_dispatch_bundle_for_tenant('wrong-secret', 'bbbbbbbb-0000-4000-8000-000000000001'), null, 'a wrong secret gets nothing');
select is(public.get_push_dispatch_bundle_for_tenant('test-secret', null), null, 'an alert must name a business');
select ok(
  has_function_privilege('anon', 'public.get_push_dispatch_bundle_for_tenant(text,uuid)', 'EXECUTE'),
  'the Operator app''s push route can still call it without a login'
);
select ok(
  (select jsonb_array_length(public.get_push_dispatch_bundle('test-secret') -> 'subscriptions')) >= 4,
  'the old all-business function still works while the apps move over (to be retired)'
);

-- Moving a device to another login moves it to that login's business.
update public.operator_push_subscriptions set user_id = 'bbbbbbbb-0000-4000-8000-0000000000b1' where endpoint = 'https://push.test/a2';
select is(
  (select tenant_id::text from public.operator_push_subscriptions where endpoint = 'https://push.test/a2'),
  'bbbbbbbb-0000-4000-8000-000000000002',
  'changing the owner of a device changes its business'
);

-- ─── 2. Notification settings are per business ──────────────────────────────

set local "request.jwt.claims" to '{"sub":"bbbbbbbb-0000-4000-8000-0000000000a1","role":"authenticated"}';
set local role authenticated;
select lives_ok(
  $$ insert into public.notification_channel_settings (tenant_id, sms_enabled) values ('bbbbbbbb-0000-4000-8000-000000000001', false) $$,
  'staff can create their own business''s settings'
);
select throws_ok(
  $$ insert into public.notification_channel_settings (tenant_id) values ('bbbbbbbb-0000-4000-8000-000000000002') $$,
  '42501', null,
  'staff cannot create settings for another business'
);
select lives_ok(
  $$ update public.notification_channel_settings set email_enabled = false where tenant_id = 'bbbbbbbb-0000-4000-8000-000000000001' $$,
  'staff can change their own business''s settings'
);
reset role;

set local "request.jwt.claims" to '{"sub":"bbbbbbbb-0000-4000-8000-0000000000b1","role":"authenticated"}';
set local role authenticated;
select is((select count(*)::int from public.notification_channel_settings where tenant_id = 'bbbbbbbb-0000-4000-8000-000000000001'), 0, 'another business cannot read these settings');
update public.notification_channel_settings set email_enabled = true, sms_enabled = true where tenant_id = 'bbbbbbbb-0000-4000-8000-000000000001';
reset role;
select is(
  (select email_enabled::text || '/' || sms_enabled::text from public.notification_channel_settings where tenant_id = 'bbbbbbbb-0000-4000-8000-000000000001'),
  'false/false',
  'another business cannot change them (the update touches nothing)'
);

set local "request.jwt.claims" to '{"sub":"bbbbbbbb-0000-4000-8000-0000000000c1","role":"authenticated"}';
set local role authenticated;
select is((select count(*)::int from public.notification_channel_settings), 0, 'a customer sees no settings');
reset role;

select is((select count(*)::int from public.notification_channel_settings where tenant_id = '00000000-0000-0000-0000-000000000001'), 0, 'test database starts without the live business''s settings row (so none leaks into these checks)');

-- ─── 3. Notification queue and log ──────────────────────────────────────────

insert into public.notification_queue (booking_id, type, channel, recipient)
values ('bbbbbbbb-0000-4000-8000-00000000b001', 'received', 'email', 'one@scope-test.invalid'),
       ('bbbbbbbb-0000-4000-8000-00000000b002', 'received', 'email', 'two@scope-test.invalid');
insert into public.notification_queue (type, channel, recipient) values ('other', 'email', 'nobody@scope-test.invalid');
insert into public.notification_log (booking_id, type, channel, recipient)
values ('bbbbbbbb-0000-4000-8000-00000000b001', 'received', 'email', 'one@scope-test.invalid'),
       ('bbbbbbbb-0000-4000-8000-00000000b002', 'received', 'email', 'two@scope-test.invalid');

select is((select tenant_id::text from public.notification_queue where recipient = 'one@scope-test.invalid'), 'bbbbbbbb-0000-4000-8000-000000000001', 'a queued message takes its booking''s business');
select is((select tenant_id::text from public.notification_queue where recipient = 'two@scope-test.invalid'), 'bbbbbbbb-0000-4000-8000-000000000002', 'including for the other business');
select is((select tenant_id::text from public.notification_queue where recipient = 'nobody@scope-test.invalid'), '00000000-0000-0000-0000-000000000001', 'a message with no booking keeps the default business');
select is((select tenant_id::text from public.notification_log where recipient = 'two@scope-test.invalid'), 'bbbbbbbb-0000-4000-8000-000000000002', 'a log row takes its booking''s business');

set local "request.jwt.claims" to '{"sub":"bbbbbbbb-0000-4000-8000-0000000000a1","role":"authenticated"}';
set local role authenticated;
select is((select array_agg(recipient order by recipient) from public.notification_queue), array['one@scope-test.invalid'], 'staff see only their own business''s queue');
select is((select array_agg(recipient order by recipient) from public.notification_log), array['one@scope-test.invalid'], 'staff see only their own business''s log');
select is((select count(*)::int from public.notification_queue_dashboard), 1, 'the queue status view shows staff only their own business');
select is((select count(*)::int from public.notification_log_dashboard), 1, 'the log status view shows staff only their own business');
select throws_ok(
  $$ insert into public.notification_queue (booking_id, type, channel, recipient) values ('bbbbbbbb-0000-4000-8000-00000000b001', 'x', 'email', 'x@scope-test.invalid') $$,
  '42501', null,
  'staff cannot write to the queue (only the servers do)'
);
reset role;

set local "request.jwt.claims" to '{"sub":"bbbbbbbb-0000-4000-8000-0000000000c1","role":"authenticated"}';
set local role authenticated;
select is((select count(*)::int from public.notification_queue), 0, 'a customer sees no queue');
select is((select count(*)::int from public.notification_log), 0, 'a customer sees no log');
reset role;

set local "request.jwt.claims" to '{"sub":"bbbbbbbb-0000-4000-8000-0000000000f1","role":"authenticated"}';
set local role authenticated;
select is((select count(*)::int from public.notification_queue where recipient like '%@scope-test.invalid'), 3, 'a platform super admin sees every business''s queue');
reset role;

set local role anon;
set local "request.jwt.claims" to '{"role":"anon"}';
select throws_ok($$ select count(*) from public.notification_queue $$, '42501', null, 'not signed in: the queue is refused');
select throws_ok($$ select count(*) from public.notification_channel_settings $$, '42501', null, 'not signed in: settings are refused');
reset role;

set local "request.jwt.claims" to '{"role":"service_role"}';
set local role service_role;
select is((select count(*)::int from public.notification_queue where recipient like '%@scope-test.invalid'), 3, 'the servers still see the whole queue');
select lives_ok($$ insert into public.notification_queue (booking_id, type, channel, recipient) values ('bbbbbbbb-0000-4000-8000-00000000b001', 'x', 'email', 'server@scope-test.invalid') $$, 'the servers can still queue a message');
select lives_ok($$ insert into public.notification_log (booking_id, type, channel) values ('bbbbbbbb-0000-4000-8000-00000000b001', 'x', 'email') $$, 'the servers can still write the log');
reset role;

-- ─── 4. Alerts say which business they are for ─────────────────────────────

-- The new-booking alert sends the whole booking row; the no-show alert sends
-- the business next to its notice.
insert into public.bookings (id, tenant_id, ref, customer_name, customer_phone, travel_date, travel_time, status, payment_status, source)
values ('bbbbbbbb-0000-4000-8000-00000000b003', 'bbbbbbbb-0000-4000-8000-000000000002', 'EVX-SCOPE3', 'Three', '07000000003', '2099-01-03', '10:00', 'Unassigned', 'Unpaid', 'website');
select is(
  (select body -> 'record' ->> 'tenant_id' from net._sent where body -> 'record' ->> 'ref' = 'EVX-SCOPE3'),
  'bbbbbbbb-0000-4000-8000-000000000002',
  'the new-booking alert carries the booking''s business'
);

insert into public.bookings (id, tenant_id, ref, customer_name, customer_phone, travel_date, travel_time, status, payment_status)
values ('bbbbbbbb-0000-4000-8000-00000000b004', 'bbbbbbbb-0000-4000-8000-000000000002', 'EVX-SCOPE4', 'Four', '07000000004', '2099-01-04', '10:00', 'Arrived', 'Unpaid');
update public.bookings set status = 'No Show' where id = 'bbbbbbbb-0000-4000-8000-00000000b004';
select is(
  (select body ->> 'tenant_id' from net._sent where body -> 'notification' ->> 'tag' = 'noshow-EVX-SCOPE4'),
  'bbbbbbbb-0000-4000-8000-000000000002',
  'the no-show alert carries the booking''s business'
);
select is(
  (select body -> 'notification' ->> 'title' from net._sent where body -> 'notification' ->> 'tag' = 'noshow-EVX-SCOPE4'),
  'No-show: Four',
  'and still reads as before'
);

-- ─── 5. Structure ────────────────────────────────────────────────────────────

select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity $$,
  'every table still has row-level security switched on'
);
select is_empty(
  $$ select c.relname || '.' || a.attname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped
     where n.nspname = 'public' and c.relname in ('operator_push_subscriptions','notification_channel_settings','notification_queue','notification_log')
       and not (a.attnotnull or c.relname = 'operator_push_subscriptions') $$,
  'tenant_id is required on settings, queue and log (devices may be platform-wide)'
);

select * from finish();
rollback;
