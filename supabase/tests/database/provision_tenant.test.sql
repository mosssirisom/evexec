-- Setting up a new business (draft migration
-- supabase/pending/20261112120000_provision_tenant.sql).
-- Checks what a new business gets, what it must not get (EV Exec's prices, SMS
-- switched on), bad input, duplicates, and that only the servers can call it.
-- Runs in one transaction and rolls back; creates its own fixtures.

begin;

create extension if not exists pgtap with schema extensions;

select * from no_plan();

create temp table made as select * from public.provision_tenant('new-cars', '  New Cars  ', 'hello@new.test', ' 07123 456789 ');

select is((select name from made), 'New Cars', 'the business name is tidied');
select is((select slug from made), 'new-cars', 'the short name is kept');
select is((select contact_email from made), 'hello@new.test', 'contact email saved');
select is((select contact_phone from made), '07123 456789', 'contact phone saved without surrounding spaces');
select is((select status from made), 'active', 'new businesses start active');
select is((select pricing from made), '{"airports": [], "extra_stop": 0}'::jsonb, 'the price list starts empty, never EV Exec''s');
select is((select brand #>> '{invoice,business_name}' from made), 'New Cars', 'the invoice name is pre-filled');

select is((select count(*)::int from public.notification_channel_settings s join made m on m.id = s.tenant_id), 1, 'it has its own notification settings row');
select is(
  (select row(s.email_enabled, s.sms_enabled, s.whatsapp_enabled, s.push_enabled)::text from public.notification_channel_settings s join made m on m.id = s.tenant_id),
  '(t,f,f,f)', 'email is on and SMS, WhatsApp and push are off (Twilio stays dormant)');

select is(public.tenant_brand((select id from made))->>'name', 'New Cars', 'the business can be looked up by the message helpers');
select is((select count(*)::int from public.tenants where slug = 'new-cars'), 1, 'exactly one business was created');

select throws_ok($$ select public.provision_tenant('new-cars', 'Again') $$, '23505', null, 'a second business with the same short name is refused');
select throws_ok($$ select public.provision_tenant('Bad Slug!', 'X') $$, '22023', null, 'a short name with capitals, spaces or symbols is refused');
select throws_ok($$ select public.provision_tenant('-lead', 'X') $$, '22023', null, 'a short name starting with a hyphen is refused');
select throws_ok($$ select public.provision_tenant('ok-slug', '   ') $$, '22023', null, 'a blank business name is refused');
select throws_ok($$ select public.provision_tenant('ok-slug', 'X', 'not-an-email') $$, '22023', null, 'an invalid contact email is refused');
select throws_ok($$ select public.provision_tenant(repeat('a', 41), 'X') $$, '22023', null, 'a very long short name is refused');
select is((select count(*)::int from public.tenants where slug in ('ok-slug', 'bad slug!', '-lead')), 0, 'nothing is created for refused requests');

select ok(not has_function_privilege('anon', 'public.provision_tenant(text,text,text,text)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.provision_tenant(text,text,text,text)', 'EXECUTE')
      and has_function_privilege('service_role', 'public.provision_tenant(text,text,text,text)', 'EXECUTE'),
  'only the servers can set up a business');

select * from finish();
rollback;
