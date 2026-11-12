# EV Exec platform: progress tracker

One tracker for all three repos (`evexec` website and database, `evexecoperator` Operator app, `evexecdriverapp` Driver App) and the shared Supabase project. Update it as work moves. Last updated 12/11/2026.

## Objective

Make EV Exec's software the best airport and long-distance transfer platform, and safe to run for more than one operator business (multi-tenant SaaS), without changing what EV Exec itself sees.

## Ground rules (from the owner)

- No new cost without asking (see `CLAUDE.md`). No Twilio sending.
- Dates DD/MM/YYYY, times 24-hour UK.
- Autonomous engineering mode (11/11/2026): keep going through build, test, fix, review without asking permission for routine decisions.
- **Still the owner's call:** applying a migration to the **live** database, and merging to the production `main` of `evexec` (Vercel deploys it). Everything else is pushed as branches.

## Done

- Database hardening stages 1 to 3, driver cancel and No Show rules, office no-show alert (all live, 10/11/2026). 113 database checks pass.
- Local database tests from a baseline of the live structure, run in CI (`scripts/db-test.sh`, `.github/workflows/db-tests.yml`).
- Three live-only migrations brought into the repo.
- Operator app: lint and typecheck CI, then all React lint warnings cleared (46 to 0).
- `/quote` page: passenger and luggage dropdowns, Google address suggestions (desktop clipping fixed).

## Step 1: multi-tenant (code done, awaiting owner's go for the live parts)

Branches: `evexec` `claude/sweet-meitner-med7lt`, `evexecoperator` `claude/operator-multi-tenant-step1`, `evexecdriverapp` `claude/sweet-meitner-med7lt`.

| Piece | State |
|---|---|
| Migration `20261111120000_tenant_scoping`: office push devices per business, per-business notification settings, tenant on the notification queue and log, no-show alert names its business, 14 other tables documented as already safe | **Applied to live 11/11/2026**; 46 new + 113 existing database checks pass; live fingerprint matches (14/15, last differs only by line endings). |
| Push alerts go to one business's devices (website, Operator route, Driver App functions) | Done and tested; falls back to the old all-business list until the migration is applied, so nothing is lost either way |
| Email branding (name, phone, licence, website, tagline, colours) from the business's own row: website and Operator app | Done. EV Exec's 29 + 28 email types are byte-identical; another business shows none of EV Exec's details (tested across every email type) |
| Operator confirmation and payment-link texts, Stripe product name | Done, EV Exec wording identical (tested) |
| Notification settings screen uses the business's own row | Done, falls back to the global row until the migration is applied |

### To go live (owner decisions)

