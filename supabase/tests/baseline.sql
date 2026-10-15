-- Local test copy of the parts of the live EV Exec database that the
-- security fixes touch. Copied read-only from production on 15/10/2026
-- (table columns, row-level-security policies, and the booking/driver
-- triggers that run on updates). It is NOT a full schema: the repos can't
-- rebuild production (see docs/audits/ev-exec-phase-1-audit.md, H-4).
--
-- Supabase pieces are stubbed so the real SQL runs unchanged:
--   auth.uid()/auth.email()/auth.role()  read request.jwt.claim.* settings
--   net.http_post()                      records calls in net.calls
--   vault.decrypted_secrets              a plain table (+ vault.secrets view, vault.create_secret)
-- Used by supabase/tests/run.sh against a throwaway local PostgreSQL.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

do $$ begin
  create role anon nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role nologin bypassrls;
exception when duplicate_object then null; end $$;

create schema if not exists auth;
create schema if not exists private;
create schema if not exists net;
create schema if not exists vault;
grant usage on schema auth, public, net to anon, authenticated, service_role;
grant usage on schema private to authenticated, service_role;

create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.email() returns text language sql stable as
$$ select nullif(current_setting('request.jwt.claim.email', true), '') $$;
create or replace function auth.role() returns text language sql stable as
$$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
grant execute on all functions in schema auth to anon, authenticated, service_role;

create table net.calls (id bigserial primary key, url text, headers jsonb, body jsonb, at timestamptz default now());
create or replace function net.http_post(
  url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
  headers jsonb default '{"Content-Type": "application/json"}'::jsonb,
  timeout_milliseconds integer default 5000
) returns bigint language plpgsql as $$
declare v bigint;
begin
  insert into net.calls (url, headers, body) values (url, headers, body) returning id into v;
  return v;
end $$;
grant execute on function net.http_post(text, jsonb, jsonb, jsonb, integer) to anon, authenticated, service_role;
grant select, insert on net.calls to anon, authenticated, service_role;
grant usage on sequence net.calls_id_seq to anon, authenticated, service_role;

create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
create view vault.secrets as select md5(name)::uuid as id, name, decrypted_secret as secret from vault.decrypted_secrets;
create or replace function vault.create_secret(new_secret text, new_name text default null, new_description text default '') returns uuid
language sql as $$ insert into vault.decrypted_secrets (name, decrypted_secret) values (new_name, new_secret) returning md5(name)::uuid $$;

