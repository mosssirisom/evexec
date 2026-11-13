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

## Blocked on the owner (secrets only the owner can add)

1. `STRIPE_PLATFORM_SECRET_KEY` (Winjo Digital Stripe test key) on the website's Vercel project, Sensitive, Production and Preview. The Operator app already has it.
2. `STRIPE_CONNECT_WEBHOOK_SECRET` (signing secret of the Connect endpoint `we_1UbIPYLEEs7hsljuOXvMDJ4c` in Winjo's test-mode Stripe Dashboard) on the website's Vercel project, Sensitive, Production and Preview.
3. Then redeploy the website, and the end-to-end test-mode payment can run.

## Outstanding (no owner input needed)

- End-to-end test of a connected-account payment in Stripe test mode (needs the two secrets above).
- Review pass over the Connect code for live mode.
- Operator app: tidy two `react-hooks/set-state-in-effect` lint warnings (`FeesSection.jsx`, `PaymentsSettings.jsx`).
- Driver App has no automated tests (known gap).

## Needs the owner's approval before any work

- Automatic monthly billing of operators (Stripe Billing has its own fees).
- Live mode for Stripe Connect (after the test payment passes).
- Anything that costs money or turns Twilio on.

## Known bugs

None open that affect the live business.

## Test results (13/11/2026)

- Website unit tests: 164 pass. Database tests (local pgTAP): all pass in CI. Operator app: 389 pass, lint 0 errors, typecheck clean.
