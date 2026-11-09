# Database tests

`database/rls_and_guards.test.sql` is a pgTAP suite for the shared EV Exec
database (website, Operator app, Driver App). It checks who can read and change
bookings, drivers and the other staff tables, per role and per operator
business, and that the guard triggers hold.

- 70 assertions. On 09/11/2026 against the live project: 67 pass, 3 are known
  gaps inside TODO blocks (app-role TRUNCATE/REFERENCES/TRIGGER grants, drivers
  seeing open requests, no-show as its own status).
- It runs in one transaction and rolls back. It creates its own two test
  businesses and does not read or change real rows.
- Do not complete a priced booking in a test: that uses up an invoice number
  even after a rollback.

## Running it

**Local or CI (standard):** `supabase test db`. This needs a local database
built from migrations, which is not possible yet: the migration history is
split across the three repos and has drifted from the live schema. It becomes
possible once a baseline migration is generated from the live schema.

**Against the live project (how it was run on 09/11/2026):** run the file as a
single query through the Supabase SQL tools. pgTAP 1.3.3 returns one row per
assertion, and a multi-statement query only returns the last result, so for
that run each `select is(...)`, `lives_ok`, `throws_ok`, `is_empty`, `set_eq`
and `has_trigger` was prefixed with `insert into _out` (a temp table created
after `no_plan()`, with `grant all on _out to public`), and
`select * from finish();` was replaced by a select from `_out`. The trailing
`rollback;` stays.

## When a TODO starts passing

pgTAP reports it as "TODO passed". Move the assertion out of its
`todo_start` / `todo_end` block so it is enforced from then on.
