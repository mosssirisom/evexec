-- Nightly copy of every public and private table (plus the basic account list
-- from auth.users, without password hashes) to the "EV Exec Database Backup"
-- Supabase project (xrcrwcejxkcowhrfbmgq, formerly FYStay). Free: both
-- projects already exist on the free plan.
--
-- The backup project keeps 30 rotating daily copies in private.evexec_backups
-- and only accepts writes carrying the shared secret stored here in the vault
-- as 'evexec_backup_secret'.
--
-- Restore one table from a night's copy (run in the backup project to read,
-- then insert here):
--   select rows from private.evexec_backups where table_name = 'public.bookings'
--    order by taken_at desc limit 1;
--   insert into public.bookings
--   select * from jsonb_populate_recordset(null::public.bookings, '<rows>');

create or replace function private.run_evexec_backup()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  url constant text := 'https://xrcrwcejxkcowhrfbmgq.supabase.co/rest/v1/rpc/store_evexec_backup';
  key constant text := 'sb_publishable_5x6A7BtHKULnjllWEcNSpw_G7xUrPtm';
  secret text;
  run uuid := gen_random_uuid();
  t record;
  rows jsonb;
  sent int := 0;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'evexec_backup_secret';
  if secret is null then raise exception 'evexec_backup_secret missing from vault'; end if;

  for t in
    select table_schema, table_name from information_schema.tables
     where table_schema in ('public', 'private') and table_type = 'BASE TABLE'
     order by 1, 2
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from %I.%I x', t.table_schema, t.table_name) into rows;
    perform net.http_post(
      url := url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', key),
      body := jsonb_build_object('p_secret', secret, 'p_run_id', run, 'p_table', t.table_schema || '.' || t.table_name, 'p_rows', rows),
      timeout_milliseconds := 30000);
    sent := sent + 1;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', u.id, 'email', u.email, 'phone', u.phone, 'created_at', u.created_at,
           'email_confirmed_at', u.email_confirmed_at, 'last_sign_in_at', u.last_sign_in_at,
           'raw_user_meta_data', u.raw_user_meta_data)), '[]'::jsonb)
    into rows from auth.users u;
  perform net.http_post(
    url := url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', key),
    body := jsonb_build_object('p_secret', secret, 'p_run_id', run, 'p_table', 'auth.users', 'p_rows', rows),
    timeout_milliseconds := 30000);

  return sent + 1;
end;
$$;
revoke all on function private.run_evexec_backup() from public, anon, authenticated;

select cron.schedule('nightly-database-backup', '17 2 * * *', 'select private.run_evexec_backup()');
