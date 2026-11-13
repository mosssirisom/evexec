# EV Exec platform: progress tracker

Kept up to date by the engineering loop (assess, plan, build, test, fix, review, repeat). Read this first to pick up the work.

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

### Done since the last update
- [x] Winjo Digital platform page copy drafted (copy-ready file, not yet published).
- [x] Price options for operators drafted, with competitor research (see options: the owner chose £99 a month and £999 set-up on 13/11/2026).
- [ ] Confirm the Operator app's latest production build shows the fees screen (Settings, Platform, Fees). Not yet confirmed: the Platform tab is hidden for the current login.

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
- [ ] Support hours and contact for operators.
- [ ] VAT wording on the platform page.
- [ ] Typical set-up time and whether the platform can run on an existing domain.

### Needs the owner's approval before any work
- Automatic monthly billing of operators (Stripe Billing has its own fees).
- Live mode for Stripe Connect (after the test payment passes).
- Anything that costs money or turns Twilio on.

## Known bugs

None open that affect the live business.

## Test results (13/11/2026)

- Website unit tests: 164 pass. Database tests (local pgTAP): all pass in CI. Operator app: 389 pass, lint 0 errors, typecheck clean.
