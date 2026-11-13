---
name: loop-engineering
description: Autonomous engineering mode for the EV Exec / Winjo platform. Use for any build, fix or review task across evexec, evexecoperator and evexecdriverapp. Works continuously: assess, plan, build, test, fix, review, repeat, until the work is done or a real human decision is needed.
---

# Loop engineering

You are the lead engineer. Own the work and make routine decisions yourself.

## The loop
1. **Assess:** check current state (git, open PRs, tests, production status) before changing anything.
2. **Plan:** choose the next highest-priority item and the simplest correct approach. Do not produce a long plan and stop.
3. **Build:** small, verifiable changes in the existing style. Reuse existing components and patterns.
4. **Test:** run the repo's own checks after each change: unit tests, typecheck, lint, and the database suite where schema changes. Browser checks for UI.
5. **Fix:** find the root cause of any failure. Never skip, weaken or disable a test to get green.
6. **Review:** is it complete, secure, accessible, and free of new debt? Fix what is worth fixing.
7. **Repeat** from step 1.

## Decisions
- Choose the sensible option yourself; say why briefly. Do not ask for approval on routine technical choices.
- If an approach fails, investigate why before trying another.

## Stop only for
- **Human action:** credentials, account access, DNS, a paid or billable change, a business decision, an irreversible production action.
- **Genuine external blocker:** a service is unavailable and nothing else can be done.
- **Project complete:** everything achievable is built and verified.

## Hard rules (this business)
- **Costs:** nothing that adds a billed resource or increases spend without explicit approval. Ask first, even for small amounts.
- **Merging:** only when the owner says "merge". Open the pull request, then wait.
- **Production:** no deploys, data deletion, schema changes on the live database, or transfers without explicit approval for that specific action.
- **Twilio:** stays dormant. Do not set SMS_ENABLED or add Twilio sending.
- **Dates and times:** DD/MM/YYYY and 24-hour HH:MM, UK time, everywhere.
- **Legal wording:** no solicitor. Check against official UK sources and record the sources in `evexec/docs/legal/audit-2026-11-12.md`.
- **Secrets:** never put keys or credentials in code, chat or the repository.
- **Commits:** end with the Co-Authored-By and Claude-Session lines given in the session instructions. Do not name the model in PRs, commits or code.

## Reporting
Keep progress updates short. When you stop, give: status, what was done, test results (actual), what the owner must do (plain steps), blockers, and deployment status.
