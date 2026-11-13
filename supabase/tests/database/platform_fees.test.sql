-- Platform fees (default and per-business rate). Rolls back; creates its own fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

create temp table biz as select id from public.provision_tenant('fees-test', 'Fees Test Co');
grant select on biz to public;
insert into auth.users (id, email) values
  ('eeeeeeee-0000-4000-8000-000000000031', 'super@fees.invalid'),
  ('eeeeeeee-0000-4000-8000-000000000032', 'admin@fees.invalid');
insert into public.tenant_users (tenant_id, user_id, role) values
  (null, 'eeeeeeee-0000-4000-8000-000000000031', 'super_admin'),
  ((select id from biz), 'eeeeeeee-0000-4000-8000-000000000032', 'operator_admin');

select is((select default_monthly_pence from public.platform_fees where id), 9900, 'the default monthly fee starts at £99');
select is((select default_setup_pence from public.platform_fees where id), 99900, 'the default set-up fee starts at £999');

-- The platform owner.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-4000-8000-000000000031","role":"authenticated"}', true);
select is((public.get_platform_fees() ->> 'default_monthly_pence')::int, 9900, 'the owner can read the default fees');
select lives_ok($$select public.set_default_fees(5900, 79900)$$, 'the owner can change the default fees');
select is((public.get_platform_fees() ->> 'default_setup_pence')::int, 79900, 'the new default is saved');
select throws_ok($$select public.set_default_fees(-1, 100)$$, '22023', null, 'a negative fee is refused');
select throws_ok($$select public.set_default_fees(100, 20000000)$$, '22023', null, 'an absurd set-up fee is refused');
select throws_ok($$select public.set_default_fees(null, 100)$$, '22023', null, 'a missing fee is refused');

select lives_ok($$select public.set_tenant_fees((select id from biz), 2500, null)$$, 'the owner can set one business''s monthly rate');
select is((select monthly_pence from public.list_tenant_fees() where slug = 'fees-test'), 2500, 'the business''s own monthly rate applies');
select is((select setup_pence from public.list_tenant_fees() where slug = 'fees-test'), 79900, 'a business with no set-up rate uses the default');
select is((select custom from public.list_tenant_fees() where slug = 'fees-test'), true, 'it is marked as a custom rate');
select lives_ok($$select public.set_tenant_fees((select id from biz), 0, 0)$$, 'a business can be set to free');
select is((select monthly_pence from public.list_tenant_fees() where slug = 'fees-test'), 0, 'free means £0, not the default');
select lives_ok($$select public.set_tenant_fees((select id from biz), null, null)$$, 'a business can go back to the default');
select is((select custom from public.list_tenant_fees() where slug = 'fees-test'), false, 'no longer custom');
select throws_ok($$select public.set_tenant_fees('00000000-0000-4000-8000-00000000dead', 100, 100)$$, 'P0002', null, 'an unknown business is refused');
select throws_ok($$select public.set_tenant_fees((select id from biz), -5, 100)$$, '22023', null, 'a negative business fee is refused');

-- A business's own admin cannot see or change the rates.
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-4000-8000-000000000032","role":"authenticated"}', true);
select throws_ok($$select public.get_platform_fees()$$, '42501', null, 'an operator admin cannot read the default fees');
select throws_ok($$select public.list_tenant_fees()$$, '42501', null, 'an operator admin cannot list every business''s fees');
select throws_ok($$select public.set_tenant_fees((select id from biz), 0, 0)$$, '42501', null, 'an operator admin cannot change its own fees');
select throws_ok($$select public.set_default_fees(0, 0)$$, '42501', null, 'an operator admin cannot change the default fees');
select throws_ok($$select count(*) from public.platform_fees$$, '42501', null, 'the fees table cannot be read directly');

-- Anyone not signed in gets nothing.
reset role;
set local role anon;
select throws_ok($$select public.get_platform_fees()$$, '42501', null, 'a visitor cannot read the fees');

select * from finish();
rollback;
