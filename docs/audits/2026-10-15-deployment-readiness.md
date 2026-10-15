# Deployment readiness pack: five urgent fixes

**Date:** 15/10/2026 · **Status:** P1 applied 15/10/2026 (see below); everything else awaiting approval. No branch merged, no app or function deployed.

> **P1 applied 15/10/2026**, after the extra secret-exposure check (anon and signed-in callers get nothing from `get_push_dispatch_bundle` with a wrong, empty, null, one-character-short, padded or case-changed secret; no other callable function returns the private key or subscriptions).
> - Migration version `20261015035414`, name `office_push_staff_only` (repo file `20261015030000_office_push_staff_only.sql`, sha256 `a74cf466…cd2da`).
> - Checksums after: `register_operator_push` `0be19ff009c846551c78f1b648ae23db`, `get_push_dispatch_bundle` `b5d88aa0c85d582722e72b39c2edc0d9`.
> - Grants unchanged: `register_operator_push` postgres, service_role, authenticated; `get_push_dispatch_bundle` postgres, service_role, anon, authenticated.
> - A signed-in non-staff caller is now refused (42501); the 2 staff devices are still returned.
> - Rollback: `supabase/rollback/20261015030000_office_push_staff_only.rollback.sql`. Not needed so far.

## 1. Branches and commits

| Repo | Branch | Base (`main`, unchanged on GitHub) | Tip | Commits | Diff |
|---|---|---|---|---|---|
| `evexec` | `claude/security-fixes-p0` | `42696d0` | `a6bcbe0` | 9 | 16 files, +1,366 / −3 |
| `evexecoperator` | `claude/security-fixes-p0` | `6501ff6` | `c9467f1` | 2 | 3 files, +211 / −25 |
| `evexecdriverapp` | `claude/security-fixes-p0` | `e531b6e` | `65fe968` | 4 | 14 files, +744 / −284 |

The audit branch `claude/phase-1-audit` (`d69f79f`) is preserved and has not been changed.

### Which commit belongs to which fix

| Fix | `evexec` | `evexecoperator` | `evexecdriverapp` |
|---|---|---|---|
| Test harness | `788e2fe` | | |
| 1. Office push, staff only | `710293a` (migration `20261015030000`), tests extended in `7b9d2c6` | `f1d8fdd`, `c9467f1` | |
| 2. Driver-alert secret | `db9fa11`, `a6bcbe0` (migration `20261015031000`, `api/account` change) | | `74ef398`, `65fe968` |
| 3. Driver write limits | `7758325`, `dc2b27a` (migration `20261015032000`) | | |
| 4. Driver payment | `2da5ef7`, `7b9d2c6` (migration `20261015033000`) | | `6e59666`, `e6f5b8a` (receipt wording) |
| 5. Function retirement | `223268b` (plan only) | | |

### Overlap and dependencies

- **Fix 3 and Fix 4 overlap.** Both define `private.guard_driver_booking_update()`; Fix 4 replaces Fix 3's version. **Apply `20261015032000` and `20261015033000` in one transaction.** Fix 3 on its own would refuse the old Driver App's Card completion (it sends `payment_status = 'Paid'`). Fix 4's version resets that field instead of refusing the update.
- **Fix 2 has an order dependency.** Apply the migration (it creates the Vault secret and the RPC) **before** deploying the two functions. If the functions go first, they find no secret and refuse every call, so driver alerts stop until the migration is applied.
- **Fix 2 carries an older dependency with it.** The live `send-push` (v9) and `notify-job-update` (v9) were deployed before Driver App commit `b1773d5` (06/10/2026), and so were `send-journey-receipt` (v11) and others. Deploying the branch versions also ships `b1773d5`:
  - Driver job-update and cancellation **emails** move from a direct Resend call to the shared queue (`notification_queue`). The website sends them within a minute and re-renders them in the house template (`lib/emailQueueRender.js`: `job_updated`, `job_cancelled`).
  - Live data shows this repairs a real failure. Since early September, 11 `job_updated` emails have failed with "RESEND_API_KEY not configured" (the latest on 01/10/2026).
  - Push-first: when a push reaches the driver, the generic fallback email is no longer also sent (`noEmailFallback`).
