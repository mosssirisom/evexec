-- Fix 1: only office staff can register for, and receive, office push alerts.

-- Unauthorised: a website customer (signed in, no role) registers a device.
select test.login('dddddddd-0000-0000-0000-000000000c01', 'customer@example.com');
select test.throws($$select public.register_operator_push('https://push.example/customer', 'k', 'a', 'phone')$$,
  'customer cannot register for office alerts');

-- Unauthorised: a driver (role driver only) registers a device.
select test.login('bbbbbbbb-0000-0000-0000-000000000d01', 'dr1@example.com');
select test.throws($$select public.register_operator_push('https://push.example/driver', 'k', 'a', 'phone')$$,
  'driver cannot register for office alerts');

-- Unauthorised: not signed in.
select test.login(null, null);
select test.throws($$select public.register_operator_push('https://push.example/anon', 'k', 'a', null)$$,
  'anonymous caller cannot register');

-- Bad input from staff is refused.
select test.login('aaaaaaaa-0000-0000-0000-0000000000a1', 'admin@example.com');
select test.throws($$select public.register_operator_push('', 'k', 'a', null)$$, 'empty endpoint refused');

-- Legitimate: admin, dispatcher and super_admin can register.
select test.lives($$select public.register_operator_push('https://push.example/admin', 'k1', 'a1', 'office pc')$$, 'operator_admin can register');
select test.login('aaaaaaaa-0000-0000-0000-0000000000d1', 'disp@example.com');
select test.lives($$select public.register_operator_push('https://push.example/disp', 'k2', 'a2', null)$$, 'dispatcher can register');
select test.login('aaaaaaaa-0000-0000-0000-00000000005a', 'super@example.com');
select test.lives($$select public.register_operator_push('https://push.example/super', 'k3', 'a3', null)$$, 'super_admin can register');

-- A subscription stored by a non-staff account before the fix (simulated
-- directly) and one owned by someone later removed from the team must not
-- be returned to the dispatcher.
select test.as_owner();
insert into public.operator_push_subscriptions (endpoint, p256dh, auth, user_id) values
  ('https://push.example/legacy-customer', 'k', 'a', 'dddddddd-0000-0000-0000-000000000c01');
delete from public.tenant_users where user_id = 'aaaaaaaa-0000-0000-0000-0000000000d1';

select test.login(null, null);
select test.ok(public.get_push_dispatch_bundle('wrong-secret') is null, 'wrong webhook secret gets nothing');
select test.ok(
  (select array_agg(e->>'endpoint' order by e->>'endpoint')
     from jsonb_array_elements(public.get_push_dispatch_bundle('test-webhook-secret')->'subscriptions') e)
  = array['https://push.example/admin', 'https://push.example/super'],
  'dispatch bundle holds only current staff devices (not the customer, not the removed dispatcher)');

-- Unregister still only removes your own device.
select test.login('dddddddd-0000-0000-0000-000000000c01', 'customer@example.com');
select public.unregister_operator_push('https://push.example/admin');
select test.as_owner();
select test.ok(exists (select 1 from public.operator_push_subscriptions where endpoint = 'https://push.example/admin'),
  'someone else cannot unregister the admin device');

-- Direct table access (REST /operator_push_subscriptions) is also closed to
-- non-staff (RLS policy staff_manage_own_push_subscription, unchanged).
select test.login('dddddddd-0000-0000-0000-000000000c01', 'customer@example.com');
select test.throws($$insert into public.operator_push_subscriptions (endpoint, p256dh, auth, user_id) values ('https://push.example/c2', 'k', 'a', 'dddddddd-0000-0000-0000-000000000c01')$$,
  'customer cannot insert a subscription directly');
delete from public.operator_push_subscriptions where endpoint in ('https://push.example/admin', 'https://push.example/super');
select test.ok((select count(*) from public.operator_push_subscriptions) = 0, 'customer cannot even see office subscriptions');
select test.login('bbbbbbbb-0000-0000-0000-000000000d01', 'dr1@example.com');
select test.throws($$insert into public.operator_push_subscriptions (endpoint, p256dh, auth, user_id) values ('https://push.example/d2', 'k', 'a', 'bbbbbbbb-0000-0000-0000-000000000d01')$$,
  'driver cannot insert a subscription directly');
select test.as_owner();
select test.ok((select count(*) from public.operator_push_subscriptions where endpoint in ('https://push.example/admin', 'https://push.example/super')) = 2,
  'customer delete removed no office device');

-- Staff can remove their own device; not a colleague's.
select test.login('aaaaaaaa-0000-0000-0000-00000000005a', 'super@example.com');
select public.unregister_operator_push('https://push.example/admin');
select public.unregister_operator_push('https://push.example/super');
select test.as_owner();
select test.ok((select array_agg(endpoint order by endpoint) from public.operator_push_subscriptions where endpoint in ('https://push.example/admin', 'https://push.example/super'))
  = array['https://push.example/admin'], 'super_admin removed own device only');
