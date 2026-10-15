-- Assertion helpers and shared fixtures for supabase/tests/*.test.sql.
create schema if not exists test;
grant usage on schema test to anon, authenticated, service_role;

create or replace function test.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;

-- Runs `sql` as the current role and passes only if it raises an error.
create or replace function test.throws(sql text, msg text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    raise notice 'ok - % (refused: %)', msg, sqlerrm;
    return;
  end;
  raise exception 'FAIL: % (statement was allowed)', msg;
end $$;

-- Runs `sql` and passes only if it succeeds.
create or replace function test.lives(sql text, msg text) returns void language plpgsql as $$
begin
  execute sql;
  raise notice 'ok - %', msg;
exception when others then
  raise exception 'FAIL: % (%)', msg, sqlerrm;
end $$;

-- Act as a signed-in user (role authenticated) for the rest of the transaction.
create or replace function test.login(p_user uuid, p_email text default null) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  perform set_config('request.jwt.claim.email', coalesce(p_email, ''), true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('role', 'authenticated', true);
end $$;

create or replace function test.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('role', 'service_role', true);
end $$;

create or replace function test.as_owner() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

grant execute on all functions in schema test to anon, authenticated, service_role;

-- ── Fixtures ────────────────────────────────────────────────────────────────
-- Tenant T1 = EV Exec, T2 = another business.
insert into public.tenants (id, slug, name) values
  ('00000000-0000-0000-0000-000000000001', 'ev-exec', 'EV Exec'),
  ('00000000-0000-0000-0000-000000000002', 'other', 'Other Cars');

-- People (fixed ids so tests read clearly):
--   …a1 = operator_admin of T1, …d1 = dispatcher of T1, …5a = super_admin
--   …d01 = driver (login) of T1, …d02 = another driver of T1
--   …f01 = partner record (no login), …c01 = website customer (no role)
--   …e2 = operator_admin of T2
insert into public.tenant_users (tenant_id, user_id, role) values
  ('00000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'operator_admin'),
  ('00000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000d1', 'dispatcher'),
  (null,                                   'aaaaaaaa-0000-0000-0000-00000000005a', 'super_admin'),
  ('00000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000d01', 'driver'),
  ('00000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000e2', 'operator_admin');

insert into public.drivers (id, name, full_name, email, kind, tenant_id) values
  ('bbbbbbbb-0000-0000-0000-000000000d01', 'Driver One', 'Driver One', 'dr1@example.com', 'driver', '00000000-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000d02', 'Driver Two', 'Driver Two', 'dr2@example.com', 'driver', '00000000-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000f01', 'Partner Taxis', null, 'partner@example.com', 'partner', '00000000-0000-0000-0000-000000000001');

insert into public.push_config (id, vapid_public, vapid_private, webhook_secret) values (true, 'pub', 'priv', 'test-webhook-secret');
insert into vault.decrypted_secrets (name, decrypted_secret) values ('attestation_engine_service_key', 'test-service-key');

-- Bookings: b1 assigned to d01 (unpaid), b2 to d02, b3 invoiced to d01,
-- b4 prepaid to d01, b5 assigned to the partner f01.
insert into public.bookings (id, ref, status, assigned_driver_id, driver_id, quoted_price, payment_status, payment_method, customer_name, travel_date, travel_time, tenant_id) values
  ('cccccccc-0000-0000-0000-0000000000b1', 'EVX-B1', 'Dispatched', 'bbbbbbbb-0000-0000-0000-000000000d01', 'bbbbbbbb-0000-0000-0000-000000000d01', 90, 'Unpaid', null, 'Customer One', '2026-11-01', '09:00', '00000000-0000-0000-0000-000000000001'),
  ('cccccccc-0000-0000-0000-0000000000b2', 'EVX-B2', 'Dispatched', 'bbbbbbbb-0000-0000-0000-000000000d02', 'bbbbbbbb-0000-0000-0000-000000000d02', 90, 'Unpaid', null, 'Customer Two', '2026-11-01', '10:00', '00000000-0000-0000-0000-000000000001'),
  ('cccccccc-0000-0000-0000-0000000000b3', 'EVX-B3', 'Passenger On Board', 'bbbbbbbb-0000-0000-0000-000000000d01', 'bbbbbbbb-0000-0000-0000-000000000d01', 120, 'Invoiced', 'Bank Transfer', 'Account Co', '2026-11-02', '08:00', '00000000-0000-0000-0000-000000000001'),
  ('cccccccc-0000-0000-0000-0000000000b4', 'EVX-B4', 'Passenger On Board', 'bbbbbbbb-0000-0000-0000-000000000d01', 'bbbbbbbb-0000-0000-0000-000000000d01', 90, 'Paid', 'Card', 'Prepaid Person', '2026-11-03', '08:00', '00000000-0000-0000-0000-000000000001'),
  ('cccccccc-0000-0000-0000-0000000000b5', 'EVX-B5', 'Dispatched', 'bbbbbbbb-0000-0000-0000-000000000f01', 'bbbbbbbb-0000-0000-0000-000000000f01', 90, 'Unpaid', null, 'Partner Customer', '2026-11-04', '08:00', '00000000-0000-0000-0000-000000000001');
delete from net.calls;