1. ~~Apply the draft migration to live~~ **Done 11/11/2026** (owner, in the SQL editor). Verified read-only. Baseline rebuilt and the file is now `supabase/migrations/20261111120000_tenant_scoping.sql`.
2. ~~Merge the three branches~~ **Done 11/11/2026** (evexec #37, driver app #11, operator #24).
3. Still to do: redeploy the three Driver App edge functions (`send-journey-receipt`, `send-driver-reminders`, `notify-job-update`); delete the two unused live functions; later remove the all-business fallbacks and the old `get_push_dispatch_bundle`.

### Template clean-up (12/11/2026, owner: "remove all hardcoded EV Exec so it becomes a template")

- **Website:** accept/decline pages, self-cancel page, confirmation/rejection/reminder/cancel texts, Stripe product name, post-payment prompts, quote note and sample-email tooling now use the booking's business. Dead code removed (`lib/emailLayout.js`, `refBadgeHtml`, unused `CLOSE`). A unit test fails if a hardcoded EV Exec name, number, licence or domain is added to `lib/` or `api/`.
- **Driver App:** `lib/brand.ts` is the one deployment file (env-overridable); the signed-in driver's own business (name, dispatch number) comes from their `tenants` row. Customer texts, receipts, dispatch buttons, sign-in, manifest and push prompts follow. Edge-function emails take the booking's business. `notify-passenger-arrived` source removed.
- **Operator app:** `src/lib/deploymentBrand.ts` (env-overridable) for sign-in, app name, post-payment pages and portal links; invoice letterhead no longer falls back to EV Exec's address/number. `notify-operator-new-booking` source removed.
- **Data, not code:** EV Exec's licence, website and tagline move into `tenants.brand` (section 6 of the pending migration).
- **Left as platform settings (env, documented):** email sender and reply-to (`RESEND_FROM`, `REPLY_TO`, `INVOICE_FROM`), push contact (`VAPID_EMAIL`, `VAPID_SUBJECT`). A second business needs its own verified sending domain in Resend (owner: later, with bespoke sites).
- **Live edge functions still deployed** (no tool here can delete them): `notify-operator-new-booking`, `notify-passenger-arrived`. Neither is called by any trigger, cron job, code or logs. Delete in the Supabase dashboard. Not called by the Operator app either, and candidates to review: `create-payment-link`, `check-flight`, `track-flight`.
- **Deploy order:** apply the migration first; deploy the Driver App edge functions (`send-journey-receipt`, `send-driver-reminders`, `notify-job-update`) after it, so their emails read EV Exec's licence/tagline from the database.

### Second-business test (12/11/2026)

Ran on live inside a rolled-back transaction (a made-up business "Coastal Cars" with a driver and booking, run through Dispatched, En Route, Arrived and Cancelled; nothing was left behind). Found that three database functions still carried EV Exec's name, number or address:
- `enqueue_operator_customer_notifications`: the two-tap texts to customers said "EV Exec: Hi ..." (customer-facing, the worst one).
- `enqueue_driver_notifications`: stored driver text said "EV Exec NEW JOB / REMINDER" (the website re-renders the email at send time).
- `evexec_notification_email`: the staff email shell (header, footer, number, address).

Fix **applied to live 12/11/2026** (`supabase/migrations/20261112090000_tenant_aware_messages.sql`, verified live in a rolled-back transaction: Coastal Cars 4 messages, 0 EV Exec mentions; EV Exec's texts unchanged; helpers server-only) plus `supabase/tests/database/tenant_messages.test.sql` (25 checks: EV Exec, a full second business and a bare one). EV Exec's texts and subjects read exactly as before; its email shell footer now matches the apps' canonical footer. No DROP statements. Still to do: switch `attestation-engine` in the Driver App to `tenant_notification_email` (it still calls the old name, which keeps working for EV Exec), then rebuild the baseline.

Also found: `bookings_ref_format` requires every booking reference to start `EVX-`, so every business's references carry EV Exec's prefix. Needs a per-business reference prefix (database check, the website's reference generator, and the Operator app). Not started; a design decision.

### Step 2: business setup flow (12/11/2026)

- **Database:** `public.provision_tenant(slug, name, contact_email, contact_phone)` (migration `20261112120000_provision_tenant.sql`, **applied to live 12/11/2026**, verified in a rolled-back transaction): creates the business with checked slug and name, an invoice name, an **empty** price list, and its own notification settings with **SMS, WhatsApp and push off** (the table default would have turned SMS on; Twilio stays dormant). Server-only. 19 checks in `provision_tenant.test.sql`.
- **Website:** the built-in price list (`FALLBACK`) is now EV Exec's only. A business with no prices set gets an empty list ("price not available, please contact us"), never EV Exec's. Test added (101 unit tests pass).
- **Found:** the live `manage-tenants` edge function (super-admin create / list / invite) was in no repo, creates a bare row, and invites through Supabase's built-in mailer. Replaced by an Operator app route (see the Operator `CLAUDE.md`).
- The fingerprint query now sorts with collation "C" (live and local order text differently, which made equal data look different).

### Still open from step 1

- Stripe webhook tables are platform-wide (one Stripe account); needs a business mapping when each business has its own Stripe.

## Step 2: Driver App test suite (done, awaiting review)

Branch `claude/sweet-meitner-med7lt` in `evexecdriverapp`. Vitest 4 + jsdom. 56 tests in 5 files: `lib/format` (house date/time style, UK time, payment labels), `lib/customer-sms` (update and reminder texts, today/tomorrow/in N days, clock-change-safe day counts), `lib/job` (status flow, timestamps, wait grace, preferences; checks the app only sets statuses the database lets a driver set and never `Cancelled`), `middleware` (sign-in guard and matcher), `lib/push` (push state machine). The job page's pure rules moved to `lib/job.ts` unchanged. CI now runs `npm test` and `npm run test:functions`. Lint 0 errors and 0 warnings (the 9 old ones cleared), typecheck clean, production build passes.

## Step 3: Operator app clean-up (done)

The stale Vite-era branch `claude/sweet-meitner-med7lt` in `evexecoperator` was superseded by `main` and deleted by the owner on 11/11/2026. Remaining 28 old branches there are not yet reviewed.

## Other open items

- Check the desktop `/quote` Google suggestions on the live site after deploy.
- Click through the Operator app screens changed by the lint work (invoice page from a job link, Settings forms, setup checklist, phone More menu).
- After any live migration, rebuild the database baseline.

## Test results (11/11/2026)

- `evexec`: unit 100 pass; database 113 + 46 pass (local, `scripts/db-test.sh`).
- `evexecoperator`: 280 pass; lint 0 warnings; typecheck clean.
- `evexecdriverapp`: 67 unit + 22 function tests pass; typecheck clean; build passes.
