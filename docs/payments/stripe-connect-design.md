# Stripe Connect for operators (design, 12/11/2026)

Decisions (owner, 12/11/2026): the platform (Winjo Digital) takes **no percentage** of card payments; the platform's Stripe account is a **new Stripe account for Winjo Digital**, separate from EV Exec's own. Cost rule: nothing here may create a billed resource without asking first.

## The model

Each operator gets its own Stripe account (a "connected account") through Stripe-hosted onboarding. When an operator's customer pays by card, the payment is made **directly on the operator's account** (a "direct charge"): the money goes to the operator, the operator pays Stripe's normal fees, and refunds and disputes come out of the operator's own balance. The platform never holds the money.

- Stripe's own docs list the platform's Connect fees as **none** in this SaaS model ("Platform Connect fees: None, as long as Stripe sets payment pricing and directly charges fees to connected accounts"; docs.stripe.com/connect/saas-platforms-and-marketplaces, read 12/11/2026). The Connect pricing page and the Dashboard's enable screen remain the final word; the owner checks these before the account is switched on.
- No application fee is set on any payment (decision above).
- Account settings (v1 Accounts API with controller properties, the documented equivalent of a Standard account): `controller[stripe_dashboard][type]=full`, `controller[fees][payer]=account`, `controller[losses][payments]=stripe`, `controller[requirement_collection]=stripe`; capabilities `card_payments` and `transfers` requested. Stripe recommends Accounts v2 for new platforms; moving to v2 later is a contained change in one file (`stripeConnect.ts`).
- The operator is the merchant of record and is responsible for its own Stripe terms, refunds, chargebacks, VAT and tax (see `operator-contract.md` clause 4 and `operator-responsibilities.md`).

## Phases

1. **Connect an operator (this change).** Operator app: Settings → Payments shows the state of the business's Stripe account and a button that creates the connected account and sends the operator to Stripe's hosted onboarding; coming back, the app re-reads the account and records whether it can take card payments. Switched off (route answers "not configured") until `STRIPE_PLATFORM_SECRET_KEY` is set. Database: three additive columns on `tenants`.
2. **Take payments on the operator's account.** Website checkout and the Operator app payment link create the Checkout Session on the operator's connected account (`Stripe-Account` header); `cardPaymentsAllowed` in both repos becomes "this business's connected account can take card payments". EV Exec keeps its existing own-account flow unchanged.
3. **Hear about payments.** A Stripe Connect webhook (events from connected accounts carry an `account` field) records the payment against the right booking; reuses the existing idempotent reconcile. Needs a webhook endpoint created in the platform's Stripe Dashboard.
4. **Test, then live.** Everything is built and tested in Stripe test mode first; live mode only after a full test payment end to end and the owner's go-ahead.

## What the owner has to do (free, no card payments taken)

1. Create the Winjo Digital Stripe account (free) and enable Connect in its Dashboard. Check the Connect pricing page first: nothing should be charged for enabling it in this model.
2. In **test mode** first: add the account's secret key to the Operator app's Vercel environment as `STRIPE_PLATFORM_SECRET_KEY` (never paste it in chat).
3. Later (phase 3): create the Connect webhook endpoint and add its signing secret as `STRIPE_CONNECT_WEBHOOK_SECRET`.

## Safety rules kept

- Card payments for a business with no ready connected account stay refused (existing guard), so a customer's money can never land in the wrong account.
- Only an operator_admin of that business (or a super_admin) can connect or view its Stripe state, checked on the server.
- The platform key is only ever used server-side and is never stored in the database or sent to the browser.
- Nothing is charged to the owner by this feature; Stripe's per-payment fees are paid by each operator.

## Not decided here

- Whether EV Exec itself later connects as an ordinary operator (it is a customer like any other). Until then it keeps its own Stripe account and flow.
- Refund handling for operator payments beyond what Stripe does by default.

## Phase 2 as built (website, 13/11/2026)

- `lib/stripeAccount.js` decides the Stripe account for a business: EV Exec (the account owner) keeps its own key (`STRIPE_SECRET_KEY`, no `Stripe-Account` header); any other business is charged **directly on its connected account** with the platform key (`STRIPE_PLATFORM_SECRET_KEY`) plus a `Stripe-Account` header, only once Stripe says the account can take card payments. Otherwise the card payment is **refused and Stripe is not called**.
- Checkout, the booking-page payment check, closing a card checkout when cash is chosen, and receipt look-ups all use that account. A business's checkout returns to **its own website** (`brand.site_url`); a business with no website is refused (EV Exec's `SITE_URL` override applies to EV Exec only).
- **Webhook:** accepts events signed with `STRIPE_WEBHOOK_SECRET` (EV Exec's endpoint) or `STRIPE_CONNECT_WEBHOOK_SECRET` (the Connect endpoint). An event with an `account` field is matched to the business that owns that connected account; an unknown account is acknowledged and ignored.
- **A payment can only mark its own business's booking Paid.** If a payment on one account arrives for a booking of a different business (or EV Exec's own account is paid for another business's booking), nothing is recorded and the event is saved as `wrong_business`.
- **Alert:** a `wrong_business` payment is saved in `stripe_webhook_events` and staff are emailed (`OPERATOR_EMAIL`, subject "Check Stripe: payment on the wrong account") and pushed. It should not happen (checkout refuses those payments), but if it does the money is on the wrong account and must be refunded by hand.
- **Still to do:** the Operator app payment link (its own copy of the same logic), the Connect webhook endpoint in Stripe, and a full test in Stripe test mode. Set `STRIPE_PLATFORM_SECRET_KEY` and `STRIPE_CONNECT_WEBHOOK_SECRET` as **Sensitive** variables on the website's Vercel project too (test keys first).

## Owner decisions (13/11/2026)

- **EV Exec and Winjo Digital are separate businesses.** EV Exec is an airport taxi business and is a **customer** of the platform like any other operator, with its **own Stripe account**, kept as it is. Winjo Digital is the software and web-design business: it owns the platform, has its **own Stripe account**, and collects the monthly fee from each operator.
- **EV Exec's payments stay in its own Stripe account.** The "owner tenant" setting (`STRIPE_PLATFORM_TENANT_ID`) and the own-key path in the code mean "the business whose own Stripe key is used", not "the business that owns the platform". Nothing needs to move.
- **Fees:** a default monthly and set-up rate, changeable per business (larger or smaller operators). EV Exec is charged **£0**; it is simply not billed, with no zero-value direct debit or subscription (a Stripe subscription would cost money). Rates are recorded in `platform_fees` and `tenants.monthly_fee_pence` / `setup_fee_pence` (migration `20261113150000`); the Fees screen is in the Operator app (Settings → Platform).
- **Not built, and not to be turned on without the owner's approval:** automatic monthly billing (Stripe Billing has its own fees). VAT: the owner is not VAT registered and does not expect to exceed the registration threshold; the threshold depends on taxable income over a rolling 12 months, so check the current figure on gov.uk and with an accountant as the number of operators grows. Not legal or tax advice.

