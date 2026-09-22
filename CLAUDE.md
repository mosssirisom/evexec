# Cost policy (hard constraint — read before doing anything)

**We do not pay for any additional cost, under any circumstance, without explicit prior approval from the user.**

This applies to all three repos in this project (`evexec`, `evexecoperator`, `evexecdriverapp`) and to the shared Supabase project (`yoltkmhtxwluqxxpewbl`) they all depend on.

- **No new billed resources, ever, without asking first.** This includes (not an exhaustive list): Supabase database branches, additional Supabase projects, upgraded Supabase/Vercel plan tiers or add-ons, new paid third-party APIs or SaaS tools, additional cloud compute, paid monitoring/observability tiers, domain purchases, etc.
- **The one standing exception is SMS notifications via Twilio.** SMS is an already-accepted, already-capped fallback channel used only when email/push delivery fails. Do not remove or degrade that existing usage — but also do not expand SMS volume or add new SMS-triggering flows without approval, since it's the one channel that isn't free.
- **Before taking any action that would create a new billed resource or increase spend on an existing one, stop and ask.** This applies even to trivially small amounts (pennies, hourly micro-charges) — the rule is "always ask first," not "ask only above some threshold."
- **Prefer free tiers and already-provisioned infrastructure.** When a task could be done either by spinning up a paid resource (e.g. a Supabase branch to test a migration) or by a slower/more careful free alternative (e.g. read-only validation queries plus additive, reversible migrations applied directly, with review), default to the free alternative unless the user has explicitly approved the paid one.
- Abandon or redesign any plan that turns out to require a new cost, rather than proceeding and asking forgiveness after the fact.

# SaaS resale readiness — mini audit (2026-09-22)

Requested goal: not just "is the business good," but "could a buyer take this app and resell it as a multi-tenant SaaS product to other operators." This audit covers all three repos (`evexec`, `evexecoperator`, `evexecdriverapp`) and the shared Supabase project (`yoltkmhtxwluqxxpewbl`); the identical write-up is committed to all three repos' `CLAUDE.md`. Scope: multi-tenant schema coverage, Supabase security advisors, hardcoded single-tenant literals in app code, test coverage, and a light secrets scan. Did NOT cover: git history for historically-committed secrets, dependency vulnerability scanning, load/performance testing, or a real security pentest.

## Real multi-tenant foundation already exists

Migration `20260907120000_multi_tenant_foundation.sql` (applied, present in all three repos) added:
- `public.tenants` (id, slug, name, contact_email, contact_phone, `brand` jsonb, stripe_connect_account_id, status) — one row per operator business.
- `public.tenant_users` mapping `auth.users` → tenant + role (`super_admin` / `operator_admin` / `dispatcher` / `driver`); `tenant_id = null` reserved for platform-wide `super_admin` rows.
- RLS helper functions `private.is_super_admin()`, `private.is_member_of_tenant()`, `private.staff_for_tenant()`, used to scope staff/driver access per tenant instead of "any staff sees everything."
- `tenant_id` columns (NOT NULL, indexed, RLS-scoped) on: `bookings`, `drivers`, `missed_calls`, `quote_requests`, `contact_messages`, `reviews`, `invoices`, `profiles`. Later migrations extended this to `flight_verification_settings`, `flight_verifications`, and `tenant_users` itself — 11 tables total as of this audit.
- Today there is exactly one seeded tenant (`00000000-0000-0000-0000-000000000001`, slug `ev-exec`) — the live business. The schema is real and already multi-tenant-shaped, not a greenfield redesign.
- There is also a `manage-tenants` Supabase Edge Function for tenant admin — not exercised as part of this audit, so its completeness (e.g. does it fully provision a new tenant end-to-end) is unverified.

## Cross-tenant isolation gap — 17 tables with no `tenant_id`

Confirmed via `information_schema.columns` against the live project: these tables have RLS enabled but **no `tenant_id` column at all**, so their existing policies cannot be tenant-scoped:

`notification_log`, `notification_queue`, `booking_audit_log`, `saved_addresses`, `booking_expenses`, `driver_locations`, `driver_messages`, `driver_shifts`, `job_proofs`, `booking_photos`, `notification_channel_settings`, `operator_push_subscriptions`, `push_config`, `push_subscriptions`, `driver_unavailable_dates`, `driver_events`, `audit_log`, `error_log`.

