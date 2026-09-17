# Cost policy (hard constraint — read before doing anything)

**We do not pay for any additional cost, under any circumstance, without explicit prior approval from the user.**

This applies to all three repos in this project (`evexec`, `evexecoperator`, `evexecdriverapp`) and to the shared Supabase project (`yoltkmhtxwluqxxpewbl`) they all depend on.

- **No new billed resources, ever, without asking first.** This includes (not an exhaustive list): Supabase database branches, additional Supabase projects, upgraded Supabase/Vercel plan tiers or add-ons, new paid third-party APIs or SaaS tools, additional cloud compute, paid monitoring/observability tiers, domain purchases, etc.
- **The one standing exception is SMS notifications via Twilio.** SMS is an already-accepted, already-capped fallback channel used only when email/push delivery fails. Do not remove or degrade that existing usage — but also do not expand SMS volume or add new SMS-triggering flows without approval, since it's the one channel that isn't free.
- **Before taking any action that would create a new billed resource or increase spend on an existing one, stop and ask.** This applies even to trivially small amounts (pennies, hourly micro-charges) — the rule is "always ask first," not "ask only above some threshold."
- **Prefer free tiers and already-provisioned infrastructure.** When a task could be done either by spinning up a paid resource (e.g. a Supabase branch to test a migration) or by a slower/more careful free alternative (e.g. read-only validation queries plus additive, reversible migrations applied directly, with review), default to the free alternative unless the user has explicitly approved the paid one.
- Abandon or redesign any plan that turns out to require a new cost, rather than proceeding and asking forgiveness after the fact.

# Production baseline

**Commit `36a9e47b6520825514499466d0206fad877e4f70` on `main` is the confirmed canonical production baseline**, verified 2026-09-17 against the live deployment actually served by `www.evexec.co.uk` / `evexec.co.uk` (Vercel deployment `dpl_AMeoawbziDTg1Ru1oGMKpPzAZNak`, project `evexec` / `prj_8Fg2dXA2Bqx5Pxb58RA8Sz0ADgEU`).

This repository (`evexec`) is the single source of truth for the customer-facing website. Do not copy or merge UI/code from `evexecoperator` or `evexecdriverapp` into this repo unless explicitly requested. Vercel is the deployment target, not the source of truth — if the live site ever appears to diverge from this repo's `main`, treat `main` as correct and re-diagnose the deployment/alias, not the other way around. A prior incident (Sep 5 – Sep 16 2026) had the production domain manually promoted to a stale, mid-development feature-branch build (`7866ffa`, forked from `main` at `75aa403`) instead of tracking `main`'s merges — resolved by forcing a fresh git-integrated build (`36a9e47`).
