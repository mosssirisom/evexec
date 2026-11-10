-- Stage 3 of docs/security/2026-11-10-database-hardening-plan.md (approved and applied 10/11/2026).
-- Visitors who are not signed in keep only the table rights their three policies use:
-- the contact form, the quote form and reading reviews. Everything else needs a login
-- (row-level security already returned nothing; now the request is refused outright).
revoke all on all tables in schema public from anon;
grant insert on public.contact_messages, public.quote_requests to anon;
grant select on public.reviews to anon;

-- New tables created by postgres grant nothing to visitors.
alter default privileges for role postgres in schema public revoke all on tables from anon;
