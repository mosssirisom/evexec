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

-- Cancellation policy (three standard bands; the 100% band is implied).
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-8000-000000000011","role":"authenticated"}', true);
select lives_ok(
  $$select public.update_tenant_legal((select id from biz), '{"policy":{"standard":[{"hours":72,"pct":0},{"hours":24,"pct":50},{"hours":4,"pct":75}]}}'::jsonb)$$,
  'the business admin can set its own cancellation bands');
select is((select (brand #>> '{legal,policy,standard,1,pct}')::int from public.tenants where id = (select id from biz)), 50, 'the operator''s band is stored');
select throws_ok($$select public.update_tenant_legal((select id from biz), '{"policy":{"standard":[{"hours":72,"pct":0},{"hours":24,"pct":50}]}}'::jsonb)$$, '22023', null, 'three bands are required');
select throws_ok($$select public.update_tenant_legal((select id from biz), '{"policy":{"standard":[{"hours":72,"pct":5},{"hours":24,"pct":50},{"hours":4,"pct":75}]}}'::jsonb)$$, '22023', null, 'the first band must be 0 percent');
select throws_ok($$select public.update_tenant_legal((select id from biz), '{"policy":{"standard":[{"hours":72,"pct":0},{"hours":96,"pct":50},{"hours":4,"pct":75}]}}'::jsonb)$$, '22023', null, 'notice hours must get smaller');
select throws_ok($$select public.update_tenant_legal((select id from biz), '{"policy":{"standard":[{"hours":72,"pct":0},{"hours":24,"pct":50},{"hours":4,"pct":40}]}}'::jsonb)$$, '22023', null, 'the percentage must rise with each band');
select throws_ok($$select public.update_tenant_legal((select id from biz), '{"policy":{"standard":[{"hours":72,"pct":0},{"hours":24,"pct":150},{"hours":4,"pct":175}]}}'::jsonb)$$, '22023', null, 'a percentage over 100 is refused');
select throws_ok($$select public.update_tenant_legal((select id from biz), '{"policy":{"standard":[{"hours":0,"pct":0},{"hours":24,"pct":50},{"hours":4,"pct":75}]}}'::jsonb)$$, '22023', null, 'zero notice hours are refused');

-- Own terms: mode, text, version, confirmation, privacy extra.
select throws_ok($$select public.update_tenant_legal((select id from biz), '{"terms_mode":"custom"}'::jsonb)$$, '22023', null, 'custom terms need text first');
select throws_ok($$select public.update_tenant_legal((select id from biz), jsonb_build_object('terms_mode','custom','custom_terms',repeat('x',150)))$$, '22023', null, 'custom terms need the confirmation tick');
select throws_ok($$select public.update_tenant_legal((select id from biz), '{"terms_mode":"other"}'::jsonb)$$, '22023', null, 'an unknown terms mode is refused');
select throws_ok($$select public.update_tenant_legal((select id from biz), '{"numbers_confirmed":"yes"}'::jsonb)$$, '22023', null, 'the confirmation must be true or false');
select throws_ok($$select public.update_tenant_legal((select id from biz), jsonb_build_object('custom_terms',repeat('x',30001)))$$, '22001', null, 'terms over 30000 characters are refused');
select throws_ok($$select public.update_tenant_legal((select id from biz), jsonb_build_object('privacy_extra',repeat('x',4001)))$$, '22001', null, 'a long privacy extra is refused');
select lives_ok($$select public.update_tenant_legal((select id from biz), jsonb_build_object('terms_mode','custom','custom_terms',repeat('x',150),'numbers_confirmed',true,'privacy_extra','We also keep a log.'))$$, 'custom terms save with text and confirmation');
select is((select (brand #>> '{legal,custom_terms_version}')::int from public.tenants where id = (select id from biz)), 1, 'first text is version 1');
select lives_ok($$select public.update_tenant_legal((select id from biz), jsonb_build_object('custom_terms',repeat('x',150)))$$, 'saving the same text again works');
select is((select (brand #>> '{legal,custom_terms_version}')::int from public.tenants where id = (select id from biz)), 1, 'unchanged text keeps its version');
select lives_ok($$select public.update_tenant_legal((select id from biz), jsonb_build_object('custom_terms',repeat('y',150)))$$, 'changed text saves');
select is((select (brand #>> '{legal,custom_terms_version}')::int from public.tenants where id = (select id from biz)), 2, 'changed text is version 2');
select is((select brand #>> '{legal,privacy_extra}' from public.tenants where id = (select id from biz)), 'We also keep a log.', 'privacy extra is stored');
select throws_ok($$select public.update_tenant_legal((select id from biz), '{"custom_terms":"too short"}'::jsonb)$$, '22023', null, 'text cannot shrink below the minimum while custom is on');
select lives_ok($$select public.update_tenant_legal((select id from biz), '{"terms_mode":"standard"}'::jsonb)$$, 'switching back to standard works');

-- Operator responsibilities confirmation.
select lives_ok($$select public.update_tenant_legal((select id from biz), '{"responsibilities_confirmed":true}'::jsonb)$$, 'the operator can confirm its responsibilities');
select is((select (brand #>> '{legal,responsibilities_confirmed}')::boolean from public.tenants where id = (select id from biz)), true, 'confirmation stored');
select isnt((select brand #>> '{legal,responsibilities_confirmed_at}' from public.tenants where id = (select id from biz)), null, 'time recorded');
select is((select (brand #>> '{legal,responsibilities_version}')::int from public.tenants where id = (select id from biz)), 1, 'version recorded');
select throws_ok($$select public.update_tenant_legal((select id from biz), '{"responsibilities_confirmed":"yes"}'::jsonb)$$, '22023', null, 'must be true or false');
select lives_ok($$select public.update_tenant_legal((select id from biz), '{"responsibilities_confirmed":false}'::jsonb)$$, 'it can be cleared');
select is((select brand #>> '{legal,responsibilities_confirmed_at}' from public.tenants where id = (select id from biz)), null, 'clearing clears the time');

select * from finish();
rollback;