- **Fix 1** parts (migration, Operator route) are independent of each other and of Fixes 2 to 4.
- **The website merge is itself a production deploy.** `evexec/.github/workflows/deploy.yml` runs `vercel deploy --prod` on every push to `main`. The merge also ships Fix 2's `api/account` change (customers' booking lists no longer include driver ids or driver notes). No workflow in any repo applies migrations or deploys edge functions, so merging never changes the database.

## 2. Driver App update mechanism and compatibility

- **How drivers get updates:** the Driver App is a PWA served by Vercel from `main` (no app store).
  - `public/sw.js` installs with `skipWaiting()` and takes control with `clients.claim()`.
  - It fetches pages and assets **network-first**, using the cache only when offline.
  - So any page load or reload while online gets the newest build within seconds of the Vercel deploy.
- **What can't be guaranteed:** a phone that has had the app open since before the release keeps running the old JavaScript in memory until the page reloads (closing and reopening the app, a pull-to-refresh, or the OS discarding it). The app doesn't detect new versions, and Vercel skew protection isn't in use. **So there's no way to make sure every driver has the new version before the database rules go live.**
- **Resolution:** the database now accepts both versions, so release order doesn't matter (`7b9d2c6`).
  - Every write the old app makes was checked against `origin/main` `e531b6e`:
    - status swipes and their timestamps;
    - no-show;
    - driver notes;
    - pickup confirmation;
    - GPS;
    - reminder rows;
    - completion.
  - The only write the guards would have refused is `payment_status = 'Paid'` on Card or Bank Transfer completion.
  - The guard now keeps the stored `payment_status`, and the stored `payment_method` on Paid or Invoiced bookings, and lets the rest of the update through.
  - Tests `fix3_workflows` and `fix4_driver_payment` replay the old app's exact requests: they all succeed, and the job ends Completed and still Unpaid.
- **What a driver on the old build would notice:** after completing a Card job, their own screen shows "Paid" until it reloads; the database and the office see Unpaid / Card. Nothing fails.

## 3. Payment flow and receipts (end to end)

| Step | Who | Writes | Status / method after |
|---|---|---|---|
| Booking on website | website (service role) | new row | Unpaid / none |
| Customer pays online | Stripe → website `reconcileCheckoutSession` | conditional update | **Paid / Card** |
| Customer chooses cash | website `/api/payment/confirm-cash` | method | Unpaid / **Cash** |
| Operator payment link paid | Stripe webhook (`metadata[booking_ref]`) | as above | Paid / Card |
| Driver completes, booking unpaid | Driver App | status, `completed_at`, method picked | Completed, **Unpaid** / Cash, Card or Bank Transfer |
| Driver completes, booking Paid or Invoiced | Driver App | status, `completed_at` only | Completed, Paid or Invoiced unchanged |
| Office confirms the money | Operator app (staff) | `payment_status` | Paid |
| Invoice created | trigger `ensure_invoice_on_completion` | `invoices` row | invoice Outstanding until Paid |

**Status and method stay separate:**
- `payment_status` is written only by the website (Stripe, service role), the office, or SECURITY DEFINER functions.
- A driver can record a `payment_method` only while the booking is unpaid.
- Fix 4 enforces this in the app (`lib/completion.ts`) and in the database (guard).

**Receipts:**
- **Live today:** `send-journey-receipt` v11 has **no payment row at all** and sends directly through Resend. Only 1 of the 5 completed jobs in the last 60 days that have a customer email has `receipt_sent_at` set, so receipts may be failing for the same missing-key reason. Not investigated further; flagged.
- **Recommended wording** (`e6f5b8a`, `_shared/receiptWording.ts`, 12 tests; not deployed). Only a Paid booking is called a receipt or says "Paid".

