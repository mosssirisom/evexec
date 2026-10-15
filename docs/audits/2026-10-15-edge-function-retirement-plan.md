# Edge function inventory and retirement plan (Fix 5, audit H-6)

**Date:** 15/10/2026 · **Status:** plan only. No function has been disabled, deleted or redeployed under this fix.

## How this was checked

- **Deployed list and settings:** Supabase `list_edge_functions` for project `yoltkmhtxwluqxxpewbl` (17 functions).
- **Source:** the `supabase/functions/` folders in all three repos at `origin/main` (website `42696d0`, Operator `6501ff6`, Driver `e531b6e`), plus git history for functions no longer in any repo.
- **Callers:**
  - Database: `pg_proc` bodies and `cron.job` commands that contain `/functions/v1/<name>`.
  - Apps: a search of the website (`api/`, `lib/`, `public/`, `*.html`), Operator `src/` and Driver `app/`, `lib/`, `components/` for the function name.
- **Recent use:** Supabase `function_edge_logs` for the last 24 hours (the only window available through the logs tool). **A quiet 24 hours doesn't prove a function is unused.** That's why every retirement below starts with a reversible stub and a watch period.

## Inventory

| Function | Source | `verify_jwt` | Caller check in code | Who calls it | Calls in last 24 h | Recommendation |
|---|---|---|---|---|---|---|
| `attestation-engine` | driver | off | none | cron `attestation-engine-sweep` (every min) | 1,296 × 200 | **Keep.** Follow-up: require a cron secret (anyone can trigger a sweep; idempotent, low risk) |
| `send-customer-sms-reminder-push` | driver | off | none | cron `customer-sms-reminder-push-sweep` | 1,307 × 200 | **Keep.** Same follow-up |
| `send-driver-reminders` | driver | off | none | cron `driver-reminder-sweep` | 1,305 × 200 | **Keep.** Same follow-up; also audit M-1 (duplicate 24 h reminder) |
| `send-push` | driver | off | none → **secret (Fix 2)** | trigger `notify_driver_new_booking` | 0 | **Keep**, deploy Fix 2 |
| `notify-job-update` | driver | off | none → **secret (Fix 2)** | trigger `notify_driver_job_update` | 0 | **Keep**, deploy Fix 2 |
| `send-journey-receipt` | driver | off | none (any booking id) | Driver app `jobs/[id]/page.tsx` after completion | 0 | **Keep.** Follow-up: require the driver's token and check they're assigned |
| `driver-test-push` | driver | on | `getUser` | Driver app `lib/push.ts` | 0 | Keep |
| `verify-flight` | operator | on | staff / service checks (per its source) | website `api/booking`, `api/flight/reverify`; Operator; Driver | 0 | Keep |
| `manage-tenants` | operator | on | super_admin check | Operator `PlatformSettings.jsx` | 0 | Keep |
| `integration-status` | operator | on | **none** (any signed-in user) | Operator `settings/page.jsx` | 2 × 200 | **Keep.** Follow-up: staff check (it tells callers which integrations are configured) |
| `notify-operator-new-booking` | operator | off | webhook secret | **none found** (the new-booking trigger calls the Operator app's `/api/push/dispatch` directly) | 0 | **Retire** (low risk: secret-gated, but dead) |
| `create-payment-link` | operator | on | **none** | **none found** | 0 | **Retire, priority 1.** Any signed-in account can create live Stripe Payment Links with any amount and booking reference |
| `send-sms` | operator | on | **none** | **none found** | 0 | **Retire.** Dormant while `SMS_ENABLED` is unset; becomes an open SMS relay if it's ever set |
| `notify-passenger-arrived` | driver | off | **none** (any booking id) | **none found** (call removed 24/09) | 0 | **Retire.** Lets anyone re-send "driver arrived" emails to a customer |
| `track-flight` | **none** (removed in driver app commit `4937857`) | off | **none** | **none found** | 0 | **Retire, priority 1.** Anyone with a booking id can make it call FlightAware (paid API, if a key is set) and write `flight_status`/`flight_checked_at` on the booking |
| `check-flight` | **none** (removed in operator commit `26a23d2`, superseded by `verify-flight`) | on | none in last known source | **none found** | 0 | **Retire.** Any signed-in account could trigger AeroDataBox (paid) lookups |
| `set-vercel-env` | **none** | on | n/a | **none found** | 0 | **Retire** (cosmetic: deployed body already returns `410 disabled`) |

**Not verified:**
- Whether `FLIGHTAWARE_API_KEY`, `AERODATABOX_API_KEY`, `STRIPE_SECRET_KEY` or Twilio secrets are set as Supabase function secrets. That decides how much `track-flight`, `check-flight`, `create-payment-link` and `send-sms` could cost or do; it isn't readable from here.
- Whether anything outside the three repos calls these functions: Zapier, a phone shortcut, an old app build, a bookmark. The watch period below is meant to catch that.

## Retirement procedure (needs your approval per function)

For each function marked **Retire**, in this order: `create-payment-link`, `track-flight`, `check-flight`, `send-sms`, `notify-passenger-arrived`, `notify-operator-new-booking`, `set-vercel-env`.

1. **Archive.** Download the currently deployed source (`supabase functions download <name>`, or the read-only `get_edge_function`) into `docs/audits/retired-functions/<name>/`, and record the deployed version number. This is the rollback copy. It contains no secrets (functions read secrets from the environment).
2. **Stub (reversible).** Redeploy the function as a stub that returns `410 Gone` with `{"error":"retired"}` and logs one line per call. The slug stays reserved and anything still calling it fails loudly instead of silently doing work.
3. **Watch for 14 days.**
   - Check `function_edge_logs` every few days (the tool only shows 24 hours at a time).
   - Check `notification_queue`, the Operator app and the Driver app for anything relying on the function.
   - Any call → stop, identify the caller, and decide whether to restore or migrate it.
4. **Delete.** After 14 quiet days, delete the function (Supabase dashboard → Edge Functions → Delete). Then remove its source folder from the repo, if it's still there, in a normal pull request.
5. **Rollback:**
   - During step 3: redeploy the archived source (same slug).
   - After step 4: create the function again from the archive.

**Expected impact:** none on customers, drivers or the office, because no app code, trigger or cron job calls these functions. The only effect is that outside callers (if any exist) get `410` instead of the old behaviour.

## Follow-ups for the kept functions (separate approval)

- Cron-driven sweeps (`attestation-engine`, `send-customer-sms-reminder-push`, `send-driver-reminders`): require the same `x-webhook-secret` that Fix 2 introduces. The cron commands are updated in the same migration.
- `send-journey-receipt`: accept only a driver token for the assigned driver (or the service role).
- `integration-status`: staff only.
