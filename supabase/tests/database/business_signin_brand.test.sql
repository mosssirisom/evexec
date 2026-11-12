-- Public sign-in branding lookup. Rolls back; creates its own fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

create temp table biz as select id from public.provision_tenant('brand-test', 'Brand Test Co');
grant select on biz to public;
update public.tenants set brand = brand || '{"logo_url":"https://example.invalid/l.png","colors":{"primary":"#112233","accent":"zzz"},"licence":"SECRET1","invoice":{"x":1}}'::jsonb, contact_email = 'private@brand.invalid' where id = (select id from biz);

set local role anon;
select is(public.business_signin_brand('brand-test') ->> 'name', 'Brand Test Co', 'a visitor can read the name');
select is(public.business_signin_brand('  BRAND-TEST ') ->> 'primary', '#112233', 'slug is matched ignoring case and spaces, valid colour returned');
select is(public.business_signin_brand('brand-test') ->> 'accent', null, 'a colour that is not #RRGGBB is dropped');
select is(public.business_signin_brand('brand-test') ->> 'logo_url', 'https://example.invalid/l.png', 'logo returned');
select is((select array_agg(k order by k) from jsonb_object_keys(public.business_signin_brand('brand-test')) k), array['accent','logo_url','name','primary'], 'only name, logo and colours are exposed');
select is(public.business_signin_brand('nope'), null, 'unknown business gives nothing');
select is(public.business_signin_brand(null), null, 'null gives nothing');
reset role;
update public.tenants set status = 'suspended' where id = (select id from biz);
set local role anon;
select is(public.business_signin_brand('brand-test'), null, 'an inactive business gives nothing');

select * from finish();
rollback;