| Booking state | Heading / subject | Payment row |
|---|---|---|
| Paid, Card or payment link | Journey receipt | Paid by card |
| Paid, Cash | Journey receipt | Paid in cash |
| Paid, Bank Transfer | Journey receipt | Paid by bank transfer |
| Invoiced (account) | Journey summary | Invoiced to your account |
| Unpaid, driver recorded Cash | Journey summary | Cash to your driver |
| Unpaid, driver recorded Card (card machine) | Journey summary | Card, confirmation to follow |
| Unpaid, Bank Transfer | Journey summary | Bank transfer, awaiting payment |
| Unpaid, payment link sent | Journey summary | Payment link sent, awaiting payment |
| Nothing recorded | Journey summary | Payment due |
| Auto-created return leg | Journey receipt | Included with booking EVX-… |

**Your decision:** the wording for driver-recorded Cash and Card ("Cash to your driver", "Card, confirmation to follow"). It avoids claiming the office has confirmed the money, and avoids "pending", which reads as "you still owe".

**Not changed:** `evexec/lib/format.js` `paymentLine()` (used in confirmation, payment and office emails) still has no Invoiced wording. An Invoiced booking with Bank Transfer reads "Bank transfer (payment pending)". Suggested follow-up: add "Invoiced to your account" there too.

## 4. Driver-alert shared secret (Fix 2 design)

- **Storage:** a dedicated random 256-bit value, generated inside the database by the migration (`extensions.gen_random_bytes(32)`) and stored in Supabase Vault as `driver_alert_webhook_secret`.
  - It never appears in a file, a migration, a log or this report.
  - It's separate from `push_config.webhook_secret`, the office-push secret the website and Operator app hold in Vercel. Leaking one doesn't open the other.
- **Who can read it** (checked live, read-only):
  - Vault tables: only `service_role` has grants.
  - `net.http_request_queue`, which holds outgoing request headers for a moment: no grants to `anon`, `authenticated` or `service_role`.
  - The functions read it through `public.driver_alert_webhook_secrets()`, a SECURITY DEFINER function with execute revoked from public, `anon` and `authenticated`. Tests confirm drivers and anonymous callers are refused.
- **Hardening in the same migration:**
  - `push_config` loses its unused `anon`/`authenticated` table grants. It's RLS-locked with no policies today, and every reader uses the service role or a SECURITY DEFINER function (checked in all three repos).
  - The triggers stop sending the anon key (send-push) and the Vault service key (notify-job-update) in `Authorization`. Both functions run with `verify_jwt` off, so that header was never checked.
- **Rejecting forged requests:**
  - A missing, empty or wrong `x-webhook-secret` gets 401, compared in constant time.
  - If the secret can't be loaded (database error, not configured), every request is refused.
  - The booking id must be a UUID, and the driver, customer and message all come from the database row, never from the request body. A request with the right secret but a different driver in the body still alerts only the booking's real driver.
  - Tests: `supabase/functions/tests/driver-alerts.test.ts` (13).
- **Rotation (no downtime):** copy the current value to `driver_alert_webhook_secret_previous`, update the current one, and delete `_previous` a few minutes later. The SQL is in the migration header. The functions accept both values in between; the triggers always send the current one. No Vercel or function redeploy is needed.

## 5. Fix 3 keeps every legitimate workflow

**Live checks (read-only):**
- **Triggers on `bookings`:** 15. Those that adjust the new row before the guard runs only rewrite `updated_at` or keep `driver_id` and `assigned_driver_id` equal, and 0 of 71 assigned bookings have those two out of step.
- **SECURITY DEFINER functions:** all 34 in `public`/`private` are owned by `postgres`, so the guard (which only restricts the `authenticated`/`anon` roles) doesn't apply to them.
- **Driver logins that rely on the old email match:** 0.
- **Customer update policy on `bookings`:** none, so customers were already blocked by RLS.

**Covered by tests (`fix3_workflows.test.sql` 23 checks, `fix3_driver_writes.test.sql` 28 checks):**