-- ── Tables (columns as live; constraints and foreign keys omitted) ──────────
create table public.tenants (
  id uuid primary key default gen_random_uuid(), slug text, name text, contact_email text, contact_phone text,
  brand jsonb default '{}'::jsonb, stripe_connect_account_id text, status text default 'active',
  created_at timestamptz default now(), updated_at timestamptz default now(), pricing jsonb
);
create table public.tenant_users (
  id uuid primary key default gen_random_uuid(), tenant_id uuid, user_id uuid, role text, created_at timestamptz default now(),
  unique (tenant_id, user_id, role)
);
create table private.staff_users (user_id uuid primary key);
create table public.push_config (
  id boolean primary key default true, vapid_public text, vapid_private text, vapid_subject text,
  webhook_secret text, updated_at timestamptz default now()
);
create table public.operator_push_subscriptions (
  id uuid primary key default gen_random_uuid(), endpoint text unique, p256dh text, auth text, label text,
  user_id uuid, created_at timestamptz default now()
);
create table public.drivers (
  id uuid primary key default gen_random_uuid(), full_name text, phone text, vehicle_registration text, vehicle_model text,
  is_online boolean default false, avatar_url text, created_at timestamptz default now(), updated_at timestamptz default now(),
  name text, vehicle text, plate text, rating numeric default 5.0, status text default 'Available', email text,
  licence_expiry date, insurance_expiry date, mot_expiry date, current_lat double precision, current_lng double precision,
  location_updated_at timestamptz, battery_percent integer, license_expiry date, dbs_expiry date, pcol_expiry date,
  tenant_id uuid default '00000000-0000-0000-0000-000000000001', kind text not null default 'driver'
);
create table public.bookings (
  id uuid primary key default gen_random_uuid(), created_at timestamptz default now(), journey_type text, pickup_location text,
  airport text, flight_number text, dropoff_address text, travel_date date, travel_time text, passengers integer default 1,
  luggage text, return_journey boolean default false, return_pickup text, return_airport text, return_flight text,
  return_date date, return_time text, return_destination text, customer_name text, customer_phone text, customer_email text,
  contact_method text default 'WhatsApp', status text default 'pending', operator_note text, quoted_price numeric,
  payment_method text, payment_status text default 'pending', stripe_session_id text, assigned_driver_id uuid,
  driver_notes text, updated_at timestamptz default now(), ref text, flight text, destination text, pickup_time timestamptz,
  driver_id uuid, price numeric, priority boolean default false, notes text, direction text default 'Airport to Destination',
  user_id uuid, vehicle_type text default 'Standard', tracking_started_at timestamptz, arrived_at timestamptz,
  passenger_onboard_at timestamptz, completed_at timestamptz, actual_distance_miles numeric, actual_duration_minutes integer,
  passenger_preferences jsonb default '[]'::jsonb, wait_time_minutes integer, flight_status jsonb, flight_checked_at timestamptz,
  corporate_email text, receipt_sent_at timestamptz, attestation_status text, driver_confirmed_at timestamptz, pob_at timestamptz,
  source text default 'website', offer_status text, offered_at timestamptz, offer_responded_at timestamptz,
  offer_expires_at timestamptz, operator_response text, operator_responded_at timestamptz,
  tenant_id uuid default '00000000-0000-0000-0000-000000000001', attestation_first_deadline timestamptz,
  attestation_second_deadline timestamptz, first_attestation_sent_at timestamptz, second_attestation_sent_at timestamptz,
  operator_alerted_at timestamptz
);
create table public.driver_sms_reminders (
  id uuid primary key default gen_random_uuid(), tenant_id uuid default '00000000-0000-0000-0000-000000000001',
  booking_id uuid, driver_id uuid, reminder_type text, customer_name text, customer_phone text, travel_date date,
  travel_time text, message text, status text default 'pending', pushed_at timestamptz, opened_at timestamptz,
  sent_at timestamptz, created_at timestamptz default now(), unique (booking_id, reminder_type)
);

-- Supabase grants table privileges broadly; RLS does the filtering.
grant all on all tables in schema public to anon, authenticated, service_role;

-- ── Helper functions (as live) ───────────────────────────────────────────────
create or replace function private.is_staff() returns boolean language sql stable security definer set search_path to 'public' as
$$ select exists (select 1 from private.staff_users where user_id = auth.uid()); $$;
create or replace function private.is_super_admin() returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.role = 'super_admin');
$$;
create or replace function private.is_member_of_tenant(target_tenant uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid()
    and (tu.role = 'super_admin' or tu.tenant_id = target_tenant));
$$;
create or replace function private.staff_for_tenant(target_tenant uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid()
    and (tu.role = 'super_admin' or (tu.tenant_id = target_tenant and tu.role in ('operator_admin', 'dispatcher'))));
$$;
grant execute on all functions in schema private to authenticated, service_role;

-- ── RLS policies (as live) ───────────────────────────────────────────────────
alter table public.bookings enable row level security;
alter table public.drivers enable row level security;
alter table public.operator_push_subscriptions enable row level security;
alter table public.driver_sms_reminders enable row level security;
alter table public.tenant_users enable row level security;
alter table public.push_config enable row level security;

