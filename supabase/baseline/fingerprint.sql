-- One row per kind of object, with a count and a checksum of every definition
-- in schemas public and private (plus policies on storage). Run it on the live
-- project and on a database built from schema.sql: equal rows mean the baseline
-- still matches live. Read-only. Items are sorted with collation "C" so the live
-- database and a local one order text the same way (without it a new function name
-- could sort differently and make equal data look different).
with ns as (select oid, nspname from pg_namespace where nspname in ('public','private')),
rel as (select c.oid, c.relkind, c.relacl, c.relowner, c.relrowsecurity, c.reloptions, format('%I.%I', n.nspname, c.relname) as fq
        from pg_class c join ns n on n.oid = c.relnamespace
        where not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')),
fn as (select p.oid, p.proacl, p.proowner from pg_proc p join ns n on n.oid = p.pronamespace
       where p.prokind in ('f','p') and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')),
app(rolname) as (values ('anon'), ('authenticated'), ('service_role')),
items(kind, item) as (
  select 'columns', r.fq || '.' || a.attname || ' ' || format_type(a.atttypid, a.atttypmod) || ' ' || a.attnotnull::text || ' ' || a.attidentity::text
         || ' ' || coalesce(pg_get_expr(ad.adbin, ad.adrelid), '')
    from rel r join pg_attribute a on a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped
    left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum where r.relkind = 'r'
  union all
  select 'constraints', r.fq || '.' || k.conname || ' ' || pg_get_constraintdef(k.oid) from pg_constraint k join rel r on r.oid = k.conrelid
  union all
  select 'indexes', i.indexdef from pg_indexes i where i.schemaname in ('public','private')
  union all
  select 'functions', pg_get_functiondef(f.oid) from fn f
  union all
  select 'views', r.fq || ' ' || coalesce(array_to_string(r.reloptions, ','), '') || ' ' || pg_get_viewdef(r.oid, true) from rel r where r.relkind = 'v'
  union all
  select 'triggers', pg_get_triggerdef(t.oid) from pg_trigger t join pg_class tc on tc.oid = t.tgrelid join pg_namespace tn on tn.oid = tc.relnamespace
    where not t.tgisinternal and (tn.nspname in ('public','private') or (tn.nspname in ('auth','storage') and t.tgfoid in (select oid from fn)))
  union all
  select 'row_level_security', r.fq || ' ' || r.relrowsecurity::text from rel r where r.relkind = 'r'
  union all
  select 'policies', concat_ws(' | ', p.schemaname, p.tablename, p.policyname, p.permissive, p.cmd, p.roles::text, p.qual, p.with_check)
    from pg_policies p where p.schemaname in ('public','private','storage')
  union all
  select 'table_rights', r.fq || ' ' || a.rolname || ' ' || p.priv || ' ' || has_table_privilege(a.rolname, r.oid, p.priv)::text
    from rel r, app a, unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p(priv) where r.relkind in ('r','v')
  union all
  select 'sequence_rights', r.fq || ' ' || a.rolname || ' ' || p.priv || ' ' || has_sequence_privilege(a.rolname, r.oid, p.priv)::text
    from rel r, app a, unnest(array['USAGE','SELECT','UPDATE']) p(priv) where r.relkind = 'S'
  union all
  select 'function_rights', f.oid::regprocedure::text || ' ' || a.rolname || ' ' || has_function_privilege(a.rolname, f.oid, 'EXECUTE')::text from fn f, app a
  union all
  select 'schema_rights', n.nspname || ' ' || a.rolname || ' ' || has_schema_privilege(a.rolname, n.oid, 'USAGE')::text from ns n, app a
  union all
  select 'default_rights', n.nspname || ' ' || d.defaclobjtype::text || ' ' || pg_get_userbyid(x.grantee) || ' ' || x.privilege_type
    from pg_default_acl d join ns n on n.oid = d.defaclnamespace, aclexplode(d.defaclacl) x
    where pg_get_userbyid(d.defaclrole) = 'postgres' and pg_get_userbyid(x.grantee) in ('anon','authenticated','service_role')
  union all
  select 'realtime_tables', schemaname || '.' || tablename from pg_publication_tables where pubname = 'supabase_realtime'
  union all
  select 'buckets', concat_ws(' ', b.id, b.public::text, b.file_size_limit::text, b.allowed_mime_types::text) from storage.buckets b
)
select kind, count(*) as items, md5(string_agg(item, E'\n' order by item collate "C")) as checksum from items group by kind order by kind;