| Writer | How it writes | Result |
|---|---|---|
| Driver App (old and new) | driver token: confirm pickup, En Route, Arrived, POB, undo POB, notes, Completed, no-show (Cancelled + note), GPS, reminder rows | allowed |
| Driver App, anything else | driver token: price, customer details, tenant, assignment, accept/decline, office-only statuses, driver record type/email/tenant | refused (payment fields reset) |
| Operator app: admin, dispatcher | staff token | unchanged (any column, any status) |
| super_admin | token | unchanged |
| Owner who is also a driver | token with office role | unchanged |
| Website API, Stripe webhook, edge functions, cron sweeps, Operator `/api/drivers` | service role | unchanged |
| SECURITY DEFINER RPCs (`sync_my_invoices`, `sync_my_points`, payment helpers) | customer token → definer | unchanged |
| Customers, anonymous | token | unchanged (still no direct update) |

## 6. Fix 1 tests

- **Database** (`fix1_office_push.test.sql`, 15 checks). Customers, drivers and anonymous callers:
  - can't register a device;
  - can't insert into or delete from `operator_push_subscriptions` directly;
  - can't see office devices;
  - can't unregister a staff device.

  The dispatch bundle returns only devices of people who currently hold an office role: not a customer device stored before the fix, and not a removed dispatcher's. Staff can remove only their own device.
- **Operator app:**
  - `subscribe.test.ts` (6) covers who may subscribe and that unsubscribing removes only your own device.
  - `dispatch.test.ts` (5) shows staff still receive the new-booking alert and website notices on every device in the bundle, a wrong or missing secret sends nothing, and one dead device doesn't block the others.

## 7. Fix 5 dependency matrix

Checks run for every candidate:
- **Database:** `pg_proc` bodies, `cron.job` commands, 60 days of `cron.job_run_details`, trigger definitions, Supabase Database Webhooks (none exist).
- **Code:** all branches of all three repos (`git grep` over every remote branch, plus `git log -S` history), GitHub workflows (none call edge functions), Vercel crons (`/api/reminders/trigger`, `/api/notifications/retry`, `/api/flight/reverify` only).
- **Recent calls:** edge logs for the last 24 hours. These are used only as supporting evidence.

| Function | Cron | DB trigger / function | Database webhook | `main` code (3 repos) | Unmerged branches | Last commit touching it | External / infrequent use | Recommendation |
|---|---|---|---|---|---|---|---|---|
| `create-payment-link` | none | none | none | none | Operator `booking-flow-dependencies-iqo6ad` (20/06), `ev-exec-operator-dashboard-UhkQ8` (03/10), via `src/lib/edgeFunctions.js` | `d87e9cd` 10/06 | Possible: Stripe Payment Links created by it may still be live (not checked, see 9). Operator payment links now use `/api/payment-link` | Stub first (priority 1) |
| `track-flight` | none | none | none | none | Driver `saas-multi-tenant-architecture-vytreu` (20/08) | `4937857` 17/09 (removed) | FlightAware (paid, if a key is set) | Stub first (priority 1) |
| `check-flight` | none | none | none | none | the two Operator branches above | `26a23d2` 17/09 (removed) | AeroDataBox (paid); superseded by `verify-flight` | Stub |
| `send-sms` | none | none | none | none | the two Operator branches above | `1efe276` 11/06 | Twilio (dormant) | Stub |
| `notify-passenger-arrived` | none | none | none | none (call removed 24/09) | Driver `saas-multi-tenant-architecture-vytreu` | `251edd0` 03/10 | none known | Stub |
| `notify-operator-new-booking` | none | none (replaced by `/api/push/dispatch`, migration `20260907160100`) | none | none | none | `20260907160100` (re-pointed the trigger away) | none known | Stub |
| `set-vercel-env` | none | none | none | none | none | no source anywhere | already returns 410 | Delete after watch |

**Infrequent workflows considered** (none use a candidate):
- invoices (trigger + Operator);
- refunds and duplicate payments (website);
- payment links (Operator route);
- flight checks (`verify-flight`, Vercel cron 07:00);
- tenant admin (`manage-tenants`);
- nightly backup (pg_cron → FYStay);
- driver invites (`/api/drivers`).

