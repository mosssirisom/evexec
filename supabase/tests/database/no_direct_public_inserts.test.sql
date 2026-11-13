-- Visitors and signed-in accounts cannot insert contact messages or quote requests directly.
-- The website writes them through its server (service role). Rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'quote_requests' and cmd = 'INSERT' and roles @> array['anon']::name[]),
  0, 'anon cannot insert quote requests directly');
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'contact_messages' and cmd = 'INSERT' and (roles @> array['anon']::name[] or roles @> array['authenticated']::name[])),
  0, 'visitors and signed-in accounts cannot insert contact messages directly');
select * from finish();
rollback;
