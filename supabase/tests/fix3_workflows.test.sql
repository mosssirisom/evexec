-- Fix 3/4: every legitimate writer still works after the guards.
-- (Complements fix3_driver_writes.test.sql, which covers what is refused.)

-- ── Old Driver App, a whole trip exactly as it sends it (origin/main e531b6e)
select test.login('bbbbbbbb-0000-0000-0000-000000000d01', 'dr1@example.com');
select test.lives($$update public.bookings set driver_confirmed_at = now(), attestation_status = 'confirmed' where id = 'cccccccc-0000-0000-0000-0000000000b1'$$, 'dashboard: confirm pickup');
select test.lives($$update public.bookings set status = 'En Route', updated_at = now(), tracking_started_at = now() where id = 'cccccccc-0000-0000-0000-0000000000b1'$$, 'swipe: Head to Pickup');
select test.lives($$update public.drivers set current_lat = 53.81, current_lng = -3.05, location_updated_at = now() where id = 'bbbbbbbb-0000-0000-0000-000000000d01'$$, 'live GPS while en route');
select test.lives($$update public.bookings set status = 'Arrived', updated_at = now(), arrived_at = now() where id = 'cccccccc-0000-0000-0000-0000000000b1'$$, 'swipe: Arrived');
select test.lives($$update public.bookings set status = 'Passenger On Board', updated_at = now(), passenger_onboard_at = now() where id = 'cccccccc-0000-0000-0000-0000000000b1'$$, 'swipe: Passenger On Board');
select test.lives($$update public.bookings set status = 'Arrived', updated_at = now() where id = 'cccccccc-0000-0000-0000-0000000000b1'$$, 'undo Passenger On Board');
select test.lives($$update public.bookings set status = 'Passenger On Board', updated_at = now(), passenger_onboard_at = now() where id = 'cccccccc-0000-0000-0000-0000000000b1'$$, 'Passenger On Board again');
select test.lives($$update public.bookings set driver_notes = 'Gate 3' where id = 'cccccccc-0000-0000-0000-0000000000b1'$$, 'driver note');
select test.lives($$update public.bookings set status = 'Completed', completed_at = now(), updated_at = now(), payment_method = 'Cash' where id = 'cccccccc-0000-0000-0000-0000000000b1'$$, 'complete with Cash');
select test.as_owner();
select test.ok((select status = 'Completed' and payment_method = 'Cash' and payment_status = 'Unpaid' and driver_notes = 'Gate 3' from public.bookings where id = 'cccccccc-0000-0000-0000-0000000000b1'), 'trip saved as the driver left it');

-- No-show (driver app sets Cancelled + note).
update public.bookings set status = 'En Route' where id = 'cccccccc-0000-0000-0000-0000000000b5';
update public.bookings set assigned_driver_id = 'bbbbbbbb-0000-0000-0000-000000000d01', driver_id = 'bbbbbbbb-0000-0000-0000-000000000d01', status = 'Dispatched' where id = 'cccccccc-0000-0000-0000-0000000000b5';
update public.bookings set status = 'En Route' where id = 'cccccccc-0000-0000-0000-0000000000b5';
update public.bookings set status = 'Arrived' where id = 'cccccccc-0000-0000-0000-0000000000b5';
select test.login('bbbbbbbb-0000-0000-0000-000000000d01', 'dr1@example.com');
select test.lives($$update public.bookings set status = 'Cancelled', driver_notes = 'No show at 09:30', updated_at = now() where id = 'cccccccc-0000-0000-0000-0000000000b5'$$, 'no-show');