No function is retired on 24 hours of logs. Each starts with a reversible 410 stub and a 14-day watch, per the retirement plan (`2026-10-15-edge-function-retirement-plan.md`).

## 8. Production changes, one by one (each needs your approval)

### Before any of them

Save the live definitions so rollback doesn't depend on the repo copies. Read-only; keep the output privately, because it contains the anon key literal:

```sql
select p.proname, pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('register_operator_push','get_push_dispatch_bundle','notify_driver_new_booking','notify_driver_job_update');
select policyname, tablename, qual, with_check from pg_policies
where policyname in ('bookings_driver_update','drivers_self_update','driver_update_own_sms_reminders');
```

Also, before every change:
- confirm GitHub `main` still points at the base commits in section 1;
- confirm no migration with a later timestamp has been applied (`list_migrations`).

### P1: Fix 1 database (`20261015030000_office_push_staff_only.sql`)

- **Change:** `register_operator_push` refuses non-office callers. `get_push_dispatch_bundle` returns only devices whose owner still holds an office role.
- **Pre-checks (read-only):**
  - Every row in `operator_push_subscriptions` belongs to an office user (15/10: 2 rows, both staff).
  - `push_config` row exists.
- **Apply:** the migration (one transaction).
- **Post-checks (read-only):**
  - `pg_get_functiondef` shows the new bodies.
  - The existing staff devices still appear in the bundle (count only, no values).
  - The next real new booking shows an Operator push on staff phones; ask the office to confirm.
- **Rollback:** re-run the two saved definitions.
- **Impact:** none for staff. Customers or drivers can no longer subscribe (they had no reason to).