create policy bookings_driver_select on public.bookings as permissive for select to public using (((assigned_driver_id = auth.uid()) OR (assigned_driver_id IN ( SELECT drivers.id FROM drivers WHERE (drivers.email = auth.email()))) OR ((EXISTS ( SELECT 1 FROM drivers d WHERE ((d.id = auth.uid()) AND (d.tenant_id = bookings.tenant_id)))) AND (assigned_driver_id IS NULL) AND (status = ANY (ARRAY['pending'::text, 'accepted'::text])))));
create policy bookings_driver_update on public.bookings as permissive for update to public using (((assigned_driver_id = ( SELECT auth.uid() AS uid)) OR (assigned_driver_id IN ( SELECT drivers.id FROM drivers WHERE (drivers.email = ( SELECT auth.email() AS email)))))) with check (((assigned_driver_id = ( SELECT auth.uid() AS uid)) OR (assigned_driver_id IN ( SELECT drivers.id FROM drivers WHERE (drivers.email = ( SELECT auth.email() AS email))))));
create policy customers_see_own_bookings on public.bookings as permissive for select to authenticated using ((user_id = ( SELECT auth.uid() AS uid)));
create policy staff_all_bookings on public.bookings as permissive for all to public using (private.staff_for_tenant(tenant_id)) with check (private.staff_for_tenant(tenant_id));
create policy driver_insert_own_sms_reminders on public.driver_sms_reminders as permissive for insert to authenticated with check (((driver_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1 FROM bookings b WHERE ((b.id = driver_sms_reminders.booking_id) AND (b.assigned_driver_id = ( SELECT auth.uid() AS uid)) AND (b.tenant_id = driver_sms_reminders.tenant_id))))));
create policy driver_select_own_sms_reminders on public.driver_sms_reminders as permissive for select to public using (((driver_id = auth.uid()) OR (driver_id IN ( SELECT drivers.id FROM drivers WHERE (drivers.email = auth.email())))));
create policy driver_update_own_sms_reminders on public.driver_sms_reminders as permissive for update to public using (((driver_id = auth.uid()) OR (driver_id IN ( SELECT drivers.id FROM drivers WHERE (drivers.email = auth.email()))))) with check (((driver_id = auth.uid()) OR (driver_id IN ( SELECT drivers.id FROM drivers WHERE (drivers.email = auth.email())))));
create policy staff_select_sms_reminders on public.driver_sms_reminders as permissive for select to public using (private.staff_for_tenant(tenant_id));
create policy staff_update_sms_reminders on public.driver_sms_reminders as permissive for update to public using (private.staff_for_tenant(tenant_id)) with check (private.staff_for_tenant(tenant_id));
create policy drivers_self_select on public.drivers as permissive for select to public using (((email = ( SELECT auth.email() AS email)) OR (( SELECT auth.uid() AS uid) = id)));
create policy drivers_self_update on public.drivers as permissive for update to public using (((email = ( SELECT auth.email() AS email)) OR (( SELECT auth.uid() AS uid) = id))) with check (((email = ( SELECT auth.email() AS email)) OR (( SELECT auth.uid() AS uid) = id)));
create policy staff_all_drivers on public.drivers as permissive for all to public using (private.staff_for_tenant(tenant_id)) with check (private.staff_for_tenant(tenant_id));
create policy staff_manage_own_push_subscription on public.operator_push_subscriptions as permissive for all to authenticated using (((user_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM tenant_users tu WHERE ((tu.user_id = auth.uid()) AND (tu.role = ANY (ARRAY['super_admin'::text, 'operator_admin'::text, 'dispatcher'::text]))))))) with check (((user_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM tenant_users tu WHERE ((tu.user_id = auth.uid()) AND (tu.role = ANY (ARRAY['super_admin'::text, 'operator_admin'::text, 'dispatcher'::text])))))));
create policy tenant_users_self_select on public.tenant_users as permissive for select to public using (((user_id = auth.uid()) OR private.is_super_admin()));

-- ── Functions under test (as live before the fixes) ─────────────────────────
create or replace function public.register_operator_push(p_endpoint text, p_p256dh text, p_auth text, p_label text default null::text)
 returns void language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
begin
  insert into public.operator_push_subscriptions (endpoint, p256dh, auth, label, user_id)
  values (p_endpoint, p_p256dh, p_auth, p_label, auth.uid())
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh, auth = excluded.auth,
        label = excluded.label, user_id = excluded.user_id;
end;
$function$;

create or replace function public.unregister_operator_push(p_endpoint text)
 returns void language sql security definer set search_path to 'public', 'pg_temp' as $function$
  delete from public.operator_push_subscriptions
  where endpoint = p_endpoint and user_id = auth.uid();
$function$;

