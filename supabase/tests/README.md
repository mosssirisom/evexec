# Database tests

`database/rls_and_guards.test.sql` is a pgTAP suite for the shared EV Exec
database (website, Operator app, Driver App). It checks who can read and change
bookings, drivers and the other staff tables, per role and per operator
business, and that the guard triggers hold.

- 113 assertions. Last run against the live project on 10/11/2026, after
  hardening stages 1 to 3 and the driver cancel / No Show rules (drivers can
  no longer set Cancelled at all): all 113 pass. There are no known gaps (TODO blocks) at present.
  See `docs/security/2026-11-10-database-hardening-plan.md`.
- It runs in one transaction and rolls back. It creates its own two test
  businesses and does not read or change real rows.
- Do not complete a priced booking in a test: that uses up an invoice number
  even after a rollback.

## Running it

**Locally (standard since 10/11/2026):** `scripts/db-test.sh`. It builds a
throwaway Postgres 17 from `supabase/baseline/` (the structure of the live
database, see its README), runs the suite and deletes the database. Nothing
touches the live project. Needs `postgresql-17` and `postgresql-17-pgtap`.
`supabase test db` is still not possible: the migration history does not build
from scratch.

**Against the live project (how it was run on 09/11/2026 and 10/11/2026; still the final check after a migration is applied):** run the file as a
single query through the Supabase SQL tools. pgTAP 1.3.3 returns one row per
assertion, and a multi-statement query only returns the last result, so for
that run each `select is(...)`, `ok`, `lives_ok`, `throws_ok`, `is_empty`, `set_eq`
and `has_trigger` was prefixed with `insert into _out` (a temp table created
after `no_plan()`, with `grant all on _out to public`), and
`select * from finish();` was replaced by a select from `_out`. The trailing
`rollback;` stays.

## When a TODO starts passing

pgTAP reports it as "TODO passed". Move the assertion out of its
`todo_start` / `todo_end` block so it is enforced from then on.
