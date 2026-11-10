# Database hardening plan: grants and driver access

Date: 10/11/2026. Project: `yoltkmhtxwluqxxpewbl`.

**Status: stages 1, 2 and 3 applied 10/11/2026** (migrations `20261110064237_hardening_stage1_grants_and_driver_booking_policies`, `20261110130556_hardening_stage2_driver_id_only_sequences_functions_maintain` and `20261110131520_hardening_stage3_visitor_table_rights`, all approved by the owner). The driver cancel and No Show rules were applied the same day (migration `20261110133454_driver_no_show_status_and_cancel_rule`). See sections 6 to 9 for the results.

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

## 7. Stage 2 results (10/11/2026)

Applied as one migration, no DROP statements: 2a (drivers matched by login id only in five policies), 2b (sequence rights), 2c (booking-total functions), plus 2d, approved as an extra: MAINTAIN revoked from app roles on tables and from default privileges.

1. **Dry run first.** The statements plus 26 behaviour checks in a rolled-back transaction: all as expected. A driver-only login keeps its own record, job, location, reminders, flight check and proof upload; a login that only shares a driver's email sees nothing and cannot write that driver's location or proofs; staff edits still write the audit log and driver events (identity tables); the push sender's function still answers a visitor; the totals functions refuse a visitor and still work signed in.
2. **Correction to the plan as written.** The two totals functions were executable by `PUBLIC`, so revoking from `anon` alone would have changed nothing. The migration revokes from `PUBLIC` and `anon`; `authenticated` and `service_role` hold their own grants.
3. **After.** Suite extended to 103 assertions and re-run against live: 100 pass. The stage 2 checks are enforced, with four new ones (no policy decides by email, visitors cannot call the totals functions, signed-in users still can, no MAINTAIN for app roles). The 3 remaining failures are the open items: visitor table rights (stage 3), a driver cancelling an unstarted job, and No Show as a status.
4. **Real data.** The owner's login (driver and office admin) reads the same totals as before: 81 bookings, 3 drivers, 24 reminders, 34 flight checks, 12 invoices.
5. **Left behind:** nothing.

Not tested: staff creating an invoice (a test invoice uses up a real number even when rolled back); the right to draw a number is confirmed held.

Decision recorded 10/11/2026: the owner's login keeps both the `driver` and `operator_admin` roles. Any other driver should be driver-only: an office role on a driver login gives it every booking in the business.

### Rollback for stage 2

```sql
alter policy drivers_self_select on public.drivers to public
  using ((email = (select auth.email())) or ((select auth.uid()) = id));
alter policy driver_own_locations on public.driver_locations
  using ((driver_id = (select auth.uid())) or (driver_id in (select drivers.id from drivers where drivers.email = (select auth.email()))))
  with check ((driver_id = (select auth.uid())) or (driver_id in (select drivers.id from drivers where drivers.email = (select auth.email()))));
alter policy driver_select_own_sms_reminders on public.driver_sms_reminders to public
  using ((driver_id = auth.uid()) or (driver_id in (select drivers.id from drivers where drivers.email = auth.email())));
alter policy driver_select_flight_verifications on public.flight_verifications to public
  using (exists (select 1 from bookings b where b.id = flight_verifications.booking_id
    and ((b.assigned_driver_id = auth.uid()) or (b.assigned_driver_id in (select drivers.id from drivers where drivers.email = auth.email())))));
alter policy driver_insert_job_proofs on public.job_proofs
  with check (exists (select 1 from bookings b where b.id = job_proofs.booking_id
    and ((b.assigned_driver_id = (select auth.uid())) or (b.assigned_driver_id in (select drivers.id from drivers where drivers.email = (select auth.email()))))));
grant usage, select, update on all sequences in schema public to anon, authenticated;
grant execute on function public.get_booking_totals(timestamptz), public.get_booking_status_breakdown(timestamptz) to public, anon;
alter default privileges for role postgres in schema public grant maintain on tables to anon, authenticated;
-- MAINTAIN on the same 30 tables and 2 views listed in section 4, plus profiles
-- (33 objects held it before): grant maintain on <list> to anon, authenticated;
```

## 8. Stage 3 results (10/11/2026)

Visitors who are not signed in now hold only INSERT on `contact_messages` and `quote_requests` and SELECT on `reviews`. New tables created by `postgres` grant visitors nothing.

**App check before applying** (code on `main` of all three apps, plus database usage):