-- ── Office roles ────────────────────────────────────────────────────────────
select test.login('aaaaaaaa-0000-0000-0000-0000000000d1', 'dispatch@example.com');
select test.lives($$update public.bookings set quoted_price = 99, customer_phone = '07111111111', notes = 'office' where id = 'cccccccc-0000-0000-0000-0000000000b2'$$, 'dispatcher edits booking details');
select test.lives($$update public.bookings set assigned_driver_id = null, driver_id = null, status = 'Unassigned' where id = 'cccccccc-0000-0000-0000-0000000000b2'$$, 'dispatcher unassigns');
select test.lives($$update public.drivers set phone = '07222222222' where id = 'bbbbbbbb-0000-0000-0000-000000000d02'$$, 'dispatcher edits a driver');
select test.login('aaaaaaaa-0000-0000-0000-00000000005a', 'super@example.com');
select test.lives($$update public.bookings set notes = 'platform', payment_status = 'Paid' where id = 'cccccccc-0000-0000-0000-0000000000b3'$$, 'super_admin edits any business''s booking');
select test.as_owner();
select test.ok((select notes = 'platform' from public.bookings where id = 'cccccccc-0000-0000-0000-0000000000b3'), 'super_admin edit saved');

-- ── Service role (website API, Stripe webhook, edge functions, cron) ───────
select test.as_service();
select test.lives($$update public.bookings set status = 'Dispatched', assigned_driver_id = 'bbbbbbbb-0000-0000-0000-000000000d02', driver_id = 'bbbbbbbb-0000-0000-0000-000000000d02', attestation_status = 'awaiting_first_attestation', price = 90 where id = 'cccccccc-0000-0000-0000-0000000000b2'$$, 'service role: any column (attestation engine, website accept)');
select test.lives($$update public.drivers set kind = 'driver', is_online = false where id = 'bbbbbbbb-0000-0000-0000-000000000d02'$$, 'service role edits driver record (Operator /api/drivers)');

-- ── SECURITY DEFINER functions called with a customer's token ──────────────
-- (sync_my_invoices / sync_my_points / payment RPCs are all owned by postgres)
select test.as_owner();
create function test.definer_touch(p uuid) returns void language sql security definer set search_path = public as
  $$ update public.bookings set notes = 'via definer', payment_status = 'Paid' where id = p $$;
grant execute on function test.definer_touch(uuid) to authenticated;
select test.login('dddddddd-0000-0000-0000-000000000c01', 'cust@example.com');
select test.lives($$select test.definer_touch('cccccccc-0000-0000-0000-0000000000b4')$$, 'customer-called SECURITY DEFINER function is not blocked');
select test.as_owner();
select test.ok((select notes = 'via definer' from public.bookings where id = 'cccccccc-0000-0000-0000-0000000000b4'), 'SECURITY DEFINER write saved');

-- ── Customers and anonymous callers: unchanged (no update rights before either)
select test.login('dddddddd-0000-0000-0000-000000000c01', 'cust@example.com');
update public.bookings set notes = 'customer' where id = 'cccccccc-0000-0000-0000-0000000000b4';
select test.as_owner();
select test.ok((select notes = 'via definer' from public.bookings where id = 'cccccccc-0000-0000-0000-0000000000b4'), 'customer still cannot update bookings directly (RLS, unchanged)');
select set_config('request.jwt.claim.sub', '', true), set_config('role', 'anon', true);
update public.bookings set notes = 'anon' where id = 'cccccccc-0000-0000-0000-0000000000b4';
select test.as_owner();
select test.ok((select notes = 'via definer' from public.bookings where id = 'cccccccc-0000-0000-0000-0000000000b4'), 'anon still cannot update bookings');

-- ── Other BEFORE triggers adjusting NEW don't trip the guard ───────────────
-- update_updated_at always rewrites updated_at; sync triggers keep
-- driver_id/assigned_driver_id equal (live check 15/10/2026: 0 of 71 differ).
select test.login('bbbbbbbb-0000-0000-0000-000000000d02', 'dr2@example.com');
select test.lives($$update public.bookings set status = 'En Route' where id = 'cccccccc-0000-0000-0000-0000000000b2'$$, 'driver update without updated_at (trigger sets it)');
