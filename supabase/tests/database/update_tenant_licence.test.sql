-- Licence number. Rolls back; creates its own fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

create temp table biz as select id from public.provision_tenant('licence-test', 'Licence Test Co');
grant select on biz to public;
insert into auth.users (id, email) values
  ('dddddddd-0000-4000-8000-000000000021', 'admin@licence.invalid'),
  ('dddddddd-0000-4000-8000-000000000022', 'driver@licence.invalid');
insert into public.tenant_users (tenant_id, user_id, role) values
  ((select id from biz), 'dddddddd-0000-4000-8000-000000000021', 'operator_admin'),
  ((select id from biz), 'dddddddd-0000-4000-8000-000000000022', 'driver');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"dddddddd-0000-4000-8000-000000000021","role":"authenticated"}', true);

select lives_ok($$select public.update_tenant_licence((select id from biz), ' pho 0079 ')$$, 'the business admin can save the licence');
select is((select brand ->> 'licence' from public.tenants where id = (select id from biz)), 'PHO0079', 'spaces removed and capitals stored');
select lives_ok($$select public.update_tenant_licence((select id from biz), 'ab-12')$$, 'hyphens are allowed');
select is((select brand ->> 'licence' from public.tenants where id = (select id from biz)), 'AB12', 'hyphens removed');
select throws_ok($$select public.update_tenant_licence((select id from biz), 'AB')$$, '22023', null, 'too short is refused');
select throws_ok($$select public.update_tenant_licence((select id from biz), 'X'||repeat('1',20))$$, '22023', null, 'too long is refused');
select throws_ok($$select public.update_tenant_licence((select id from biz), '<script>')$$, '22023', null, 'symbols are refused');
select lives_ok($$select public.update_tenant_licence((select id from biz), '')$$, 'an empty value clears it');
select is((select brand ->> 'licence' from public.tenants where id = (select id from biz)), null, 'cleared');
select lives_ok($$select public.update_tenant_licence((select id from biz), 'PHO0079')$$, 'saved again');

select set_config('request.jwt.claims', '{"sub":"dddddddd-0000-4000-8000-000000000022","role":"authenticated"}', true);
select throws_ok($$select public.update_tenant_licence((select id from biz), 'HIJACK1')$$, '42501', null, 'a driver cannot change the licence');

select * from finish();
rollback;
