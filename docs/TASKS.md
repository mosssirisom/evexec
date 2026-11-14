# EV Exec platform: progress tracker

Kept up to date by the engineering loop (assess, plan, build, test, fix, review, repeat). Read this first to pick up the work.

## Built 14/11/2026 (merged to main; deploy waits for the owner's go-ahead)

- **Quote pricing:** in the Operator app Inbox, tap a quote, type the price, and Confirm. The price is saved and a two-tap text (with yes and no links) goes to Texts to send. Website evexec #85, Operator app evexecoperator #51. The migration `20261114120000_quote_pricing_and_texts.sql` is applied to the live database (columns checked).
- **Customer reply:** `/api/booking/quote-response` shows the quote and two buttons. Only the button press records the reply, once, and the office is pushed. A yes does not create a booking or take payment.
- **Tests:** website 215 pass; Operator app 416 pass; typecheck and lint clean.

**Still open for quotes:** quotes with no phone number get no text (the office must email the price by hand); the two-tap text link is not yet checked on a real iPhone; the reply page has not been checked on the live site.

**Waiting on the owner:** the deploy of both apps, and the return fares in Settings → Prices (see the price section below).

## Scope (decided 14/11/2026): EV Exec only, tightened

The SaaS build is paused. This repo serves EV Exec's own business. Winjo Digital, other operators and multi-business sales are out of scope until the owner reopens them. Nothing below is removed from the code; it is simply no longer being built.

**Open for this scope, in priority order:**
1. Deploy the merged, tested work to production once the daily deploy limit allows it, with the owner's approval each time: privacy retention wording (#82), Driver App (#22) and the sign-in fix in the Operator app (#50, already live).
2. Confirm each Vercel project still deploys from its repo on a push, after the GitHub owner change. Record the repo each project uses.
3. Database: keep the 60-day log history, check size monthly, and leave the cron jobs as set (three every 5 minutes, notification queue every minute).
4. Legal: have the owner tick the responsibilities confirmation for EV Exec, and do the yearly clear-out of old enquiries and logs (`docs/legal/audit-2026-11-12.md`).
5. Real-device checks on iPhone and Android: the `sms:` text links, push notifications and the Driver App sign-in.
6. Automatic flight checks stay off (they cost money per call).