create or replace function public.get_push_dispatch_bundle(p_secret text)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $function$
declare c public.push_config; v jsonb;
begin
  select * into c from public.push_config where id = true;
  if c.webhook_secret is null or p_secret is distinct from c.webhook_secret then
    return null;
  end if;
  select jsonb_build_object(
    'vapid_public',  c.vapid_public,
    'vapid_private', c.vapid_private,
    'vapid_subject', coalesce(c.vapid_subject, 'mailto:book@evexec.co.uk'),
    'subscriptions', coalesce((
      select jsonb_agg(jsonb_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth))
      from public.operator_push_subscriptions), '[]'::jsonb)
  ) into v;
  return v;
end;
$function$;

revoke execute on function public.register_operator_push(text, text, text, text) from public;
revoke execute on function public.unregister_operator_push(text) from public;
revoke execute on function public.get_push_dispatch_bundle(text) from public;
grant execute on function public.register_operator_push(text, text, text, text) to authenticated, service_role;
grant execute on function public.unregister_operator_push(text) to authenticated, service_role;
grant execute on function public.get_push_dispatch_bundle(text) to anon, authenticated, service_role;

-- Live notify_driver_new_booking sends the public anon key in an
-- Authorization header; the literal is replaced here so no key is stored in
-- the repo. Nothing in the tests depends on its value.
create or replace function public.notify_driver_new_booking()
 returns trigger language plpgsql security definer set search_path to '' as $function$
begin
  if NEW.assigned_driver_id is null then
    return NEW;
  end if;
  if TG_OP = 'UPDATE' and
     OLD.assigned_driver_id is not distinct from NEW.assigned_driver_id then
    return NEW;
  end if;
  perform net.http_post(
    url     := 'https://yoltkmhtxwluqxxpewbl.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ANON_KEY_REDACTED'
               ),
    body    := jsonb_build_object('record', row_to_json(NEW))
  );
  return NEW;
end;
$function$;

create or replace function public.notify_driver_job_update()
 returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
DECLARE
  cancelled_statuses text[] := ARRAY['cancelled','Cancelled','canceled','Canceled'];
  is_cancelled       boolean;
  detail_changed     boolean;
  payload            jsonb;
BEGIN
  IF new.assigned_driver_id IS NULL THEN RETURN new; END IF;
  is_cancelled := new.status = ANY(cancelled_statuses)
               AND NOT (old.status = ANY(cancelled_statuses));
  detail_changed := (
    new.travel_date      IS DISTINCT FROM old.travel_date     OR
    new.travel_time      IS DISTINCT FROM old.travel_time     OR
    new.pickup_location  IS DISTINCT FROM old.pickup_location OR
    new.airport          IS DISTINCT FROM old.airport         OR
    new.dropoff_address  IS DISTINCT FROM old.dropoff_address
  ) AND NOT (new.status = ANY(cancelled_statuses));
  IF NOT (is_cancelled OR detail_changed) THEN RETURN new; END IF;
  payload := jsonb_build_object(
    'record', jsonb_build_object(
      'id', new.id, 'ref', new.ref, 'status', new.status, 'assigned_driver_id', new.assigned_driver_id,
      'customer_name', new.customer_name, 'travel_date', new.travel_date, 'travel_time', new.travel_time,
      'pickup_location', new.pickup_location, 'airport', new.airport, 'dropoff_address', new.dropoff_address,
      'journey_type', new.journey_type
    ),
    'old_record', jsonb_build_object(
      'id', old.id, 'status', old.status, 'travel_date', old.travel_date, 'travel_time', old.travel_time,
      'pickup_location', old.pickup_location, 'airport', old.airport, 'dropoff_address', old.dropoff_address
    )
  );
  PERFORM net.http_post(
    url     := 'https://yoltkmhtxwluqxxpewbl.supabase.co/functions/v1/notify-job-update',
    body    := payload,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'attestation_engine_service_key' LIMIT 1
      )
    )
  );
  RETURN new;
END;
$function$;

