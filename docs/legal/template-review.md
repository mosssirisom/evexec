# Legal templates: notes for review (draft, 12/11/2026)

**Status: DRAFT. This is a template, not legal advice. A solicitor should review it once before any business other than EV Exec publishes it.**

## What exists

- `lib/legal/` builds a business's **Terms & Conditions** (20 sections) and **Privacy Policy** (10 sections) from its row in `public.tenants`:
  `name`, `contact_email`, `contact_phone`, `brand.licence`, `pricing.extra_stop`, and a new `brand.legal` object (see `lib/legal/details.js` for every field).
- `termsDocument(tenant)` / `privacyDocument(tenant)` return the HTML, the plain text, and `gaps`: the details the business still has to fill in. Missing details show as a highlighted `[... to be added]` placeholder, never a guess.
- With EV Exec's own details the templates reproduce EV Exec's published `terms.html` (version 3, all 20 sections) and `privacy.html` word for word, apart from one intended phrase in privacy section 1 (`tests/unit/legal.test.cjs`). EV Exec's live pages are **not** changed.
- For any other business, the tests check no EV Exec name, number, licence, town or fleet appears.

## Per-business choices (all in `brand.legal`)

Trading status, legal name, company number and registered office (limited companies), base town, service area, services, licensing authority, jurisdiction (England and Wales, Scotland or Northern Ireland), fleet description, maximum passengers, luggage allowance, what the price includes, loyalty-points name, ICO registration number, platform provider, and the cancellation and waiting numbers (bands, free changes, change fee, waiting minutes, delay thresholds). Defaults are EV Exec's numbers. Invalid numbers (unordered bands, negatives) are ignored and the defaults used.

## Questions for the solicitor

1. **Cancellation charges.** The sliding charges (25% / 50% / 100%) and the "why we charge" wording: enforceable as a genuine pre-estimate of loss and fair under the Consumer Rights Act 2015? Do the distance-contract cancellation rules (14 days) apply to a transfer booked for a specific date?
2. **Flight monitoring.** The terms promise live flight monitoring on inbound transfers. Each business must actually provide it. (The platform's automatic flight checks are currently switched off; drivers track flights themselves.) Should the wording become optional?
3. **Platform provider as processor.** Each business is the controller; the platform owner processes data for them. A data processing agreement is needed between them, the privacy policy names the platform provider only if `platform_provider` is set, and the processor list (Supabase, Vercel, Stripe, Resend, Google, AeroDataBox) is the same for every business.
4. **ICO registration.** Most controllers must register and pay the ICO fee. The policy prints the registration number if set. Should it be required?
5. **Regulatory wording.** "Private hire operator licence" and "DBS checked" suit England and Wales. London (TfL), Scotland and Northern Ireland use different licensing language and bodies.
6. **Insurance claims.** "Full public liability and hire & reward insurance" must be true for every business.
7. **Liability cap** for business customers (price of the booking), and the reasonableness test (UCTA 1977).
8. **Payments.** With Stripe Connect each business takes card payments directly. Do sections 3 and 10 (who is paid, who refunds) need wording for that?
9. **Sole trader / limited company / partnership** introductory sentences, and use of a trading name.

## Not done yet (needed before a second business publishes custom numbers)

- **Charge calculation still uses EV Exec's numbers.** `lib/cancellation.js` (`BANDS`) works out the charge on the self-cancel page and in emails. A business with different bands in `brand.legal.policy` would show the right terms but be charged by EV Exec's bands. It must read the business's policy before any business changes the defaults. With the default numbers nothing differs.
- **Serving the pages.** The templates return HTML; each business's own website will serve `/terms` and `/privacy` from them when its site is set up. EV Exec keeps its static pages.
- **Settings screen.** A Legal section in the Operator app (Settings) where a business fills in `brand.legal` and sees the gaps list, saved through a database function like `update_tenant_profile`.
- **Version history per business.** Each business needs its own terms version and acceptance record (`bookings.terms_version`).