**Paused (not for EV Exec's current business):**
- Stripe Connect live mode and the test-operator payment test.
- Platform set-up of new businesses, billing and fees, automatic domain routing, self-serve sign-up, per-business sending domains.

## Objective

A multi-tenant booking, dispatch and payments platform. Winjo Digital owns the platform and sells it to operators; EV Exec is one customer (£0, own Stripe account). Operators take card payments directly on their own Stripe account (Stripe Connect, no platform percentage). Platform fees are recorded, not billed. Cost rule: nothing may create a billed resource without the owner's approval. Twilio stays dormant.

## Done

- Multi-tenant schema, per-tenant pricing, branding, legal pages, team and driver invites, platform tenant set-up.
- Stripe Connect phase 1: operators connect their own Stripe account (Operator app Settings, Payments).
- Stripe Connect phase 2: checkout, payment check, payment links, receipts and the webhook all use the operator's connected account; a payment can only mark its own business's booking Paid (`wrong_business` otherwise). Website #63, Operator app #40.
- Platform fees: default and per-business monthly and set-up rates, EV Exec at £0, record only. Website #64, Operator app #41.
- Staff alert (email and push) for a `wrong_business` payment. Website #65.
- Operator app CI lint fixed (pre-existing `no-explicit-any` in four files).

## Next steps (checkboxes updated 13/11/2026)

> The full onboarding runbook and what is pending on the live database are in `docs/HANDOVER.md`.

### Done since the last update
- [x] One website serves many businesses by domain (prices, references, links, alerts per business), merged (#73, #75, #77).
- [x] A business's own website: branded home page with booking form, and booking and payment page; explicit per-domain routing (#78). 18 browser tests and 22 unit tests.
- [x] Owner-only website address per business with a one-domain-per-business guard (#75, Operator app #47).
- [x] Rate limiting on public forms; silent-update fixes in the Driver App and Operator app; direct public inserts closed (migration pending).
- [x] Winjo Digital platform page copy drafted (copy-ready file, not yet published).
- [x] Price options for operators drafted, with competitor research (see options: the owner chose £99 a month and £999 set-up on 13/11/2026).
- [ ] Confirm the Operator app's latest production build shows the fees screen (Settings, Platform, Fees). Not yet confirmed: the Platform tab is hidden for the current login.

### Launch-readiness checklist (13/11/2026)
- [x] Production redeploy confirmed: website `dpl_2o3j2ay…`, Operator app `dpl_Fz8gyxF…`, Driver App `dpl_82ATSPN…` all READY and aliased.
- [x] Privacy retention periods written (12 months enquiries and logs, 24 months idle accounts, six years bookings); recorded in `docs/legal/audit-2026-11-12.md`. Owner must do the yearly clear-out by hand.
- [ ] Supabase size: needs owner approval for VACUUM FULL, a 5-minute job schedule and a keep period.
- [ ] One test-mode payment through a second business: needs the Test Operator login and Stripe test onboarding.
- [ ] Automatic billing: needs owner approval (Stripe Billing has fees).
- [ ] After launch: automatic domain routing, self-serve sign-up.

### Blocked on the owner
- [x] Add `STRIPE_PLATFORM_SECRET_KEY` (test) to the website's Vercel project, Sensitive, Production and Preview. *Done by owner; website redeployed and READY.*
- [x] Add `STRIPE_CONNECT_WEBHOOK_SECRET` to the website's Vercel project. *Done by owner.*
- [ ] Create a Test Operator admin login (Supabase dashboard steps given; needs owner's platform role or the manual steps).
- [ ] Complete Stripe test onboarding for Test Operator in the Operator app (Settings → Payments).

### Outstanding (engineering, no owner input needed)
- [ ] Run one test-mode card payment on the Test Operator's connected account, and confirm the booking is marked Paid on that account (needs Stripe, Supabase and Vercel connections back).
- [ ] Give the owner's login the platform owner role so the Platform screen shows (needs Supabase).
- [ ] Review the Connect payment code before live mode.
- [ ] Tidy two `react-hooks/set-state-in-effect` lint warnings in the Operator app (`FeesSection.jsx`, `PaymentsSettings.jsx`).
- [x] Driver App tests: it has 74 unit tests and 22 function tests, all passing (earlier notes saying none were out of date). Coverage of the job screens is still thin.
- [ ] Rate limiting on the public forms is open for review (evexec PR #67).
- [ ] Two Operator app pull requests are open for review: #42 (lint tidy) and #43 (payment link closes open checkouts when the account is not ready).

### Winjo Digital website (not in these repos)
- [ ] Publish the platform page (draft in the scratchpad).
- [ ] Fix the contradictions in the website terms and FAQ (WINJO Refresh levels, hosting cancellation notice, terms date).

### Needs the owner's decision
- [x] Public platform pricing: £99 a month and £999 set-up (owner, 13/11/2026). The live default needs the migration `20261113160000` applied once Supabase is back.
- [ ] Support hours for operators (the Order Details decide these; Winjo's site states none, so none are published).
- [ ] VAT wording on the platform page.
- [x] Domain: the customer buys their own domain (a few pounds a year), and the £999 set-up covers configuring it. Recorded in the contract, clause 3.6 and Schedule B (owner decision, 13/11/2026).

### Needs the owner's approval before any work
- Automatic monthly billing of operators (Stripe Billing has its own fees).
- Live mode for Stripe Connect (after the test payment passes).
- Anything that costs money or turns Twilio on.

## Known bugs

None open that affect the live business.

## Test results (13/11/2026)

- Website unit tests: 164 pass. Database tests (local pgTAP): all pass in CI. Operator app: 389 pass, lint 0 errors, typecheck clean.
