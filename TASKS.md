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

## Website files customer rows under its own business (12/11/2026)
- Bookings (outbound and return leg), quote requests and contact messages now carry `tenant_id` = the site's `TENANT_ID` (EV Exec when unset). Tests: `tenant-site.test.cjs`, `tenant-site-default.test.cjs`.
- Still open: customer profiles on signup default to EV Exec; booking reference prefix `EVX-` is platform-wide.

## Driver attestation engine and merged PRs (12/11/2026)
- Merged: evexec #41 (provision_tenant) and #42 (website files under its own business); evexecoperator #26 (platform tenants route); evexecdriverapp #13 (attestation alert uses the booking's own business shell). CI was green before each merge.
- `attestation-engine` redeployed as v12 from Driver App main (JWT off, as before). Logs show it running every minute with no errors or exceptions since 06:50 UTC.
- Next: booking-reference prefix per business (needs owner to run a DROP CONSTRAINT in the SQL editor), then remaining hard-coded fallbacks, then second-business checks on the Operator and Driver apps.

## Booking reference prefix per business (12/11/2026, DONE and live)
- Draft `supabase/pending/20261112150000_booking_ref_prefix.sql`: `tenants.ref_prefix` (EV Exec = EVX), new reference rule `^[A-Z]{2,5}-[A-Z0-9]+$`, `provision_tenant` derives a prefix. Part A (no DROP) applied by the tool; part B (`drop constraint bookings_ref_format`) is for the owner in the SQL editor. Order: part A, then deploy code, then part B.
- Website (`lib/brand.js` `refPrefix`, `api/booking`), claim-a-booking checks accept any prefix. Operator app to follow.
- Both parts applied live 12/11/2026 (part A by the tool, part B by the owner). Migration moved to `supabase/migrations/20261112150000_booking_ref_prefix.sql`, baseline updated. Website #43 and Operator #27 merged.

