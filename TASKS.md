# EV Exec platform: progress tracker

One tracker for all three repos (`evexec` website and database, `evexecoperator` Operator app, `evexecdriverapp` Driver App) and the shared Supabase project. Update it as work moves. Last updated 11/11/2026.

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
| Draft migration `supabase/pending/20261111120000_tenant_scoping.sql`: office push devices per business, per-business notification settings, tenant on the notification queue and log, no-show alert names its business, 14 other tables documented as already safe | Written, **46 new database checks + existing 113 pass locally. NOT applied to live.** |
| Push alerts go to one business's devices (website, Operator route, Driver App functions) | Done and tested; falls back to the old all-business list until the migration is applied, so nothing is lost either way |
| Email branding (name, phone, licence, website, tagline, colours) from the business's own row: website and Operator app | Done. EV Exec's 29 + 28 email types are byte-identical; another business shows none of EV Exec's details (tested across every email type) |
| Operator confirmation and payment-link texts, Stripe product name | Done, EV Exec wording identical (tested) |
| Notification settings screen uses the business's own row | Done, falls back to the global row until the migration is applied |

### To go live (owner decisions)

1. Apply the draft migration to live. Contains `DROP CONSTRAINT`/`DROP POLICY`/`DROP TRIGGER IF EXISTS` (the Supabase tool hangs on DROP; apply in the SQL editor). Then rebuild the baseline (`supabase/baseline/README.md`) and move the file to `supabase/migrations/`.
2. Merge the three branches (website to `main` deploys to production).
3. Afterwards: remove the all-business fallbacks and the old `get_push_dispatch_bundle`.

### Not done in step 1 (known gaps, ranked)

- Sender identity: the Operator app still sends email `From`/`Reply-To` as EV Exec (`INVOICE_FROM`). Another business needs its own verified sending domain in Resend (a setup task, may cost money, owner decision).
- `evexec/lib/notify.js` (two-tap texts, a legacy HTML footer), `lib/emailLayout.js`, `lib/pages.js` (accept/decline web pages) and the self-cancel page still say EV Exec.
- The Driver App's own email/HTML fallbacks (used only if the website's re-render fails) still say EV Exec.
- `notify-operator-new-booking` edge function in the Operator repo looks unused (no trigger calls it); consider deleting.
- Stripe webhook tables are platform-wide (one Stripe account); needs a business mapping when each business has its own Stripe.

## Step 2: Driver App test suite (done, awaiting review)

Branch `claude/sweet-meitner-med7lt` in `evexecdriverapp`. Vitest 4 + jsdom. 56 tests in 5 files: `lib/format` (house date/time style, UK time, payment labels), `lib/customer-sms` (update and reminder texts, today/tomorrow/in N days, clock-change-safe day counts), `lib/job` (status flow, timestamps, wait grace, preferences; checks the app only sets statuses the database lets a driver set and never `Cancelled`), `middleware` (sign-in guard and matcher), `lib/push` (push state machine). The job page's pure rules moved to `lib/job.ts` unchanged. CI now runs `npm test` and `npm run test:functions`. Lint 0 errors (9 old warnings), typecheck clean, production build passes.
Gap: the customer texts still say "EV Exec" (needs the business name passed in).

## Step 3: Operator app clean-up (not started)

Stale branch `claude/sweet-meitner-med7lt` in `evexecoperator` (Vite-era, 281 commits behind `main`).

## Other open items

- Check the desktop `/quote` Google suggestions on the live site after deploy.
- Click through the Operator app screens changed by the lint work (invoice page from a job link, Settings forms, setup checklist, phone More menu).
- After any live migration, rebuild the database baseline.

## Test results (11/11/2026)

- `evexec`: unit 97 pass; database 113 + 46 pass (local, `scripts/db-test.sh`).
- `evexecoperator`: 278 pass; lint 0 warnings; typecheck clean.
- `evexecdriverapp`: 56 unit + 14 function tests pass; typecheck clean; build passes.
