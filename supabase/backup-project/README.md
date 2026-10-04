# EV Exec Database Backup project

Supabase project `xrcrwcejxkcowhrfbmgq` (Frankfurt, free plan; formerly FYStay,
which now has its own project). Receives a nightly copy of the EV Exec
database from `private.run_evexec_backup()` (EV Exec project, pg_cron job
`nightly-database-backup`, 02:17 UTC). See
`../migrations/20261004210000_nightly_backup.sql`.

Applied to this project (migration `evexec_backup_store`):

- `private.evexec_backups (slot, table_name, run_id, taken_at, row_count, rows jsonb)`:
  30 rotating daily slots, one row per table per night. Each night overwrites
  the copy from 30 days earlier. Not readable through the API.
- `private.backup_settings`: bcrypt hash of the shared secret (the plain secret
  is the vault secret `evexec_backup_secret` in the EV Exec project).
- `public.store_evexec_backup(p_secret, p_run_id, p_table, p_rows)`: the only
  way in; rejects anything without the secret.

Restore a table: in this project,
`select rows from private.evexec_backups where table_name = 'public.bookings' order by taken_at desc limit 1;`
then in the EV Exec project,
`insert into public.bookings select * from jsonb_populate_recordset(null::public.bookings, '<rows>');`

`auth.users` is copied without password hashes; restored customers reset
their password.

Old FYStay prototype tables, edge functions and data are still in this project
(its two pg_cron jobs were stopped 2026-10-04).