## Emails: sender name and reply-to per business (12/11/2026)
- Website `sendEmail` takes `tenantId`: the display name is the business's name (sending address stays the platform's `RESEND_FROM`), replies go to its own contact email. EV Exec keeps its `REPLY_TO`. A business with no contact email gets no reply-to (never EV Exec's inbox). Operator app: `src/lib/server/sender.ts` `senderFor()` used by invoice, payment-link, booking-response and staff/invite emails.
- Still platform-wide (parked, may cost): one verified sending domain (`RESEND_FROM`), VAPID subject, notification health-test sender.

## Step 5: second-business check on the live database (12/11/2026)
- Rolled-back probe on live: `provision_tenant('probe-biz', ...)` then a driver and two bookings (one with email, one without) taken through Dispatched, En Route, Arrived, Cancelled. Result: prefix `PROB`, refs `PROB-PROBE1/2`, 8 queued notifications and 2 office text tasks, **0 rows mentioning EV Exec / evexec / 07721 / PHO0079**; notification settings email on, SMS/WhatsApp/push off. Rolled back, nothing left behind.
- Merged today: evexec #41, #42, #43, #44, #45; Operator #26, #27, #28; Driver #13.
- Not checked: a browser walk through the Operator and Driver app screens with a second business login (needs a real test login per business; the screens' business details are unit-tested). Suggested next: create a real test business from Settings, Platform and sign in as its admin.
- Parked (owner decisions, may cost): per-business sending domain, per-business Stripe, SaaS billing, legal documents, marketing sites.

## Customer profile sign-up (12/11/2026, DONE and live)
- `handle_new_user()` files a new customer's profile under the business named in the sign-up data (`tenant_id`, from `/api/config` `tenantId`), if it is an active business; none, malformed, unknown or suspended fall back to EV Exec and never block a sign-up. Migration `20261112170000_profile_tenant_at_signup.sql` applied live; rolled-back probe on live confirmed all three cases. Website sign-up forms (home page and My Account) send it.
- Note: auth is shared, so one login works on every business's website; a customer who signs up on a second business's site is filed under it, and keeps that business for their profile.
- Existing 4 profiles are EV Exec's and unchanged.

## Parked decisions: owner's choices (12/11/2026)
1. **Legal documents: B**, a template per business (terms, privacy, cancellation policy) filled from the business's own details; owner/solicitor reviews the template once.
2. **Stripe: B**, Stripe Connect, one connected account per business, paid directly to them.
3. **Billing: A**, a flat monthly fee per business through Stripe Billing (price to be set by the owner).
4. **Sending domain: expand**: each business can use its own domain (see design below), platform domain with the business's name until it is verified.
5. **Websites: B**, a bespoke branded website per business (own domain, own Vercel project, `TENANT_ID` set to that business), all using the shared database and the business's own branded Operator and Driver apps. Owner has a Vercel Pro account.
- Cost rule still applies: creating a new Vercel project, verifying a paid Resend domain, or any Stripe fee is asked about first, per business.

## Stripe Connect: findings and plan (12/11/2026)
**Fees (Stripe's own docs, read 12/11/2026):** with connected accounts that have their own full Stripe Dashboard and pay Stripe's fees themselves (the "Standard" model; today set with account properties `controller[fees][payer]=account`, `controller[stripe_dashboard][type]=full`), "We don't charge any Connect fees to it or to your platform"; the GB pricing page lists no platform fee, no per-account fee and no payout fee in that model. Each business pays Stripe's normal card fees (the page shows 1.5% + 20p for standard UK cards; not confirmed as the connected-account rate). The £2 per active account and payout fees apply only if the platform handles pricing, which we do not. **Not confirmed:** any cost of enabling Connect on the existing Stripe account (`acct_1TSSRS6n70MGfLL7`); the owner should look in the Stripe Dashboard (Connect) before enabling, and nothing is enabled without their go-ahead.
**Stripe now calls Standard a legacy label for new platforms;** build with controller properties (same behaviour), Stripe-hosted onboarding via Account Links, direct charges (the `Stripe-Account` header), and a Connect webhook endpoint (events carry `account`).
**Already done (free, safety):** card payments for any business other than the Stripe account owner's (EV Exec, `STRIPE_PLATFORM_TENANT_ID`) are refused on the website and in Operator payment links, so no other business's customers' money can land in EV Exec's Stripe account.
**Build plan:** (1) `tenants` Stripe status columns (`stripe_connect_account_id` exists) + server-only update; (2) Operator app Settings, Payments: "Connect Stripe" (creates the account, returns a one-time onboarding link), status, refresh; (3) website checkout/verify/expire/refund use the business's connected account (`Stripe-Account`) when it has one and `charges_enabled`; (4) Connect webhook endpoint (its own signing secret; the handler already accepts several secrets) handling `account.updated` and `checkout.session.completed` with `event.account`; (5) Operator payment links on the connected account; (6) tests with a faked Stripe.
**Owner actions needed for the build:** enable Connect in the Stripe Dashboard (platform profile, Connect terms) after checking any cost; add the Connect webhook endpoint (I will give the exact URL and events), and put its signing secret into Vercel.
## Legal templates (12/11/2026, drafted)
- `lib/legal/` (terms 20 sections, privacy 10) built from a business's own details; reproduces EV Exec's live terms and privacy word for word (tests), shows no EV Exec detail for another business, lists what a business still has to fill in. Review notes and solicitor questions: `docs/legal/template-review.md`.
- Still to do: charge calculation (`lib/cancellation.js`) reading the business's own bands, Operator app Settings, Legal section, serving `/terms` and `/privacy` on each business's website, per-business terms versions.

## Stripe (owner's choice, 12/11/2026)
- **Standard Connect accounts with Stripe's hosted onboarding**: each business creates and owns its own Stripe account; the platform does not manage their money. Before building: confirm Stripe's current Connect fees for a platform that takes no per-transaction cut (billing is a flat monthly fee, option 3A) and ask the owner before anything that costs.
- Next: monthly fee (Stripe Billing), then the rest.

## Legal audit, no solicitor (12/11/2026)
- Owner rule: **no solicitor**; legal wording is checked against official UK sources. Audit and owner actions: `docs/legal/audit-2026-11-12.md`.
- Fixed: online order wording and total-price line on the booking form (Consumer Contracts Regs reg 14), consumer liability and luggage clauses (CRA 2015 s.57), assistance dogs (Equality Act 2010 s.170), privacy notice contents and one-month response, complaints to us (DUAA 2025, in force 19/06/2026). EV Exec terms are now **version 4** (version 3 archived at `/terms-v3`); the charges are unchanged.
- Owner actions: ICO data protection fee (check and pay or confirm exempt), complaints process, council record-keeping conditions, claims must be true (insurance, DBS, flight monitoring).
- Operator app copy of `lib/cancellation.js` must move to version 4 too.

## Standard terms with an option for the operator's own (owner idea, 12/11/2026; design agreed in principle, two questions open)
- **Default:** every business uses the standard template (`lib/legal`). **Option:** an operator can switch to its own terms (`brand.legal.terms_mode` = `standard` | `custom`, own text in `brand.legal.custom_terms`, basic formatting only, sanitised).
- **Rules for custom terms:** the operator is responsible for them (shown clearly when they switch); the platform still records which version a customer accepted (custom versions numbered per business, old ones kept and viewable); the booking form still requires the tick and the obligation-to-pay wording (Consumer Contracts Regs reg 14), which belongs to the form, not the terms; the charge calculation must follow the numbers the operator enters (`brand.legal.policy`), so custom mode asks for them and the operator confirms their text matches.
- **Privacy policy:** recommended to stay standard (it lists the platform's processors: Supabase, Vercel, Stripe, Resend, Google, AeroDataBox), with an optional "additional information" section the operator can add.
- **Open questions for the owner:** (1) custom privacy policy too, or standard plus additional section? (recommended: standard plus additional section). (2) Custom terms and cancellation charges: charges follow the numbers the operator enters? (recommended: yes).

## Insurance and DBS: the operator's own responsibility (12/11/2026)
- Operators confirm in their Legal details (`brand.legal.insurance_confirmed`) that they hold hire & reward and public liability insurance and that their drivers are DBS checked. Until confirmed, the terms show a highlighted placeholder and the business is listed as not ready. EV Exec is confirmed.
- To build in the Operator app's Legal section (with the custom-terms build).
- Legal build fixed to run more than once without changing the published pages.

## Charge calculation per business (12/11/2026, website side done)
- The website charges a booking by its operator's own standard bands (`brand.legal.policy.standard`) when the booking is on the current terms version. Older versions keep their fixed bands. EV Exec and any business without its own bands keep the standard bands, so nothing changes for them.
- `update_tenant_legal` accepts `policy` (three bands, stricter each time, first band 0%). Applied live. Database tests: 23 pass.
- Still to do: the Operator app's copy of the charge rules (`src/lib/email/cancellation.js`) must read the same bands before any operator uses custom numbers; the Legal screen needs the three-band entry fields; the database baseline needs regenerating for the new function.
