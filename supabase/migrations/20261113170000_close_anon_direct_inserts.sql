-- Visitors (anon) and any signed-in account could insert contact messages and quote
-- requests straight into the database with any business's tenant_id and no limit. The
-- website never does this: its contact and quote forms write through the server with the
-- service key, which bypasses these policies, and the server applies the rate limit and the
-- spam check. Removing the insert policies closes the direct route. Staff read and update
-- policies are unchanged. No DROP TABLE; policies only.

drop policy if exists anon_insert_contact_messages on public.contact_messages;
drop policy if exists auth_insert_contact_messages on public.contact_messages;
drop policy if exists anon_insert on public.quote_requests;