- No app sends a table query without a signed-in user. The website does all table access on its server with the service role (its two calls that carry the visitor key also carry the user's token). The Operator app mounts its data screens only when signed in (`src/app/operator/layout.jsx`). The Driver App redirects to the login page in middleware. Server routes and edge functions that hold the visitor key pass the caller's token with it, or only verify the token.
- Usage statistics: the visitor role's table-query counts at 13:14 UTC were identical to the 06:00 snapshot, across a day in which both apps were used. The only visitor call in use is `get_push_dispatch_bundle`, which is kept.
- Not done: a run-through in a browser. The check rests on the code and the usage statistics.

**Behaviour change to expect:** if a session expires while the Operator app or Driver App is open, a background refresh used to return an empty list; it now returns a "permission denied" error until the login screen appears.

**Dry run** (rolled back): visitor reads of ten tables and views refused, reviews readable, contact and quote form inserts pass the permission check, push sender function answers, the owner's login and the service role read the same totals as before.

**After:** suite updated (visitor reads and updates are now refused rather than returning nothing; visitors keep their three rights) and re-run against live: 105 assertions, 103 pass. The 2 remaining failures are the decision items: a driver cancelling a job that has not started, and No Show as a status. Nothing left behind.

### Rollback for stage 3

```sql
grant select, insert, update, delete on
  audit_log, booking_audit_log, booking_expenses, booking_photos, bookings, contact_messages,
  driver_events, driver_locations, driver_messages, driver_shifts, driver_sms_reminders,
  driver_unavailable_dates, drivers, error_log, flight_verification_settings, flight_verifications,
  invoices, job_proofs, missed_calls, notification_channel_settings, notification_log,
  notification_queue, operator_push_subscriptions, operator_sms_tasks, push_subscriptions,
  quote_requests, reviews, saved_addresses, tenant_users, tenants,
  notification_log_dashboard, notification_queue_dashboard
  to anon;
alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to anon;
```

## 9. Driver cancel rule and No Show status (10/11/2026)

Approved by the owner; database part only. The Driver App is unchanged and keeps working.

**What changed**

1. `enforce_booking_status_transition`: `No Show` is allowed from En Route or Arrived. The office can reopen a no-show to Unassigned, as it can a cancellation; nothing else leaves No Show.
2. `guard_driver_booking_update`: a driver-only login may set `Cancelled` or `No Show` only from En Route or Arrived. Cancelling a job that has not started, or one with the passenger on board, is refused with "Drivers can only record a no-show after setting off or arriving. Ask the office to cancel this job."
3. `prevent_driver_double_booking`: a `No Show` job no longer holds the driver's slot (it was treated as a live job).

**Why the driver may still set Cancelled from En Route or Arrived:** that is what the Driver App's no-show button sends today (Cancelled plus a "[No Show]" note). Refusing it now would break the button.

**Checked before applying** (rolled back): 14 behaviour checks, all as expected, including the app's current no-show button, a normal job through to Completed, the office cancelling an unstarted job, and the double-booking check both ways.

**After:** suite extended to 112 assertions and run against live: 112 pass. No TODO blocks remain. Nothing left behind; live bookings unchanged (81: 60 Completed, 19 Dispatched, 2 Unassigned).

**Found along the way**

- Today a driver's no-show sends the customer "your booking has been cancelled", because it is stored as Cancelled. A real `No Show` status sends the customer nothing. Nothing tells the office about a no-show either way, apart from the status on the booking.
- The owner's login is also an office admin, so these driver rules do not apply to it.

**Still to do (Driver App, then one more database step)**

1. **Driver App: done 10/11/2026** (branch `claude/sweet-meitner-med7lt` of `evexecdriverapp`, commit `0565756`, after merging its 11 missing `main` commits). The no-show button sends `status: 'No Show'` (keeping the note), the job screen treats `No Show` as finished and still recognises older Cancelled-plus-note no-shows, and the in-app "Job cancelled" pop-up stays quiet for the driver's own no-show. Type check, lint (0 errors) and a production build pass. **Not live until that branch is merged to the Driver App's `main` and deployed.**
2. **Decision (owner, 10/11/2026: go with the recommendation):**
   - **Office: yes.** A driver's no-show sends a push to every office device (Operator app), opening that booking. Nothing alerts the office today; the 17/10 migration only silences the driver's own alert. Build: an AFTER UPDATE trigger on `bookings` (status becomes `No Show`) posting to the Operator app's `/api/push/dispatch` with the notification override, the same way the new-booking and payment alerts do. Live database change, not yet built.
   - **Customer: nothing automatic.** A real `No Show` status sends the customer nothing (the cancellation notice only fires for `Cancelled`). Terms section 7.3 says the office contacts the customer and decides the charge, so a "your booking has been cancelled" message from the app would be wrong. The office can still send a text from Today, Texts to send.
3. **Then remove `Cancelled` from what a driver may set at all** (live database change). **Only after** the new Driver App is live and open tabs have refreshed, otherwise the old button (which sends `Cancelled`) fails with a permission error. Check first that no `Cancelled` plus "[No Show]" note update has come from a driver since the deploy.

### Rollback

Re-run the same kind of replacement in reverse: remove `, 'No Show'` from the two transition arrays and the `IF NEW.status = 'Unassigned'` line under No Show; remove the "A driver may end a job only at the pickup stage" block from the guard; change `('Completed', 'Cancelled', 'No Show')` back to `('Completed', 'Cancelled')` in the double-booking check (two places). No data is involved.
