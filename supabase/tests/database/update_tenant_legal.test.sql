-- Operator legal details (draft migration supabase/pending/20261112190000_update_tenant_legal.sql).
-- Rolls back; creates its own fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

create temp table biz as select id from public.provision_tenant('legal-test', 'Legal Test Co');
grant select on biz to public;
insert into auth.users (id, email) values
  ('cccccccc-0000-4000-8000-000000000011', 'admin@legal.invalid'),
  ('cccccccc-0000-4000-8000-000000000012', 'driver@legal.invalid'),
  ('cccccccc-0000-4000-8000-000000000013', 'other@legal.invalid');
insert into public.tenant_users (tenant_id, user_id, role) values
  ((select id from biz), 'cccccccc-0000-4000-8000-000000000011', 'operator_admin'),
  ((select id from biz), 'cccccccc-0000-4000-8000-000000000012', 'driver');

-- Act as the business admin.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-8000-000000000011","role":"authenticated"}', true);

select lives_ok(
  $$select public.update_tenant_legal((select id from biz), '{"legal_name":"Legal Test Co Ltd","status":"limited company","base":"Leeds, West Yorkshire","insurance_confirmed":true,"fleet":"three saloon cars"}'::jsonb)$$,
  'the business admin can save legal details');
select is((select brand #>> '{legal,legal_name}' from public.tenants where id = (select id from biz)), 'Legal Test Co Ltd', 'the legal name is saved under brand.legal');
select is((select (brand #>> '{legal,insurance_confirmed}')::boolean from public.tenants where id = (select id from biz)), true, 'insurance is confirmed');
select isnt((select brand #>> '{legal,insurance_confirmed_at}' from public.tenants where id = (select id from biz)), null, 'the time of confirmation is recorded');
select lives_ok(
  $$select public.update_tenant_legal((select id from biz), '{"insurance_confirmed":false}'::jsonb)$$,
  'the tick can be cleared');
select is((select brand #>> '{legal,insurance_confirmed_at}' from public.tenants where id = (select id from biz)), null, 'clearing the tick clears the time');
select is((select brand #>> '{legal,legal_name}' from public.tenants where id = (select id from biz)), 'Legal Test Co Ltd', 'a later save keeps the other details');

select lives_ok(
  $$select public.update_tenant_legal((select id from biz), '{"colors":{"primary":"#000000"},"pricing":"x","legal_name":"Kept"}'::jsonb)$$,
  'other settings in the request are ignored, not an error');
select is((select brand -> 'colors' from public.tenants where id = (select id from biz)), null, 'colours cannot be written through this function');

select throws_ok($$select public.update_tenant_legal((select id from biz), '{"status":"plc"}'::jsonb)$$, '22023', null, 'an unknown status is refused');
select throws_ok($$select public.update_tenant_legal((select id from biz), '{"jurisdiction":"wales"}'::jsonb)$$, '22023', null, 'an unknown jurisdiction is refused');
select throws_ok($$select public.update_tenant_legal((select id from biz), '{"insurance_confirmed":"yes"}'::jsonb)$$, '22023', null, 'insurance must be true or false');
select throws_ok($$select public.update_tenant_legal((select id from biz), jsonb_build_object('legal_name', repeat('x', 101)))$$, '22001', null, 'a name over 100 characters is refused');

-- A driver of the business cannot change it.
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-8000-000000000012","role":"authenticated"}', true);
select throws_ok($$select public.update_tenant_legal((select id from biz), '{"legal_name":"Hijack"}'::jsonb)$$, '42501', null, 'a driver cannot change the legal details');

-- Someone with no role in the business cannot change it.
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-8000-000000000013","role":"authenticated"}', true);
select throws_ok($$select public.update_tenant_legal((select id from biz), '{"legal_name":"Hijack"}'::jsonb)$$, '42501', null, 'a stranger cannot change the legal details');

select * from finish();
rollback;
