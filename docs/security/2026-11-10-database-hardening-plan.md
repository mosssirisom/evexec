# Database hardening plan: grants and driver access

Date: 10/11/2026. Project: `yoltkmhtxwluqxxpewbl`.

**Status: stage 1 applied 10/11/2026** (migration `20261110064237_hardening_stage1_grants_and_driver_booking_policies`, approved by the owner). Stages 2 and 3 and the decision items are still proposals. See section 6 for the results.

The audit was read-only (SELECT queries on the catalogue, policies, grants,
usage statistics, plus the three repos' `main` branches). Sections 1 to 5 are
the plan as approved; only the stage 1 statements have been run.

## 1. What was checked

- Table, view, sequence, schema and function grants for `anon`, `authenticated`, `service_role`; default privileges.
- All row-level security policies in `public` and `storage`.
- The guard triggers and status-transition trigger definitions.
- `pg_stat_statements` since 22/05/2026: which tables and functions each API role has actually used.
- App code on `main`: Driver App, Operator app (Next.js), website.
- Live migration list against the repos.

Not checked: Supabase Auth settings (email confirmation, secure email change), Vercel deployments (no access from this session), edge function source beyond what the repos hold.

## 2. Findings

No vulnerability that is exploitable today was found. The items below are ranked by what they become as soon as there is a second driver or a second business.

| # | Severity | Finding | Evidence |
|---|---|---|---|
| F1 | High (latent) | Any driver can read every booking in their business that has no driver and status `pending` or `accepted`: whole row, including customer name, phone and email. 0 rows match today; `pending` is the column default, so one insert that omits `status` exposes a booking. No app reads these rows. | Policy `bookings_driver_select`, third clause. Driver App `main`: every bookings query filters `assigned_driver_id = <own id>`. |
| F2 | High for SaaS, low today | Driver policies on bookings key on `assigned_driver_id` only, not the business. If office staff of business B assign a driver id from business A (the foreign key allows it), driver A reads B's booking. Nothing validates that a booking's driver belongs to the booking's business. | Policies `bookings_driver_select`, `bookings_driver_update`; no tenant check in `sync_*` triggers. One business today. |
| F3 | Medium | Six policies also treat a login as a driver when its **email** equals a driver row's email. The two partner drivers have no login; an account registered with a partner's address reads that partner's jobs and driver record. | `bookings_driver_select`, `drivers_self_select`, `driver_own_locations`, `driver_select_own_sms_reminders`, `driver_select_flight_verifications`, `driver_insert_job_proofs`. The one app driver's login id equals their driver id, so email matching is not needed. |
| F4 | Medium (hardening) | `anon` and `authenticated` hold TRUNCATE, REFERENCES and TRIGGER on 30 tables and 2 views. TRUNCATE ignores row-level security. The REST API cannot issue any of the three, and no API role ever has (statistics since May), so this is defence in depth, not an open hole. | `has_table_privilege` matrix; `pg_stat_statements`. |
| F5 | Medium (hardening) | Default privileges give `anon` and `authenticated` every right on every new table, sequence and function in `public`. Any revoke is undone for the next table created. | `pg_default_acl` for `postgres` and `supabase_admin`. |
| F6 | Medium | A driver can set their own job to `Cancelled` from `Dispatched` (allowed by both the guard and the transition trigger). That cancels a future job and starts the customer cancellation notice. The app only uses it for no-shows. To be confirmed by the test before any change. | `guard_driver_booking_update` (`driver_statuses`), `enforce_booking_status_transition`. |
| F7 | Medium (privacy) | A driver reads the whole row of each of their jobs, past ones included: customer email, `stripe_session_id`, `user_id`, cancellation charge. The app shows name, phone and email. Column rights cannot differ between drivers and staff (same database role), so this needs a view or function, not a grant change. | Driver App uses `select('*')`. |
| F8 | Low | `anon` holds SELECT/INSERT/UPDATE/DELETE on 30 tables. Row-level security returns nothing. Only three anon policies exist (contact form, quote form, reviews) and no code on `main` uses them; the website writes with the service role. | Policies; code search; statistics show old anon dashboard queries (before June hardening). |
| F9 | Low | `anon` and `authenticated` hold rights on sequences that are identity columns (no right needed). Only `invoice_seq` is needed, by `authenticated`, because `set_invoice_number()` runs as the caller. | Sequence ownership query; function definition. |
| F10 | Low | `get_booking_totals` and `get_booking_status_breakdown` are callable by `anon` (they return zeros under row-level security). | Function grants. |

### Conflicts with intended behaviour (not vulnerabilities)

- **No-show**: the guard lets a driver set `No Show`, the transition trigger refuses it from every status. The app therefore stores a no-show as `Cancelled` plus free text.
- **Payment**: the guard silently restores `payment_status` on a driver write; the Driver App reports success.
- **Second business**: `tenant_id` defaults to the EV Exec business on 15 tables, and the Operator app and Driver App do not send `tenant_id` on insert. A second business's inserts would be refused (safe, but broken).
- **`notification_channel_settings`**: one global row, writable by staff of any business.
- **Job photos**: no staff read policy on the `job-photos` bucket; the office cannot view them from the browser.

### Migration drift

- Live has 158 migrations; the repos hold 39 + 6 + 36 files (and Operator `main` 52), with different version numbers.
- Three live migrations exist in **no** repo: `office_push_staff_only`, `driver_alert_webhook_secret`, `driver_write_guards`. The last one is the driver guard itself.
- Operator repo migrations 002/003/004/006 still create open `anon` policies that live has since removed.
- **Branch bases**: this session's Operator branch was cut from an old Vite app, not from `main` (Next.js). The Operator half of the 09/11/2026 app audit and that branch's ESLint commit therefore describe old code. The Driver App branch is 11 commits behind `main`. The website branch is current.

## 3. Proposed changes

### Stage 1: no app change needed

| # | Change | Fixes | App impact |
|---|---|---|---|
| 1a | Revoke TRUNCATE, REFERENCES, TRIGGER on all tables and views in `public` from `anon`, `authenticated` | F4 | None: the API cannot use them and never has |
| 1b | Default privileges (role `postgres`, schema `public`): stop granting TRUNCATE, REFERENCES, TRIGGER to `anon`, `authenticated` on new tables | F5 (part) | None |
| 1c | `bookings_driver_select`: own assigned jobs only, same business, signed-in users only | F1, F2 (read), F3 (bookings) | None: every Driver App query already filters on the driver's own id |
| 1d | `bookings_driver_update`: add the same-business condition | F2 (write) | None |

```sql
-- 1a
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
-- 1b
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;
-- 1c
alter policy bookings_driver_select on public.bookings
  to authenticated
  using (
    assigned_driver_id = (select auth.uid())
    and tenant_id = (select d.tenant_id from public.drivers d where d.id = (select auth.uid()))
  );
-- 1d
alter policy bookings_driver_update on public.bookings
  to authenticated
  using (
    assigned_driver_id = (select auth.uid())
    and tenant_id = (select d.tenant_id from public.drivers d where d.id = (select auth.uid()))
  )
  with check (
    assigned_driver_id = (select auth.uid())
    and tenant_id = (select d.tenant_id from public.drivers d where d.id = (select auth.uid()))
  );
```

**Stays as it is:** SELECT/INSERT/UPDATE/DELETE for `authenticated` on every table it has today; everything held by `service_role`; `staff_all_*` policies; `customers_see_own_bookings`; both guard triggers; EXECUTE on `get_push_dispatch_bundle` for `anon` (the Operator app's push sender calls it without a login); USAGE on `invoice_seq` for `authenticated`.

### Stage 2: recommended, after stage 1 has run cleanly

| # | Change | Fixes | App impact |
|---|---|---|---|
| 2a | Match drivers by login id only in `drivers_self_select`, `driver_own_locations`, `driver_select_own_sms_reminders`, `driver_select_flight_verifications`, `driver_insert_job_proofs` | F3 | None for the current driver (login id = driver id). A driver whose login was not created by the invite flow would lose access; none exists |
| 2b | Revoke all sequence rights from `anon`; from `authenticated` on all but `invoice_seq` | F9 | None expected (identity columns) |
| 2c | Revoke EXECUTE on the two booking-total functions from `anon` | F10 | None (Operator app calls them signed in) |

### Stage 3: needs an app check first

| # | Change | Fixes | Why not now |
|---|---|---|---|
| 3a | Revoke `anon` table rights except INSERT on `contact_messages`, `quote_requests` and SELECT on `reviews`; same for default privileges | F8, F5 | A query sent before the session is restored returns an empty list today and would return "permission denied" afterwards. Needs a run-through of the Operator app and Driver App sign-in screens on a preview first |

### Needs a decision or an app change (not proposed for deployment yet)

- F6: stop drivers cancelling a job that has not started, and allow `Arrived → No Show`. Needs the Driver App to send `No Show` first.
- F7: a driver-facing view or function with only the columns a driver needs, and contact details hidden after completion.
- F2 (root cause): refuse a driver assignment across businesses at write time.
- Baseline migration from the live schema, including the three live-only migrations.

## 4. Rollback

Each stage is one migration with no DROP statements. To undo stage 1:

```sql
-- 1c / 1d: the exact expressions live on 10/11/2026
alter policy bookings_driver_select on public.bookings to public
  using (
    (assigned_driver_id = auth.uid())
    or (assigned_driver_id in (select drivers.id from drivers where drivers.email = auth.email()))
    or ((exists (select 1 from drivers d where d.id = auth.uid() and d.tenant_id = bookings.tenant_id))
        and assigned_driver_id is null and status = any (array['pending'::text, 'accepted'::text]))
  );
alter policy bookings_driver_update on public.bookings to public
  using (assigned_driver_id = (select auth.uid()))
  with check (assigned_driver_id = (select auth.uid()));
-- 1b
alter default privileges for role postgres in schema public
  grant truncate, references, trigger on tables to anon, authenticated;
-- 1a: only the 30 tables and 2 views that held the rights before (not push_config,
-- stripe_webhook_events, stripe_webhook_rejections, profiles, points_transactions)
grant truncate, references, trigger on
  audit_log, booking_audit_log, booking_expenses, booking_photos, bookings, contact_messages,
  driver_events, driver_locations, driver_messages, driver_shifts, driver_sms_reminders,
  driver_unavailable_dates, drivers, error_log, flight_verification_settings, flight_verifications,
  invoices, job_proofs, missed_calls, notification_channel_settings, notification_log,
  notification_queue, operator_push_subscriptions, operator_sms_tasks, push_subscriptions,
  quote_requests, reviews, saved_addresses, tenant_users, tenants,
  notification_log_dashboard, notification_queue_dashboard
  to anon, authenticated;
```

Policy and grant changes take effect at once and hold no data, so rollback loses nothing.

## 5. Testing and verification

Suite: `supabase/tests/database/rls_and_guards.test.sql` (99 assertions). 70 were run on 09/11/2026 (67 pass, 3 known gaps). The 29 added on 10/11/2026 have not been run.

| Requirement | Covered by |
|---|---|
| Driver access to assigned jobs | Section 6: sees own jobs; En Route, Arrived, Passenger On Board, confirm job, record reminder |
| Driver access to unassigned jobs | Section 6: Unassigned not visible; open `pending` request (TODO, passes after 1c) |
| Driver access to other businesses' data | Section 6: other business's job not visible; job assigned across businesses (TODO, passes after 1c) |
| Modify payment status | Section 6: write raises no error, value unchanged |
| Modify job pricing | Section 6: refused |
| Change driver assignment | Section 6: hand over refused, unassign refused, job unchanged |
| Legitimate status updates | Section 6 |
| Office staff and administrator | Sections 3, 4 (two businesses) and 9 (super admin) |
| Service role | Section 10 and the "must keep" grant checks in section 1 |
| Grants that must remain | Section 1 (fails if a revoke removes something the apps use) |

Order of work, each step needing approval:

1. Run the extended suite against live in one rolled-back transaction, to confirm the 29 new assertions describe today's behaviour. Any that fail outside a TODO block are reported and fixed in the test or the plan before going further.
2. Apply stage 1 as one migration; commit the same SQL to the repo.
3. Re-run the suite. Expected: the stage 1 TODO assertions now pass; everything else unchanged. Move them out of their TODO blocks.
4. Smoke check with a real login: Driver App job list and one status change on a test booking; Operator app bookings list, assign a driver.
5. Watch the API and database logs for 24 hours for "permission denied" (42501).
6. Only then propose stage 2.

A failed assertion is never worked around: either the change is wrong or the test is, and which one is reported.

## 6. Stage 1 results (10/11/2026)

1. **Baseline, before any change.** Extended suite run against live in a rolled-back transaction: 99 assertions, 89 pass, 10 fail, all 10 inside TODO blocks. This confirmed F6 (a driver can cancel a Dispatched job) and F3 (a login sharing a partner's email reads that partner's job and driver record).
2. **Dry run.** The four statements plus targeted checks in a rolled-back transaction: all as expected.
3. **Applied** as one migration, no DROP statements.
4. **After.** Suite re-run: 99 assertions, 94 pass. The four stage 1 checks now pass and are enforced (moved out of their TODO blocks), and the bookings half of the same-email check passes too. The 5 remaining failures are the open items: sequence rights (stage 2), visitor table rights (stage 3), driver record matched by email (stage 2), driver cancelling an unstarted job, and No Show as a status.
5. **Left behind:** nothing (no test rows, no pgTAP extension).

Found along the way:

- The one app driver's login also holds the `operator_admin` role, so that account reads every booking through the staff policy and is not subject to the driver guard. No real account uses the driver-only path today; the test fixtures are what exercise it. The "driver's Paid write is silently put back" behaviour therefore applies to driver-only logins, not to this account.
- `anon` and `authenticated` also hold MAINTAIN (PostgreSQL 17: VACUUM, ANALYZE, REINDEX, LOCK TABLE) on tables, and default privileges still grant it. Not reachable through the API. Candidate for stage 2.

Still to do for stage 1: a sign-in check in the Driver App and Operator app by a person, and a look at the logs for "permission denied" (42501) after a day of normal use.