> **P2 released 15/10/2026.** Operator `main` fast-forwarded `6501ff6` → `c9467f1` (commits `f1d8fdd`, `c9467f1` only; production diff = `src/app/api/push/subscribe/route.ts` + two test files). Vercel Production deployment `BQrFMihNW3rbyzYteNbESXCbFggR` (GitHub deployment 7085788988) reported success at 06:41:39 UTC; CI run 143 on `main` passed. Office push devices unchanged (2, both staff; same rows before and after). Previous production deployment for rollback: `5F9M44aoxmkjEyfJVTu9bDinA6T2` (from `6501ff6`).
> - **Route check passed, 15/10/2026 06:53:57 UTC** (sent from the production database with pg_net, user-approved, because the agent session can't reach Vercel): unauthenticated POST with no body → **401** `{"error":"Not authorised."}`; unauthenticated DELETE with a made-up endpoint → **401** `{"error":"Not authorised."}`; GET → **405** (empty body). The user's Safari visit at 07:51 BST showed a blank page, consistent with the 405. Office devices unchanged afterwards (2, both staff, same rows; no test rows). The user holds the Vercel rollback.
> - Open: the office confirms the next genuine website booking or payment alert reaches their phones (P1 + P2).
> - **Monitoring, 15/10/2026 06:58 UTC (read-only).** Window checked: 03:54:14 UTC (P1 applied) to 06:58:24 UTC. The request log held 00:59 to 06:58 UTC, so the whole window was within its ~6-hour retention.
>   - New bookings: 0. Bookings marked Paid: 0. Stripe webhook events: 0. Booking audit rows: 0.
>   - Alert route (`/api/push/dispatch`) replies in the log: 0. The 555 log entries in the window are the per-minute cron sweeps and the three route-check requests of 06:53:57.
>   - Office push devices: 2, both staff, same rows as before (fingerprint unchanged).
>   - **No end-to-end test was possible: no booking or payment occurred.** This is neither a pass nor a failure. A scheduled check (first at 09:56 UTC, then every 3 hours) keeps watching.
> - Open, outside P2: endpoint-takeover hardening; per-business device isolation before a second operator; lint (needs a Next 16 ESLint config); production runtime verification.

### P2: Fix 1 Operator app (merge `evexecoperator` `claude/security-fixes-p0` → `main`, Vercel deploy)

- **Change:** `/api/push/subscribe` requires a staff session; DELETE removes only the caller's own device.
- **Pre-checks:**
  - `npx vitest run` (204/204 locally);
  - `next build` (passes locally);
  - Vercel preview of the branch, where staff can still enable alerts.
- **Post-checks:**
  - An admin toggles "New-booking alerts" off and on in Settings and sees it succeed.
  - The Vercel function log shows 200.
- **Rollback:** Vercel → promote the previous production deployment, then revert the merge.
- **Impact:** none for staff.

### P3: Fix 2 database (`20261015031000_driver_alert_webhook_secret.sql`)

- **Change:**
  - creates the Vault secret and `driver_alert_webhook_secrets()`;
  - both triggers send `x-webhook-secret` and no `Authorization`;
  - revokes `anon`/`authenticated` grants on `push_config`.
- **Pre-checks:**
  - Both functions are still `verify_jwt = false` (the triggers stop sending a JWT).
  - Definitions saved (above).
- **Apply:** the migration.
- **Post-checks (read-only):**
  - `select count(*) from vault.secrets where name = 'driver_alert_webhook_secret'` = 1.
  - The trigger bodies contain `driver_alert_webhook_secret`.
  - The deployed v9 functions still answer the next real assignment: `notification_queue` gets a `job_assigned` push row (sent, or "No push subscription").
- **Rollback:** re-run the saved trigger definitions, then `grant all on public.push_config to anon, authenticated;`.
- **Impact:** none. The old functions ignore the new header.

### P4: Fix 2 edge functions (deploy `send-push` and `notify-job-update` from `evexecdriverapp` `65fe968`)

- **Pre-checks:**
  - P3 applied.
  - `npm run test:functions` (25/25).
  - `deno check` passes.
  - Archive the deployed v9 sources (`get_edge_function`) as the rollback copy.
- **Deploy:** both functions with `verify_jwt = false`, `_shared` included. This also ships `b1773d5` (queued driver emails, stops listed); see section 1.
- **Post-checks:**
  - A request without the header gets 401. This sends nothing; your approval covers the call itself.
  - The next real driver assignment or time change gets 200 in the edge logs and a `job_assigned` or `job_updated` row.
  - Any fallback email shows in `notification_queue` as pending, then sent within a minute.
- **Rollback:** redeploy the archived v9 sources. They work with P3 in place.
- **Impact:**
  - Drivers: the same pushes.
  - Fallback emails now actually arrive, in the house design.
  - Forged alerts are no longer possible.

### P5: Fixes 3 and 4 database (`20261015032000` + `20261015033000`, **one transaction**)

- **Change:**
  - column/status guard triggers `zz_guard_driver_booking_update` and `zz_guard_driver_record_update`;
  - driver payment fields reset;
  - three driver policies match by login id only.
- **Pre-checks (read-only, all 0):**
  - Bookings with `assigned_driver_id` ≠ `driver_id`.
  - Driver logins matched only by email.
  - Bookings currently mid-update (none needed; the change is instant).
- **Apply:** both files in one transaction.
- **Post-checks:**
  - Both triggers exist and are enabled.
  - The three policies' `qual` mention only `auth.uid()`.
  - Over the next jobs, drivers' status changes appear as normal in `booking_audit_log`; the office confirms nothing is stuck.
- **Rollback, instant:**
  ```sql
  alter table public.bookings disable trigger zz_guard_driver_booking_update;
  alter table public.drivers  disable trigger zz_guard_driver_record_update;
  ```
  Then re-run the three saved policy definitions.
- **Impact:**
  - Drivers: none on either app version.
  - Completing a Card job no longer marks it Paid; the office confirms payment (Today → "completed jobs unpaid" lists them).

### P6: Driver App release (merge `evexecdriverapp` `claude/security-fixes-p0` → `main`, Vercel deploy)

- **Change:**
  - the payment step says "Nothing to collect" on Paid/Invoiced jobs and labels Card as "Card machine";
  - completion never writes `payment_status`.
- **Pre-checks:**
  - `npm test` (7 + 25);
  - `tsc`;
  - `next build`;
  - Vercel preview walk-through with a test login: complete a job on a test booking in the preview only, with no live data.
- **Post-checks:** drivers reopen the app once.
- **Rollback:** promote the previous Vercel deployment.
- **Impact:** small screen change; safe in any order relative to P5.

### P7: Website release (merge `evexec` `claude/security-fixes-p0` → `main`; `deploy.yml` deploys production)

- **Change:**
  - `api/account` no longer returns driver id or driver notes to customers;
  - migration and test files (inert);
  - docs.
- **Pre-checks:**
  - `npm run test:unit` (52/52);
  - Vercel preview: My Account bookings list loads.
- **Post-checks:** a customer account's booking list still shows status and driver name where it did before.
- **Rollback:** promote the previous deployment.
- **Impact:** none visible.

### P8: Optional, receipt wording (deploy `send-journey-receipt` from `65fe968`)

- **Change:** receipt wording as in section 3, sent through the email queue instead of directly through Resend (`b1773d5`).
- **Pre-checks:** your approval of the wording; archive v11.
- **Post-checks:** the next completed job gets a `receipt` row in `notification_queue`, then sent.
- **Rollback:** redeploy v11.
- **Impact:** customers start receiving receipts reliably, with a payment line.

### P9: Fix 5 retirements (per function, in the order of the plan)

For each function:
1. Archive the deployed source.
2. Deploy a 410 stub.
3. Watch for 14 days.
4. Delete.

Rollback is redeploying the archive. No customer or driver impact is expected.

**Suggested order:** P1 → P2 → P3 → P4 → P5 → P6 → P7, then P8 and P9 when you choose. P5 and P6 can go in either order.

## 9. Evidence and what remains unverified

**Re-run on 15/10/2026, local only:**

| Check | Result |
|---|---|
| `evexec` `npm run test:db` (local PostgreSQL 16, live definitions copied 15/10) | 5/5 files, **97 checks** pass |
| `evexec` `test:db --baseline-only` (current production definitions, no fixes) | Fix 1, 2, 3, 4 files **fail** as expected; the workflow file passes (behaviour preserved) |
| `evexec` `npm run test:unit` | 52/52 |
| `evexecoperator` `vitest run` / `tsc --noEmit` / `next build` | 204/204 / clean / builds |
| `evexecdriverapp` `npm test` / `tsc` / `next build` | 7 + 25 pass / clean / builds |
| `deno check` (send-push, notify-job-update, send-journey-receipt) | clean |

**Unverified:**
- **The local database is a copy of the relevant live tables, policies and functions, not of the whole production schema.** The 54 production migrations with no file in the repos weren't replayed. A live-only object that writes `bookings` or `drivers` with an app user's token would not be covered; none was found in the trigger and function scan.
- **Supabase Vault's real `create_secret`/`update_secret`** and `extensions.gen_random_bytes` are stubbed locally (pgcrypto is real). Both exist live (checked).
- **Function secrets** (`RESEND_API_KEY`, `FLIGHTAWARE_API_KEY`, `AERODATABOX_API_KEY`, Stripe, Twilio): whether they're set can't be read from here.
- **EV Exec's Stripe account** (`acct_1TSSRS6n70MGfLL7`): the Stripe connector in this session reaches only FYStay, so webhook endpoints and any live Payment Links created by `create-payment-link` weren't checked. Check them in the Stripe Dashboard before stubbing `create-payment-link`.
- **Supabase's GitHub integration:** whether it is set to apply migrations from `main`. The repos' own workflows don't, but the dashboard setting wasn't visible. Check it before merging P7, so the migrations don't run outside the planned order.
- **Old PWA builds:** the old-app compatibility rests on replaying its requests against the copied schema. It wasn't tested on a real phone.
- **Receipts:** why 4 of 5 recent completed jobs have no receipt recorded.
- **`/api/push/dispatch` dead-device cleanup** calls `unregister_operator_push` with no user session, so it never removes anything (pre-existing since the 22/09 ownership fix). Harmless: dead devices just get retried. Not changed.
