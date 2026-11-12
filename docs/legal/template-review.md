# Legal templates: notes (12/11/2026)

**No solicitor is used (owner decision, 12/11/2026).** The templates were checked against official UK sources instead: see `docs/legal/audit-2026-11-12.md` for what was checked, what was fixed and the owner actions.

## What exists

- `lib/legal/` builds a business's **Terms & Conditions** (20 sections) and **Privacy Policy** (10 sections) from its row in `public.tenants`: `name`, `contact_email`, `contact_phone`, `brand.licence`, `pricing.extra_stop`, and `brand.legal` (see `lib/legal/details.js` for every field).
- `termsDocument(tenant)` / `privacyDocument(tenant)` return the HTML, the plain text, `gaps` (details still missing, shown as highlighted placeholders, never guessed) and `advice` (things to do that do not block publishing, such as the ICO fee).
- EV Exec's own `terms.html` and `privacy.html` are **built from the templates** with `npm run build:legal` (`scripts/legal/ev-exec-tenant.js` holds EV Exec's details), and a test fails if they drift apart.
- For any other business the tests check that no EV Exec name, number, licence, town, fleet or loyalty scheme appears.

## Still to do

- **Charge calculation** (`lib/cancellation.js` `BANDS`) uses EV Exec's numbers; a business with different bands would show the right terms but be charged by EV Exec's. Make it read the business's own policy before any business changes the defaults (the defaults are identical, so nothing differs today).
- **Settings screen** (Operator app): a Legal section where a business fills in `brand.legal` and sees `gaps` and `advice`.
- **Serving** `/terms` and `/privacy` from the templates on each business's own website.
- **Per-business terms versions** and acceptance records.