-- ── Booking/driver triggers that run on updates (as live) ───────────────────
create or replace function public.update_updated_at() returns trigger language plpgsql set search_path to 'public', 'pg_temp' as $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
create or replace function public.sync_assigned_driver_id() returns trigger language plpgsql set search_path to 'public', 'pg_temp' as $$
BEGIN
  IF NEW.driver_id IS NOT NULL AND NEW.assigned_driver_id IS NULL THEN NEW.assigned_driver_id := NEW.driver_id; END IF;
  RETURN NEW;
END; $$;
create or replace function public.sync_booking_driver_assignment_fields() returns trigger language plpgsql set search_path to 'public', 'pg_temp' as $$
begin
  if new.driver_id is not null and new.assigned_driver_id is distinct from new.driver_id then
    new.assigned_driver_id := new.driver_id;
  elsif new.assigned_driver_id is not null and new.driver_id is distinct from new.assigned_driver_id then
    new.driver_id := new.assigned_driver_id;
  end if;
  return new;
end; $$;
create or replace function public.enforce_booking_status_transition() returns trigger language plpgsql set search_path to 'public', 'pg_temp' as $function$
DECLARE allowed text[];
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  CASE OLD.status
    WHEN 'Unassigned' THEN allowed := ARRAY['Dispatched', 'Cancelled', 'Unassigned / Missed Call Recovery'];
    WHEN 'Unassigned / Missed Call Recovery' THEN allowed := ARRAY['Dispatched', 'Cancelled'];
    WHEN 'accepted', 'confirmed' THEN allowed := ARRAY['En Route', 'Dispatched', 'Cancelled'];
    WHEN 'Dispatched' THEN allowed := ARRAY['En Route', 'Cancelled', 'Unassigned'];
    WHEN 'En Route', 'en_route' THEN allowed := ARRAY['Arrived', 'Passenger On Board', 'Cancelled', 'Dispatched'];
    WHEN 'Arrived', 'arrived' THEN allowed := ARRAY['Passenger On Board', 'Cancelled', 'En Route'];
    WHEN 'Active', 'active' THEN allowed := ARRAY['Arrived', 'Passenger On Board', 'Completed', 'Cancelled'];
    WHEN 'Passenger On Board' THEN allowed := ARRAY['Completed', 'Arrived', 'Cancelled', 'En Route'];
    WHEN 'Completed', 'completed' THEN
      IF NEW.status = 'Passenger On Board' THEN RETURN NEW; END IF;
      RAISE EXCEPTION 'Booking % is already Completed and cannot be changed.', NEW.id;
    WHEN 'Cancelled', 'cancelled', 'Canceled', 'canceled' THEN
      IF NEW.status = 'Unassigned' THEN RETURN NEW; END IF;
      RAISE EXCEPTION 'Booking % is already Cancelled and cannot be changed.', NEW.id;
    WHEN 'No Show', 'no show' THEN
      RAISE EXCEPTION 'Booking % is already a No Show and cannot be changed.', NEW.id;
    WHEN 'CRITICAL_UNALLOCATED' THEN allowed := ARRAY['Dispatched', 'Cancelled'];
    ELSE RETURN NEW;
  END CASE;
  IF NOT (NEW.status = ANY(allowed)) THEN
    RAISE EXCEPTION 'Invalid status transition from "%" to "%". Allowed: %', OLD.status, NEW.status, array_to_string(allowed, ', ');
  END IF;
  RETURN NEW;
END; $function$;

create trigger booking_status_transition before update on public.bookings for each row when ((old.status is distinct from new.status)) execute function enforce_booking_status_transition();
create trigger bookings_updated_at before update on public.bookings for each row execute function update_updated_at();
create trigger enforce_booking_status_transition before update of status on public.bookings for each row execute function enforce_booking_status_transition();
create trigger sync_booking_driver_assignment_fields_trigger before insert or update of driver_id, assigned_driver_id on public.bookings for each row execute function sync_booking_driver_assignment_fields();
create trigger trg_sync_assigned_driver_id before insert or update of driver_id on public.bookings for each row execute function sync_assigned_driver_id();
create trigger trg_booking_push after insert or update of assigned_driver_id on public.bookings for each row execute function notify_driver_new_booking();
create trigger trg_notify_job_update after update on public.bookings for each row execute function notify_driver_job_update();
create trigger drivers_updated_at before update on public.drivers for each row execute function update_updated_at();
