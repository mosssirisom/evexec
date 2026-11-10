# Database baseline (for tests)

`schema.sql` is the structure of the live EV Exec database: tables, constraints,
indexes, functions, triggers, row-level security, policies and access rights.
It lets the database tests run on a throwaway local Postgres, without touching
the live project.

- Taken from the live project on 10/11/2026, after migration `20261110200525`.
- It holds no customer data, no secrets and no scheduled jobs. The only row it
  adds is the first business (`ev-exec`, name only) and the four storage buckets.
- It is **not a migration**. It is never applied to the live project, and it
  does not replace `supabase/migrations/` (the record of what was applied).

## Run the tests locally

```
scripts/db-test.sh
```

Needs Postgres 17 with pgTAP (Ubuntu: `postgresql-17` and `postgresql-17-pgtap`
from apt.postgresql.org). The script starts a temporary database, loads
`local_stubs.sql` and `schema.sql`, runs every
`supabase/tests/database/*.test.sql`, then deletes the database. It exits with
an error if any check fails.

`local_stubs.sql` stands in for what a Supabase project provides and plain
Postgres does not: the `anon`, `authenticated` and `service_role` roles, the
`auth` helpers (`auth.uid()` and friends), a minimal `auth.users`, storage
tables, an empty vault, and a `net.http_post` that sends nothing.

## Keep it in step with live

Whenever a migration is applied to the live project, rebuild the baseline:

1. Run `generate.sql` on the live project (read-only) and save the rows it
   returns as a JSON array, `rows.json`.
2. `python3 supabase/baseline/assemble.py rows.json > supabase/baseline/schema.sql`
3. Check for secrets before committing (keys, tokens). Function bodies are
   copied as they are.
4. `scripts/db-test.sh`

**Check that it still matches live:** run `fingerprint.sql` on the live project
and compare with `DB_TEST_FINGERPRINT=1 scripts/db-test.sh`. Every row
(count and checksum) should be equal. On 10/11/2026 all 15 rows were equal.

## Limits

- Triggers that call out (push alerts, driver alerts, backup) send nothing
  locally, and there are no vault secrets, so those paths are not tested.
- The five scheduled jobs on live are listed at the end of `schema.sql` by name
  only.
- Supabase's own schemas (`auth`, `storage`, `realtime`) are stand-ins, so
  sign-in, file upload and realtime behaviour are not tested here.
- Local Postgres is 17.x from apt; live is Supabase Postgres 17.6.
