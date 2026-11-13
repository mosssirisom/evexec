-- A business's website address: owner-only, https domain only, never shared. Rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

create temp table biz as
  select (select id from public.provision_tenant('site-a', 'Site A Co')) as a,
         (select id from public.provision_tenant('site-b', 'Site B Co')) as b;
grant select on biz to public;
insert into auth.users (id, email) values
  ('eeeeeeee-0000-4000-8000-000000000041', 'super@site.invalid'),
  ('eeeeeeee-0000-4000-8000-000000000042', 'admin@site.invalid');
insert into public.tenant_users (tenant_id, user_id, role) values
  (null, 'eeeeeeee-0000-4000-8000-000000000041', 'super_admin'),
  ((select a from biz), 'eeeeeeee-0000-4000-8000-000000000042', 'operator_admin');

select is(private.site_host('https://www.Example.co.uk/'), 'example.co.uk', 'the domain is read without scheme, www or trailing slash');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-4000-8000-000000000041","role":"authenticated"}', true);
select lives_ok($$select public.set_tenant_site((select a from biz), 'https://www.sitea.co.uk')$$, 'the platform owner can set a website address');
select is((select brand ->> 'site_url' from public.tenants where id = (select a from biz)), 'https://www.sitea.co.uk', 'it is saved');
select throws_ok($$select public.set_tenant_site((select b from biz), 'https://sitea.co.uk/')$$, '23505', null, 'another business cannot use the same domain (www and slash ignored)');
select throws_ok($$select public.set_tenant_site((select b from biz), 'http://siteb.co.uk')$$, '22023', null, 'a plain http address is refused');
select throws_ok($$select public.set_tenant_site((select b from biz), 'https://siteb.co.uk/page')$$, '22023', null, 'an address with a path is refused');
select lives_ok($$select public.set_tenant_site((select a from biz), '')$$, 'a blank address clears it');
select is((select brand ? 'site_url' from public.tenants where id = (select a from biz)), false, 'the address is gone');

-- A business's own admin cannot set it (it decides whose customers a domain reaches).
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-4000-8000-000000000042","role":"authenticated"}', true);
select throws_ok($$select public.set_tenant_site((select a from biz), 'https://sitea.co.uk')$$, '42501', null, 'an operator admin cannot set its own website address');

-- The database itself refuses two businesses on one domain, even by a direct update.
reset role;
update public.tenants set brand = jsonb_set(coalesce(brand, '{}'), '{site_url}', '"https://shared.test"') where id = (select a from biz);
select throws_ok($$update public.tenants set brand = jsonb_set(coalesce(brand, '{}'), '{site_url}', '"https://www.shared.test/"') where id = (select b from biz)$$, '23505', null, 'a direct update to a shared domain is refused by the unique index');

select * from finish();
rollback;