With a single tenant this is invisible — every row belongs to the one business anyway. The moment a second tenant is onboarded, any table here whose policy grants access to "any staff/driver" rather than "this tenant's staff/driver" becomes a straight cross-tenant data leak (e.g. driver locations, driver messages, or audit logs from Tenant A visible to Tenant B's staff). This is the single biggest blocker to safely running >1 tenant today and should be closed (via the same `tenant_id` + `staff_for_tenant()`/derived-join pattern the foundation migration already established) before onboarding any second operator.

## Supabase security advisor findings (live project, checked 2026-09-22)

1. **`rls_enabled_no_policy`** (INFO, 2 tables): `private.staff_users` and `public.push_config` have RLS enabled but zero policies — meaning they currently deny all access via PostgREST, which is safe but likely unintentional (something probably can't read them that should be able to).
2. **`anon_security_definer_function_executable`** (WARN, 1): `public.get_push_dispatch_bundle(p_secret text)` is callable by the fully unauthenticated `anon` role via `/rest/v1/rpc/get_push_dispatch_bundle`. Worth confirming `p_secret` is actually checked meaningfully inside the function before this ships to other tenants.
3. **`authenticated_security_definer_function_executable`** (WARN, 5): `get_push_dispatch_bundle`, `get_push_public_key`, `queue_customer_sms`, `register_operator_push`, `unregister_operator_push` are all `SECURITY DEFINER` and callable by any signed-in user, not just staff. Each should be reviewed for whether it does its own tenant/ownership check internally (elevated-privilege functions are a classic cross-tenant bypass if they don't).
4. **`auth_leaked_password_protection`** (WARN, 1): HaveIBeenPwned leaked-password checking is disabled in Supabase Auth. Free to enable, no cost — worth turning on regardless of the SaaS question.

## Hardcoded single-tenant assumptions in application code

- **Pricing**: `evexec/lib/format.js` has a hardcoded `PRICES` object — 5 fixed airports (Manchester/Liverpool/Leeds Bradford/Birmingham/Newcastle) with fixed GBP one-way/return prices. Every tenant on the platform would charge identical prices for identical routes until this is externalized (e.g. into a `tenant_id`-keyed pricing table, or `tenants.brand`/a new settings column).
- **Branding/contact details baked into message text, not read from the tenant row**: the literal strings `"EV Exec"` and `"07721 070370"` appear directly inside SMS/email body text in `lib/notify.js`, `api/operator/index.js`, `lib/emailLayout.js`, `api/booking/index.js`, `api/reminders/trigger.js` (94 "07721 070370" occurrences across 23 files, 410 "EV Exec"/evexec occurrences across 47 files repo-wide, including ~40 marketing landing pages). `tenants.contact_email`, `tenants.contact_phone`, and `tenants.brand` (jsonb) already exist specifically to hold this — nothing currently reads from them at send-time. A second tenant's customers would receive "EV Exec" branded, `07721 070370`-signed messages regardless of which operator they actually booked with.
- **Single-value env config**: `OPERATOR_EMAIL` / `OPERATOR_PHONE` in `.env.example` are platform-wide single values, not per-tenant — same gap at the config layer, one level up from the hardcoded strings above.
- **evexecoperator / evexecdriverapp**: 65 and 19 "EV Exec"/evexec literal-string occurrences respectively (e.g. `brandLogo.js`, `manifest.ts`, push/email templates, PWA `manifest.json`, login/reset-password screens). Not individually line-audited in this pass, but the same tenant-branding gap almost certainly applies — worth a follow-up sweep before onboarding a second tenant.

## Test coverage

- **evexec**: Playwright e2e suite, 7 spec files (booking API, booking-wizard UI, payment flow, operator flow, account API, pricing/format, edge cases). Reasonable coverage of the customer booking path; not run against production by standing policy.
- **evexecoperator**: vitest, 129 tests passing (confirmed earlier this session).
- **evexecdriverapp**: no test suite at all — zero project test files (only third-party tests under `node_modules`). For an app a buyer would be reselling to other operators' drivers, this is a real diligence gap worth closing before resale, not just a nice-to-have.

## Secrets

Light scan across all three repos for committed live credentials (Stripe `sk_live_`, Twilio Account SID pattern, Resend `re_`, raw signed JWTs) found no leaked live secrets — only placeholder values in each repo's `.env.example`. Not an exhaustive pass (no git-history scan, no automated secret-scanner run), but no immediate red flag.

## What "sellable as multi-tenant SaaS" actually still requires

1. Extend `tenant_id` + tenant-scoped RLS to the 17 tables listed above (or deliberately document any that are intentionally platform-global — most clearly aren't: driver locations/messages/shifts, notification logs, audit logs).
2. Replace every hardcoded `PRICES` / brand-name / phone / domain literal with a lookup against `tenants.brand` / `tenants.contact_*` (or a new per-tenant pricing table), across all three repos' send paths and templates.
3. Resolve the 4 Supabase security-advisor findings above — particularly reviewing whether the `SECURITY DEFINER` functions callable by `anon`/`authenticated` do their own tenant/ownership checks internally.
4. Verify (or build out) an actual tenant-provisioning flow — create tenant, invite an `operator_admin`, configure isolated branding/pricing — via the existing `manage-tenants` edge function or a UI on top of it. Not exercised in this audit.
5. Add a real test suite to `evexecdriverapp` before treating it as resale-ready.

## Update — 2026-09-22: security-advisor / live-bug fixes applied

Fixed directly against production (migration `20260922200000_fix_security_advisor_findings.sql`, present in all three repos):

- **`queue_customer_sms` abuse vector (real, live-today bug, not just a future-tenant concern)**: this `SECURITY DEFINER` function had no internal authorization check at all. `evexecoperator/src/app/api/booking-response/route.ts` calls it after only checking the caller has *some* valid Supabase session (`auth.getUser(token)`), not that they're actually staff — so any authenticated account (e.g. any customer login) could have called the RPC directly with an arbitrary `ref`/`recipient`/`body` and queued an SMS to any phone number, on the business's paid Twilio number, with attacker-controlled text. Fixed by adding an internal check that the caller is staff for the tenant that owns the referenced booking; the function now silently no-ops otherwise (matching its existing convention for invalid input).
- **`unregister_operator_push` had no ownership check** — any authenticated user who knew/guessed another user's push endpoint could unregister their device. Now scoped to `user_id = auth.uid()`. (Endpoints are long opaque browser-generated URLs, so practical exploitability was low, but the check was simply missing.)
- **`driver_locations` and `job_proofs` staff-read policies used `private.is_staff()`** (any staff of any tenant) instead of tenant-scoped access — harmless with the single current tenant, but a direct live-GPS / job-photo cross-tenant leak the moment a second tenant is onboarded. Both now scoped via `private.staff_for_tenant()` joined through the owning driver/booking, matching the pattern used elsewhere.
- **`audit_log` and `error_log` staff-read policies checked role only, with no `tenant_id` to scope by** — any staff/operator_admin/dispatcher of any tenant could have read the full platform-wide audit trail or error log (including `user_email` and stack traces) once a second tenant existed. Both tables now have a `tenant_id` column (backfilled — both were empty at fix time — and defaulted to the existing tenant; `audit_log` also gets it from the actor's own `tenant_users` row via a new insert trigger), and both read policies are now tenant-scoped.
- Verified as **not** bugs, no change made: `get_push_dispatch_bundle` (its `p_secret` param IS checked against `push_config.webhook_secret` before returning anything — the advisor's "anon-callable" WARN is a false positive against a function that's correctly secret-gated); `get_push_public_key` (returns only the VAPID *public* key, which is meant to be publicly readable by design); `register_operator_push` (already self-scoped to `auth.uid()`, no cross-user risk); `private.staff_users` / `public.push_config` RLS-enabled-no-policy (verified as default-deny — both are only ever read through the `SECURITY DEFINER` wrapper functions above, so the "no explicit policy" lint is cosmetic, not an active gap — left as-is to avoid accidentally widening access).
- The advisor will keep showing `queue_customer_sms` / `unregister_operator_push` / `register_operator_push` / `get_push_*` under "callable by authenticated/anon" — that lint only checks grants, not function bodies, so it can't see the internal checks now in place. Expected, not a residual issue.
- **Not fixed, cannot be fixed from here**: `auth_leaked_password_protection` lives in Supabase Auth config, not the Postgres schema — no tool available in this session reaches it. Toggle it yourself: Supabase Dashboard → Authentication → Sign In / Providers → Password → enable "Leaked password protection" (HaveIBeenPwned check). Free, no cost impact.
- **Re-checked every one of the other 16 gap tables' actual policies (not just their missing column) before deciding what needed fixing**: `booking_audit_log` and `driver_unavailable_dates` are already correctly tenant-scoped via a join to their owning booking/driver — no gap despite lacking their own `tenant_id`. `booking_expenses`, `booking_photos`, `driver_messages`, `driver_shifts`, `driver_events`, `push_subscriptions`, `saved_addresses` have no staff-facing policy at all — self-scoped to the owning driver/customer only, so nothing cross-tenant to leak (staff presumably reads these server-side via service role). `notification_log` and `notification_queue` are `service_role`-only, no client access at all. `push_config` has zero policies (default-deny, read only through the secret-gated function above). `operator_push_subscriptions` is self-scoped to `user_id = auth.uid()`, so a caller can only ever touch their own row regardless of tenant.
- **One left deliberately unfixed, flagged instead**: `notification_channel_settings` has a staff-write policy checked by role only, not tenant — but its schema (`id boolean primary key`) shows it was built as a single global settings row, same pattern as `push_config`, not a per-tenant table. Making it per-tenant is a real schema/product change (add `tenant_id`, decide the multi-row shape, migrate the one existing row), not a one-line policy fix, so it's left as the SaaS-readiness item it already was rather than reshaped under "fix the bug."
- **Not attempted (separate, larger scope — flagged, not silently skipped)**: the hardcoded `PRICES`/brand/phone/domain literals, and the missing `evexecdriverapp` test suite. These are product/architecture decisions or large multi-file refactors, not one-line bug fixes, and weren't touched without a separate scoping conversation.
