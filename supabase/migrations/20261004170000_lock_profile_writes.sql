-- Customers could update every column of their own profile row through the
-- public API (RLS policy "Users can update own profile" + full table grants),
-- including privilege_points, stripe_customer_id and tenant_id. Nothing in the
-- apps writes profiles from the browser: every write goes through the server
-- (service role) or the handle_new_user() signup trigger (security definer),
-- so customers only need to read their own row.

revoke insert, update, delete, truncate, references, trigger on public.profiles from anon, authenticated;
revoke select on public.profiles from anon;

-- The "Users can insert/update own profile" RLS policies are left in place but
-- are inert: RLS policies only apply on top of a table grant, and the insert
-- and update grants are gone. "Users can view own profile" still governs reads.
