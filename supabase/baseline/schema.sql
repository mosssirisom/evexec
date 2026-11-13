-- EV Exec database baseline: the structure of the live project, for tests.
--
-- GENERATED. Do not edit by hand. Rebuild with generate.sql and assemble.py
-- (see README.md). It holds structure and access rules only: no customer data,
-- no secrets, no scheduled jobs.
--
-- It is NOT a migration and is never applied to the live project.

set check_function_bodies = off;
set client_min_messages = warning;


-- ─── Schemas ───────────────────────────────────────────────────────────────

create schema if not exists private;

-- ─── Sequences ─────────────────────────────────────────────────────────────

create sequence public.invoice_seq as bigint increment by 1 minvalue 1 maxvalue 9223372036854775807 start with 1 cache 1;

-- ─── Tables ────────────────────────────────────────────────────────────────

create table private.staff_users (
  user_id uuid not null,
  created_at timestamp with time zone default now() not null
);

create table public.audit_log (
  id uuid default gen_random_uuid() not null,
  actor_id uuid,
  actor_email text,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  details jsonb,
  created_at timestamp with time zone default now(),
  tenant_id uuid default '00000000-0000-0000-0000-000000000001'::uuid not null
);

create table public.booking_audit_log (
  id bigint generated always as identity not null,
  booking_id uuid not null,
  booking_ref text not null,
  field text not null,
  old_value text,
  new_value text,
  changed_by_email text,
  created_at timestamp with time zone default now() not null
);

create table public.booking_expenses (
  id uuid default gen_random_uuid() not null,
  booking_id uuid not null,
  type text not null,
  amount numeric(8,2) not null,
  notes text,
  created_at timestamp with time zone default now()
);

create table public.booking_photos (
  id uuid default gen_random_uuid() not null,
  booking_id uuid not null,
  driver_id uuid not null,
  url text not null,
  caption text,
  created_at timestamp with time zone default now() not null
);

create table public.bookings (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  journey_type text,
  pickup_location text,
  airport text,
  flight_number text,
  dropoff_address text,
  travel_date date,
  travel_time text,
  passengers integer default 1 not null,
  luggage text,
  return_journey boolean default false not null,
  return_pickup text,
  return_airport text,
  return_flight text,
  return_date date,
  return_time text,
  return_destination text,
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  contact_method text default 'WhatsApp'::text not null,
  status text default 'pending'::text not null,
  operator_note text,
  quoted_price numeric(8,2),
  payment_method text,
  payment_status text default 'pending'::text not null,
  stripe_session_id text,
  assigned_driver_id uuid,
  driver_notes text,
  updated_at timestamp with time zone default now(),
  ref text not null,
  flight text,
  destination text,
  pickup_time timestamp with time zone,
  driver_id uuid,
  price numeric(8,2),
  priority boolean default false,
  notes text,
  direction text default 'Airport to Destination'::text,
  user_id uuid,
  vehicle_type text default 'Standard'::text,
  tracking_started_at timestamp with time zone,
  arrived_at timestamp with time zone,
  passenger_onboard_at timestamp with time zone,
  completed_at timestamp with time zone,
  actual_distance_miles numeric(8,2),
  actual_duration_minutes integer,
  passenger_preferences jsonb default '[]'::jsonb,
  wait_time_minutes integer,
  flight_status jsonb,
  flight_checked_at timestamp with time zone,
  corporate_email text,
  receipt_sent_at timestamp with time zone,
  attestation_status text,
  driver_confirmed_at timestamp with time zone,
  pob_at timestamp with time zone,
  source text default 'website'::text not null,
  offer_status text,
  offered_at timestamp with time zone,
  offer_responded_at timestamp with time zone,
  offer_expires_at timestamp with time zone,
  operator_response text,
  operator_responded_at timestamp with time zone,
  tenant_id uuid default '00000000-0000-0000-0000-000000000001'::uuid not null,
  attestation_first_deadline timestamp with time zone,
  attestation_second_deadline timestamp with time zone,
  first_attestation_sent_at timestamp with time zone,
  second_attestation_sent_at timestamp with time zone,
  operator_alerted_at timestamp with time zone,
  terms_version text,
  terms_accepted_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  cancelled_by text,
  cancellation_charge numeric(10,2)
);

create table public.contact_messages (
  id uuid default gen_random_uuid() not null,
  name text not null,
  phone text,
  email text,
  message text not null,
  status text default 'new'::text,
  created_at timestamp with time zone default now(),
  tenant_id uuid default '00000000-0000-0000-0000-000000000001'::uuid not null
);

create table public.driver_events (
  id bigint generated always as identity not null,
  driver_id uuid not null,
  event_type text not null,
  payload jsonb,
  created_at timestamp with time zone default now() not null
);

create table public.driver_locations (
  driver_id uuid not null,
  lat double precision not null,
  lng double precision not null,
  heading double precision,
  speed double precision,
  accuracy double precision,
  booking_ref text,
  updated_at timestamp with time zone default now() not null
);

create table public.driver_messages (
  id uuid default gen_random_uuid() not null,
  driver_id uuid not null,
  body text not null,
  from_driver boolean default true not null,
  created_at timestamp with time zone default now() not null,
  read_at timestamp with time zone
);

create table public.driver_shifts (
  id uuid default gen_random_uuid() not null,
  driver_id uuid not null,
  shift_date date not null,
  start_time time without time zone not null,
  end_time time without time zone not null,
  notes text,
  created_at timestamp with time zone default now()
);

create table public.driver_sms_reminders (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid default '00000000-0000-0000-0000-000000000001'::uuid not null,
  booking_id uuid not null,
  driver_id uuid not null,
  reminder_type text not null,
  customer_name text,
  customer_phone text not null,
  travel_date date,
  travel_time text,
  message text not null,
  status text default 'pending'::text not null,
  pushed_at timestamp with time zone,
  opened_at timestamp with time zone,
  sent_at timestamp with time zone,
  created_at timestamp with time zone default now() not null
);

create table public.driver_unavailable_dates (
  id uuid default gen_random_uuid() not null,
  driver_id uuid not null,
  date date not null,
  created_at timestamp with time zone default now()
);

create table public.drivers (
  id uuid default gen_random_uuid() not null,
  full_name text,
  phone text,
  vehicle_registration text,
  vehicle_model text,
  is_online boolean default false not null,
  avatar_url text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  name text not null,
  vehicle text,
  plate text,
  rating numeric(2,1) default 5.0,
  status text default 'Available'::text not null,
  email text,
  licence_expiry date,
  insurance_expiry date,
  mot_expiry date,
  current_lat double precision,
  current_lng double precision,
  location_updated_at timestamp with time zone,
  battery_percent integer,
  license_expiry date,
  dbs_expiry date,
  pcol_expiry date,
  tenant_id uuid default '00000000-0000-0000-0000-000000000001'::uuid not null,
  kind text default 'driver'::text not null
);

create table public.error_log (
  id uuid default gen_random_uuid() not null,
  message text not null,
  stack text,
  component_stack text,
  url text,
  user_email text,
  context jsonb,
  created_at timestamp with time zone default now(),
  tenant_id uuid default '00000000-0000-0000-0000-000000000001'::uuid not null
);

create table public.flight_verification_settings (
  tenant_id uuid default '00000000-0000-0000-0000-000000000001'::uuid not null,
  pickup_buffer_minutes integer default 45 not null,
  updated_at timestamp with time zone default now() not null,
  updated_by uuid
);

create table public.flight_verifications (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid default '00000000-0000-0000-0000-000000000001'::uuid not null,
  booking_id uuid not null,
  direction text not null,
  flight_number text not null,
  flight_date date not null,
  departure_airport_input text,
  arrival_airport_input text,
  customer_time_input text,
  result text not null,
  severity text not null,
  issues jsonb default '[]'::jsonb not null,
  flight_status text,
  departure_iata text,
  arrival_iata text,
  scheduled_departure timestamp with time zone,
  scheduled_arrival timestamp with time zone,
  estimated_departure timestamp with time zone,
  estimated_arrival timestamp with time zone,
  actual_departure timestamp with time zone,
  actual_arrival timestamp with time zone,
  recommended_pickup timestamp with time zone,
  buffer_minutes_used integer,
  raw_response jsonb,
  source text default 'manual'::text not null,
  verified_by uuid,
  verified_by_name text,
  verified_at timestamp with time zone default now() not null,
  override boolean default false not null,
  override_reason text,
  override_by uuid,
  override_at timestamp with time zone,
  created_at timestamp with time zone default now() not null
);

create table public.invoices (
  id uuid default gen_random_uuid() not null,
  invoice_number text not null,
  booking_ref text,
  customer_name text not null,
  customer_email text,
  customer_phone text,
  customer_address text,
  line_items jsonb default '[]'::jsonb not null,
  subtotal numeric default 0 not null,
  vat_rate numeric default 0 not null,
  vat_amount numeric default 0 not null,
  total numeric default 0 not null,
  status text default 'Draft'::text not null,
  issue_date date default CURRENT_DATE not null,
  due_date date,
  notes text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  journey jsonb default '{}'::jsonb not null,
  tenant_id uuid default '00000000-0000-0000-0000-000000000001'::uuid not null,
  booking_id uuid
);

create table public.job_proofs (
  id uuid default gen_random_uuid() not null,
  booking_id uuid not null,
  kind text not null,
  url text not null,
  created_at timestamp with time zone default now() not null
);

create table public.missed_calls (
  id uuid default gen_random_uuid() not null,
  ref text not null,
  caller text not null,
  notes text,
  attempts integer default 1,
  resolved boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  tenant_id uuid default '00000000-0000-0000-0000-000000000001'::uuid not null
);

create table public.notification_channel_settings (
  id boolean default true not null,
  email_enabled boolean default true not null,
  sms_enabled boolean default true not null,
  whatsapp_enabled boolean default false not null,
  push_enabled boolean default false not null,
  sms_only_when_necessary boolean default true not null,
  updated_at timestamp with time zone default now() not null,
  tenant_id uuid not null
);

create table public.notification_log (
  id bigint generated always as identity not null,
  booking_id uuid not null,
  type text not null,
  channel text not null,
  recipient text,
  sent_at timestamp with time zone default now(),
  tenant_id uuid default '00000000-0000-0000-0000-000000000001'::uuid not null
);

create table public.notification_queue (
  id uuid default gen_random_uuid() not null,
  booking_id uuid,
  type text,
  channel text not null,
  recipient text not null,
  subject text,
  body text,
  html text,
  meta jsonb default '{}'::jsonb,
  status text default 'pending'::text,
  delivery_status text,
  provider_message_id text,
  attempts integer default 0,
  next_attempt_at timestamp with time zone default now(),
  sent_at timestamp with time zone,
  last_error text,
  created_at timestamp with time zone default now(),
  tenant_id uuid default '00000000-0000-0000-0000-000000000001'::uuid not null
);

create table public.operator_push_subscriptions (
  id uuid default gen_random_uuid() not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  label text,
  user_id uuid,
  created_at timestamp with time zone default now() not null,
  tenant_id uuid
);

create table public.operator_sms_tasks (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid default '00000000-0000-0000-0000-000000000001'::uuid not null,
  booking_id uuid not null,
  kind text not null,
  customer_name text,
  customer_phone text not null,
  message text not null,
  status text default 'pending'::text not null,
  pushed_at timestamp with time zone,
  opened_at timestamp with time zone,
  sent_at timestamp with time zone,
  created_at timestamp with time zone default now() not null
);

create table public.points_transactions (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid default '00000000-0000-0000-0000-000000000001'::uuid not null,
  user_id uuid not null,
  booking_id uuid,
  points integer not null,
  type text not null,
  note text,
  created_at timestamp with time zone default now() not null,
  created_by uuid
);

create table public.profiles (
  id uuid not null,
  full_name text,
  phone text,
  avatar_url text,
  push_enabled boolean default false not null,
  privilege_points integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  tenant_id uuid default '00000000-0000-0000-0000-000000000001'::uuid not null,
  stripe_customer_id text,
  notify_email boolean default true not null,
  notify_sms boolean default true not null
);

create table public.push_config (
  id boolean default true not null,
  vapid_public text,
  vapid_private text,
  vapid_subject text,
  webhook_secret text,
  updated_at timestamp with time zone default now() not null
);

create table public.push_subscriptions (
  id uuid default gen_random_uuid() not null,
  driver_id uuid not null,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  created_at timestamp with time zone default now(),
  user_id uuid,
  customer_email text,
  customer_phone text
);

create table public.quote_requests (
  id uuid default gen_random_uuid() not null,
  customer_name text not null,
  phone text not null,
  email text,
  pickup_location text,
  destination text,
  pickup_date date,
  pickup_time text,
  passengers integer default 1,
  luggage text,
  return_required boolean default false,
  return_date date,
  return_time text,
  notes text,
  status text default 'new'::text,
  created_at timestamp with time zone default now(),
  journey_type text,
  airport text,
  flight_number text,
  contact_method text default 'WhatsApp'::text,
  return_airport text,
  return_flight_number text,
  return_pickup text,
  return_destination text,
  tenant_id uuid default '00000000-0000-0000-0000-000000000001'::uuid not null
);

create table public.reviews (
  id uuid default gen_random_uuid() not null,
  reviewer_name text not null,
  rating integer default 5 not null,
  review_text text not null,
  source text default 'Google'::text,
  is_featured boolean default true,
  created_at timestamp with time zone default now(),
  tenant_id uuid default '00000000-0000-0000-0000-000000000001'::uuid not null
);

create table public.saved_addresses (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  label text not null,
  address text not null,
  created_at timestamp with time zone default now() not null
);

create table public.stripe_webhook_events (
  event_id text not null,
  event_type text not null,
  livemode boolean,
  session_id text,
  booking_id uuid,
  status text default 'received'::text not null,
  detail text,
  attempts integer default 1 not null,
  received_at timestamp with time zone default now() not null,
  last_attempt_at timestamp with time zone default now() not null,
  processed_at timestamp with time zone,
  notified_at timestamp with time zone
);

create table public.stripe_webhook_rejections (
  id bigint generated always as identity not null,
  received_at timestamp with time zone default now() not null,
  reason text not null,
  claimed_event_id text,
  diagnostics jsonb
);

create table public.tenant_users (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid,
  user_id uuid not null,
  role text not null,
  created_at timestamp with time zone default now() not null
);

create table public.tenants (
  id uuid default gen_random_uuid() not null,
  slug text not null,
  name text not null,
  contact_email text,
  contact_phone text,
  brand jsonb default '{}'::jsonb not null,
  stripe_connect_account_id text,
  stripe_connect_charges_enabled boolean default false not null,
  stripe_connect_details_submitted boolean default false not null,
  stripe_connect_checked_at timestamp with time zone,
  status text default 'active'::text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  pricing jsonb,
  ref_prefix text default 'EVX'::text not null
);


-- ─── Primary keys, unique and check constraints ────────────────────────────

alter table only private.staff_users add constraint staff_users_pkey PRIMARY KEY (user_id);
alter table only public.audit_log add constraint audit_log_pkey PRIMARY KEY (id);
alter table only public.booking_audit_log add constraint booking_audit_log_pkey PRIMARY KEY (id);
alter table only public.booking_expenses add constraint booking_expenses_pkey PRIMARY KEY (id);
alter table only public.booking_photos add constraint booking_photos_pkey PRIMARY KEY (id);
alter table only public.bookings add constraint bookings_offer_status_check CHECK ((offer_status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'expired'::text])));
alter table only public.bookings add constraint bookings_operator_response_check CHECK ((operator_response = ANY (ARRAY['accepted'::text, 'rejected'::text])));
alter table only public.bookings add constraint bookings_payment_method_check CHECK ((payment_method = ANY (ARRAY['card'::text, 'cash'::text, 'Card'::text, 'Card machine'::text, 'Payment link'::text, 'Cash'::text, 'Bank transfer'::text, 'Bank Transfer'::text])));
alter table only public.bookings add constraint bookings_payment_status_check CHECK ((payment_status = ANY (ARRAY['Unpaid'::text, 'Paid'::text, 'Invoiced'::text])));
alter table only public.bookings add constraint bookings_pkey PRIMARY KEY (id);
alter table only public.bookings add constraint bookings_ref_format_any CHECK ((ref ~ '^[A-Z]{2,5}-[A-Z0-9]+$'::text));
alter table only public.bookings add constraint bookings_ref_unique UNIQUE (ref);
alter table only public.bookings add constraint bookings_require_travel_datetime CHECK (((travel_date IS NOT NULL) AND (NULLIF(btrim(travel_time), ''::text) IS NOT NULL)));
alter table only public.bookings add constraint bookings_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'confirmed'::text, 'Dispatched'::text, 'rejected'::text, 'cancelled'::text, 'Cancelled'::text, 'en_route'::text, 'En Route'::text, 'arrived'::text, 'Arrived'::text, 'active'::text, 'Active'::text, 'Passenger On Board'::text, 'No Show'::text, 'completed'::text, 'Completed'::text, 'Unassigned'::text, 'Unassigned / Missed Call Recovery'::text, 'CRITICAL_UNALLOCATED'::text])));
alter table only public.contact_messages add constraint contact_messages_pkey PRIMARY KEY (id);
alter table only public.driver_events add constraint driver_events_pkey PRIMARY KEY (id);
alter table only public.driver_locations add constraint driver_locations_accuracy_check CHECK ((accuracy >= (0)::double precision));
alter table only public.driver_locations add constraint driver_locations_heading_check CHECK (((heading >= (0)::double precision) AND (heading < (360)::double precision)));
alter table only public.driver_locations add constraint driver_locations_lat_check CHECK (((lat >= ('-90'::integer)::double precision) AND (lat <= (90)::double precision)));
alter table only public.driver_locations add constraint driver_locations_lng_check CHECK (((lng >= ('-180'::integer)::double precision) AND (lng <= (180)::double precision)));
alter table only public.driver_locations add constraint driver_locations_pkey PRIMARY KEY (driver_id);
alter table only public.driver_locations add constraint driver_locations_speed_check CHECK ((speed >= (0)::double precision));
alter table only public.driver_messages add constraint driver_messages_pkey PRIMARY KEY (id);
alter table only public.driver_shifts add constraint driver_shifts_pkey PRIMARY KEY (id);
alter table only public.driver_sms_reminders add constraint driver_sms_reminders_booking_id_reminder_type_key UNIQUE (booking_id, reminder_type);
alter table only public.driver_sms_reminders add constraint driver_sms_reminders_pkey PRIMARY KEY (id);
alter table only public.driver_sms_reminders add constraint driver_sms_reminders_reminder_type_check CHECK ((reminder_type = ANY (ARRAY['7day'::text, '24hr'::text, '24hr_return'::text, 'en_route'::text, 'arrived'::text, 'cancelled'::text])));
alter table only public.driver_sms_reminders add constraint driver_sms_reminders_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'opened'::text, 'sent'::text])));
alter table only public.driver_unavailable_dates add constraint driver_unavailable_dates_pkey PRIMARY KEY (id);
alter table only public.driver_unavailable_dates add constraint uq_driver_date UNIQUE (driver_id, date);
alter table only public.drivers add constraint drivers_battery_percent_check CHECK (((battery_percent >= 0) AND (battery_percent <= 100)));
alter table only public.drivers add constraint drivers_kind_check CHECK ((kind = ANY (ARRAY['driver'::text, 'partner'::text])));
alter table only public.drivers add constraint drivers_pkey PRIMARY KEY (id);
alter table only public.drivers add constraint drivers_rating_check CHECK (((rating >= 0.0) AND (rating <= 5.0)));
alter table only public.drivers add constraint drivers_status_check CHECK ((status = ANY (ARRAY['Available'::text, 'Available soon'::text, 'En route'::text, 'Passenger onboard'::text, 'Off duty'::text])));
alter table only public.error_log add constraint error_log_pkey PRIMARY KEY (id);
alter table only public.flight_verification_settings add constraint flight_verification_settings_pickup_buffer_minutes_check CHECK (((pickup_buffer_minutes >= 0) AND (pickup_buffer_minutes <= 240)));
alter table only public.flight_verification_settings add constraint flight_verification_settings_pkey PRIMARY KEY (tenant_id);
alter table only public.flight_verifications add constraint flight_verifications_direction_check CHECK ((direction = ANY (ARRAY['arrival'::text, 'departure'::text])));
alter table only public.flight_verifications add constraint flight_verifications_pkey PRIMARY KEY (id);
alter table only public.flight_verifications add constraint flight_verifications_result_check CHECK ((result = ANY (ARRAY['verified'::text, 'mismatch'::text, 'unavailable'::text, 'error'::text])));
alter table only public.flight_verifications add constraint flight_verifications_severity_check CHECK ((severity = ANY (ARRAY['green'::text, 'amber'::text, 'red'::text])));
alter table only public.flight_verifications add constraint flight_verifications_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'auto_initial'::text, 'auto_day_before'::text])));
alter table only public.invoices add constraint invoices_invoice_number_key UNIQUE (invoice_number);
alter table only public.invoices add constraint invoices_pkey PRIMARY KEY (id);
alter table only public.invoices add constraint invoices_status_check CHECK ((status = ANY (ARRAY['Draft'::text, 'Sent'::text, 'Paid'::text, 'Void'::text])));
alter table only public.job_proofs add constraint job_proofs_kind_check CHECK ((kind = ANY (ARRAY['pob_photo'::text, 'signature'::text, 'completion_photo'::text, 'no_show_photo'::text])));
alter table only public.job_proofs add constraint job_proofs_pkey PRIMARY KEY (id);
alter table only public.missed_calls add constraint missed_calls_attempts_check CHECK ((attempts >= 0));
alter table only public.missed_calls add constraint missed_calls_pkey PRIMARY KEY (id);
alter table only public.missed_calls add constraint missed_calls_ref_key UNIQUE (ref);
alter table only public.notification_channel_settings add constraint notification_channel_settings_pkey PRIMARY KEY (tenant_id);
alter table only public.notification_log add constraint notification_log_pkey PRIMARY KEY (id);
alter table only public.notification_queue add constraint notification_queue_pkey PRIMARY KEY (id);
alter table only public.operator_push_subscriptions add constraint operator_push_subscriptions_endpoint_key UNIQUE (endpoint);
alter table only public.operator_push_subscriptions add constraint operator_push_subscriptions_pkey PRIMARY KEY (id);
alter table only public.operator_sms_tasks add constraint operator_sms_tasks_booking_id_kind_key UNIQUE (booking_id, kind);
alter table only public.operator_sms_tasks add constraint operator_sms_tasks_kind_check CHECK ((kind = ANY (ARRAY['confirmation'::text, 'rejection'::text, 'cancellation'::text])));
alter table only public.operator_sms_tasks add constraint operator_sms_tasks_pkey PRIMARY KEY (id);
alter table only public.operator_sms_tasks add constraint operator_sms_tasks_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'opened'::text, 'sent'::text])));
alter table only public.points_transactions add constraint points_transactions_pkey PRIMARY KEY (id);
alter table only public.points_transactions add constraint points_transactions_points_check CHECK ((points <> 0));
alter table only public.points_transactions add constraint points_transactions_type_check CHECK ((type = ANY (ARRAY['journey_completed'::text, 'adjustment'::text, 'reversal'::text])));
alter table only public.profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table only public.push_config add constraint push_config_pkey PRIMARY KEY (id);
alter table only public.push_config add constraint push_config_singleton CHECK (id);
alter table only public.push_subscriptions add constraint push_subscriptions_pkey PRIMARY KEY (id);
alter table only public.push_subscriptions add constraint uq_driver_endpoint UNIQUE (driver_id, endpoint);
alter table only public.quote_requests add constraint quote_requests_pkey PRIMARY KEY (id);
alter table only public.reviews add constraint reviews_pkey PRIMARY KEY (id);
alter table only public.saved_addresses add constraint saved_addresses_pkey PRIMARY KEY (id);
alter table only public.stripe_webhook_events add constraint stripe_webhook_events_pkey PRIMARY KEY (event_id);
alter table only public.stripe_webhook_rejections add constraint stripe_webhook_rejections_pkey PRIMARY KEY (id);
alter table only public.tenant_users add constraint tenant_users_pkey PRIMARY KEY (id);
alter table only public.tenant_users add constraint tenant_users_role_check CHECK ((role = ANY (ARRAY['super_admin'::text, 'operator_admin'::text, 'dispatcher'::text, 'driver'::text])));
alter table only public.tenant_users add constraint tenant_users_tenant_id_user_id_role_key UNIQUE (tenant_id, user_id, role);
alter table only public.tenant_users add constraint tenant_users_tenant_role_consistency CHECK ((((role = 'super_admin'::text) AND (tenant_id IS NULL)) OR ((role <> 'super_admin'::text) AND (tenant_id IS NOT NULL))));
alter table only public.tenants add constraint tenants_pkey PRIMARY KEY (id);
alter table only public.tenants add constraint tenants_ref_prefix_format CHECK ((ref_prefix ~ '^[A-Z]{2,5}$'::text));
alter table only public.tenants add constraint tenants_slug_key UNIQUE (slug);
alter table only public.tenants add constraint tenants_status_check CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text])));

-- ─── Foreign keys ──────────────────────────────────────────────────────────

alter table only private.staff_users add constraint staff_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table only public.audit_log add constraint audit_log_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id);
alter table only public.booking_audit_log add constraint booking_audit_log_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;
alter table only public.booking_expenses add constraint booking_expenses_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;
alter table only public.booking_photos add constraint booking_photos_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;
alter table only public.booking_photos add constraint booking_photos_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES drivers(id);
alter table only public.bookings add constraint bookings_assigned_driver_id_fkey FOREIGN KEY (assigned_driver_id) REFERENCES drivers(id);
alter table only public.bookings add constraint bookings_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL;
alter table only public.bookings add constraint bookings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id);
alter table only public.bookings add constraint bookings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table only public.contact_messages add constraint contact_messages_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id);
alter table only public.driver_events add constraint driver_events_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE;
alter table only public.driver_locations add constraint driver_locations_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE;
alter table only public.driver_messages add constraint driver_messages_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES drivers(id);
alter table only public.driver_shifts add constraint driver_shifts_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES drivers(id);
alter table only public.driver_sms_reminders add constraint driver_sms_reminders_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;
alter table only public.driver_sms_reminders add constraint driver_sms_reminders_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE;
alter table only public.driver_sms_reminders add constraint driver_sms_reminders_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id);
alter table only public.driver_unavailable_dates add constraint driver_unavailable_dates_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE;
alter table only public.drivers add constraint drivers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id);
alter table only public.error_log add constraint error_log_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id);
alter table only public.flight_verification_settings add constraint flight_verification_settings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id);
alter table only public.flight_verification_settings add constraint flight_verification_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
alter table only public.flight_verifications add constraint flight_verifications_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;
alter table only public.flight_verifications add constraint flight_verifications_override_by_fkey FOREIGN KEY (override_by) REFERENCES auth.users(id);
alter table only public.flight_verifications add constraint flight_verifications_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id);
alter table only public.flight_verifications add constraint flight_verifications_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES auth.users(id);
alter table only public.invoices add constraint invoices_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL;
alter table only public.invoices add constraint invoices_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id);
alter table only public.job_proofs add constraint job_proofs_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;
alter table only public.missed_calls add constraint missed_calls_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id);
alter table only public.notification_channel_settings add constraint notification_channel_settings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public.notification_log add constraint notification_log_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id);
alter table only public.notification_queue add constraint notification_queue_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id);
alter table only public.operator_push_subscriptions add constraint operator_push_subscriptions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public.operator_sms_tasks add constraint operator_sms_tasks_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;
alter table only public.operator_sms_tasks add constraint operator_sms_tasks_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id);
alter table only public.points_transactions add constraint points_transactions_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL;
alter table only public.points_transactions add constraint points_transactions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id);
alter table only public.points_transactions add constraint points_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table only public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table only public.profiles add constraint profiles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id);
alter table only public.push_subscriptions add constraint push_subscriptions_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE;
alter table only public.push_subscriptions add constraint push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table only public.quote_requests add constraint quote_requests_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id);
alter table only public.reviews add constraint reviews_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id);
alter table only public.saved_addresses add constraint saved_addresses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table only public.tenant_users add constraint tenant_users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
alter table only public.tenant_users add constraint tenant_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ─── Indexes ───────────────────────────────────────────────────────────────

CREATE INDEX audit_log_tenant_id_idx ON public.audit_log USING btree (tenant_id);
CREATE INDEX booking_audit_log_booking_id_idx ON public.booking_audit_log USING btree (booking_id);
CREATE INDEX booking_audit_log_created_at_idx ON public.booking_audit_log USING btree (created_at DESC);
CREATE INDEX booking_photos_booking_idx ON public.booking_photos USING btree (booking_id);
CREATE INDEX bookings_tenant_id_idx ON public.bookings USING btree (tenant_id);
CREATE INDEX contact_messages_tenant_id_idx ON public.contact_messages USING btree (tenant_id);
CREATE INDEX driver_messages_driver_created_idx ON public.driver_messages USING btree (driver_id, created_at);
CREATE INDEX driver_shifts_driver_date_idx ON public.driver_shifts USING btree (driver_id, shift_date);
CREATE INDEX driver_sms_reminders_driver_id_idx ON public.driver_sms_reminders USING btree (driver_id);
CREATE INDEX driver_sms_reminders_pending_push_idx ON public.driver_sms_reminders USING btree (id) WHERE ((status = 'pending'::text) AND (pushed_at IS NULL));
CREATE INDEX driver_sms_reminders_tenant_id_idx ON public.driver_sms_reminders USING btree (tenant_id);
CREATE INDEX drivers_tenant_id_idx ON public.drivers USING btree (tenant_id);
CREATE INDEX error_log_tenant_id_idx ON public.error_log USING btree (tenant_id);
CREATE INDEX flight_verifications_booking_idx ON public.flight_verifications USING btree (booking_id, verified_at DESC);
CREATE INDEX flight_verifications_tenant_idx ON public.flight_verifications USING btree (tenant_id);
CREATE INDEX idx_audit_log_created_at ON public.audit_log USING btree (created_at DESC);
CREATE INDEX idx_audit_log_entity ON public.audit_log USING btree (entity_type, entity_id);
CREATE INDEX idx_booking_expenses_booking_id ON public.booking_expenses USING btree (booking_id);
CREATE INDEX idx_booking_photos_driver_id ON public.booking_photos USING btree (driver_id);
CREATE INDEX idx_bookings_assigned_driver ON public.bookings USING btree (assigned_driver_id);
CREATE INDEX idx_bookings_attestation_active ON public.bookings USING btree (attestation_status) WHERE (attestation_status = ANY (ARRAY['awaiting_first_attestation'::text, 'awaiting_second_attestation'::text]));
CREATE INDEX idx_bookings_created_at ON public.bookings USING btree (created_at DESC);
CREATE INDEX idx_bookings_driver_id ON public.bookings USING btree (driver_id);
CREATE INDEX idx_bookings_offer_status ON public.bookings USING btree (offer_status);
CREATE INDEX idx_bookings_pickup_time ON public.bookings USING btree (pickup_time);
CREATE INDEX idx_bookings_ref ON public.bookings USING btree (ref);
CREATE INDEX idx_bookings_status ON public.bookings USING btree (status);
CREATE INDEX idx_bookings_travel_date ON public.bookings USING btree (travel_date);
CREATE INDEX idx_bookings_user_id ON public.bookings USING btree (user_id);
CREATE INDEX idx_driver_events_driver_id ON public.driver_events USING btree (driver_id, created_at DESC);
CREATE INDEX idx_driver_locations_updated_at ON public.driver_locations USING btree (updated_at DESC);
CREATE INDEX idx_drivers_is_online ON public.drivers USING btree (is_online);
CREATE INDEX idx_error_log_created_at ON public.error_log USING btree (created_at DESC);
CREATE INDEX idx_job_proofs_booking_id ON public.job_proofs USING btree (booking_id);
CREATE INDEX idx_missed_calls_ref ON public.missed_calls USING btree (ref);
CREATE INDEX idx_missed_calls_resolved ON public.missed_calls USING btree (resolved);
CREATE INDEX idx_notification_queue_booking ON public.notification_queue USING btree (booking_id);
CREATE INDEX idx_notification_queue_delivery ON public.notification_queue USING btree (delivery_status);
CREATE INDEX idx_notification_queue_next_attempt ON public.notification_queue USING btree (next_attempt_at);
CREATE INDEX idx_notification_queue_status ON public.notification_queue USING btree (status);
CREATE INDEX idx_push_subscriptions_user_id ON public.push_subscriptions USING btree (user_id);
CREATE UNIQUE INDEX invoices_one_per_booking ON public.invoices USING btree (booking_id) WHERE (booking_id IS NOT NULL);
CREATE INDEX invoices_tenant_id_idx ON public.invoices USING btree (tenant_id);
CREATE INDEX missed_calls_tenant_id_idx ON public.missed_calls USING btree (tenant_id);
CREATE INDEX notification_log_booking_id_idx ON public.notification_log USING btree (booking_id);
CREATE INDEX notification_log_sent_at_idx ON public.notification_log USING btree (sent_at DESC);
CREATE INDEX notification_log_tenant_idx ON public.notification_log USING btree (tenant_id);
CREATE INDEX notification_queue_tenant_idx ON public.notification_queue USING btree (tenant_id);
CREATE INDEX operator_push_subscriptions_tenant_idx ON public.operator_push_subscriptions USING btree (tenant_id);
CREATE INDEX operator_sms_tasks_pending_push_idx ON public.operator_sms_tasks USING btree (id) WHERE ((status = 'pending'::text) AND (pushed_at IS NULL));
CREATE INDEX operator_sms_tasks_tenant_id_idx ON public.operator_sms_tasks USING btree (tenant_id);
CREATE UNIQUE INDEX points_transactions_one_award_per_booking ON public.points_transactions USING btree (booking_id) WHERE (type = 'journey_completed'::text);
CREATE INDEX points_transactions_user_idx ON public.points_transactions USING btree (user_id, created_at DESC);
CREATE INDEX profiles_tenant_id_idx ON public.profiles USING btree (tenant_id);
CREATE INDEX quote_requests_tenant_id_idx ON public.quote_requests USING btree (tenant_id);
CREATE INDEX reviews_tenant_id_idx ON public.reviews USING btree (tenant_id);
CREATE INDEX saved_addresses_user_id_idx ON public.saved_addresses USING btree (user_id);
CREATE INDEX stripe_webhook_events_booking_idx ON public.stripe_webhook_events USING btree (booking_id);
CREATE INDEX stripe_webhook_events_session_idx ON public.stripe_webhook_events USING btree (session_id);
CREATE INDEX stripe_webhook_rejections_received_idx ON public.stripe_webhook_rejections USING btree (received_at DESC);
CREATE UNIQUE INDEX tenant_users_one_super_admin_per_user ON public.tenant_users USING btree (user_id) WHERE (role = 'super_admin'::text);

-- ─── Functions ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.driver_accept_booking(p_booking_id uuid, p_driver_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_booking_id uuid;
BEGIN
  UPDATE public.bookings
  SET assigned_driver_id = p_driver_id,
      status = CASE WHEN status = 'pending' THEN 'accepted' ELSE status END,
      updated_at = now()
  WHERE id = p_booking_id
    AND assigned_driver_id IS NULL
    AND status IN ('pending', 'accepted')
  RETURNING id INTO v_booking_id;
  IF v_booking_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'This job has already been taken or is no longer available.');
  END IF;
  RETURN json_build_object('success', true, 'booking_id', v_booking_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.driver_alert_webhook_secrets()
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(array_agg(s.decrypted_secret order by s.name), '{}')
  from vault.decrypted_secrets s
  where s.name in ('driver_alert_webhook_secret', 'driver_alert_webhook_secret_previous')
    and coalesce(s.decrypted_secret, '') <> '';
$function$
;

CREATE OR REPLACE FUNCTION public.driver_update_status(p_booking_id uuid, p_status text, p_driver_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_current text;
  v_allowed text[];
BEGIN
  SELECT status INTO v_current FROM public.bookings
  WHERE id = p_booking_id AND assigned_driver_id = p_driver_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Booking not found or not assigned to you.');
  END IF;
  v_allowed := CASE v_current
    WHEN 'accepted' THEN ARRAY['en_route']
    WHEN 'en_route' THEN ARRAY['arrived']
    WHEN 'arrived'  THEN ARRAY['active']
    WHEN 'active'   THEN ARRAY['completed']
    ELSE ARRAY[]::text[]
  END;
  IF NOT (p_status = ANY(v_allowed)) THEN
    RETURN json_build_object('success', false, 'error', 'Invalid transition: ' || v_current || ' to ' || p_status);
  END IF;
  UPDATE public.bookings SET status = p_status, updated_at = now()
  WHERE id = p_booking_id AND assigned_driver_id = p_driver_id;
  RETURN json_build_object('success', true, 'status', p_status);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_booking_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  allowed text[];
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;

  CASE OLD.status
    WHEN 'Unassigned' THEN
      allowed := ARRAY['Dispatched', 'Cancelled', 'Unassigned / Missed Call Recovery'];
    WHEN 'Unassigned / Missed Call Recovery' THEN
      allowed := ARRAY['Dispatched', 'Cancelled'];
    WHEN 'accepted', 'confirmed' THEN
      allowed := ARRAY['En Route', 'Dispatched', 'Cancelled'];
    WHEN 'Dispatched' THEN
      allowed := ARRAY['En Route', 'Cancelled', 'Unassigned'];
    WHEN 'En Route', 'en_route' THEN
      allowed := ARRAY['Arrived', 'Passenger On Board', 'Cancelled', 'Dispatched', 'No Show'];
    WHEN 'Arrived', 'arrived' THEN
      allowed := ARRAY['Passenger On Board', 'Cancelled', 'En Route', 'No Show'];
    WHEN 'Active', 'active' THEN
      allowed := ARRAY['Arrived', 'Passenger On Board', 'Completed', 'Cancelled'];
    WHEN 'Passenger On Board' THEN
      allowed := ARRAY['Completed', 'Arrived', 'Cancelled', 'En Route'];
    WHEN 'Completed', 'completed' THEN
      IF NEW.status = 'Passenger On Board' THEN RETURN NEW; END IF;
      RAISE EXCEPTION 'Booking % is already Completed and cannot be changed.', NEW.id;
    WHEN 'Cancelled', 'cancelled', 'Canceled', 'canceled' THEN
      IF NEW.status = 'Unassigned' THEN RETURN NEW; END IF;
      RAISE EXCEPTION 'Booking % is already Cancelled and cannot be changed.', NEW.id;
    WHEN 'No Show', 'no show' THEN
      IF NEW.status = 'Unassigned' THEN RETURN NEW; END IF;
      RAISE EXCEPTION 'Booking % is already a No Show and cannot be changed.', NEW.id;
    WHEN 'CRITICAL_UNALLOCATED' THEN
      allowed := ARRAY['Dispatched', 'Cancelled'];
    ELSE
      RETURN NEW;
  END CASE;

  IF NOT (NEW.status = ANY(allowed)) THEN
    RAISE EXCEPTION 'Invalid status transition from "%" to "%". Allowed: %',
      OLD.status, NEW.status, array_to_string(allowed, ', ');
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enqueue_driver_notifications()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_new_driver uuid := coalesce(new.assigned_driver_id, new.driver_id);
  v_old_driver uuid := case when tg_op='UPDATE' then coalesce(old.assigned_driver_id, old.driver_id) else null end;
  v_driver_changed boolean := (tg_op='INSERT' and v_new_driver is not null) or (tg_op='UPDATE' and v_new_driver is distinct from v_old_driver);
  v_pay_changed boolean := (tg_op='UPDATE' and new.payment_status is distinct from old.payment_status);
  v_phone text; v_email text; v_route text; v_routed text;
  v_time5   text := substring(coalesce(new.travel_time,'') from 1 for 5);
  v_ukdate  text := case when new.travel_date is not null then to_char(new.travel_date,'DD/MM/YYYY') else null end;
  v_timetxt text := nullif(btrim(coalesce(v_time5,'') || ' ' || coalesce(v_ukdate,'')), '');
  v_sched   timestamptz := coalesce(
              new.pickup_time,
              case when new.travel_date is not null and new.travel_time ~ '^[0-2]?[0-9]:[0-5][0-9](:[0-5][0-9])?$'
                   then (new.travel_date::text || ' ' || new.travel_time)::timestamp at time zone 'Europe/London'
                   else null end);
  v_cust text := coalesce(nullif(trim(new.customer_name),''),'Customer');
  v_custphone text := nullif(trim(new.customer_phone),'');
  v_status text := lower(coalesce(new.payment_status,''));
  v_fare text; v_farev text; v_alloc text; v_remind text;
  v_drows jsonb; v_alloc_html text; v_remind_html text;
  v_bn text := coalesce(nullif(public.tenant_brand(new.tenant_id)->>'name', '') || ' ', '');
begin
  if tg_op='UPDATE' and v_new_driver is distinct from v_old_driver then
    delete from notification_queue where booking_id=new.id and type='driver_reminder_24h' and status='pending';
  end if;
  if v_new_driver is null then return new; end if;
  if not v_driver_changed and not v_pay_changed then return new; end if;

  select nullif(trim(phone),''), nullif(trim(email),'') into v_phone, v_email from drivers where id=v_new_driver;
  if v_email is null then return new; end if;

  v_route := case
    when nullif(new.pickup_location,'') is not null and nullif(new.dropoff_address,'') is not null
      then new.pickup_location || ' -> ' || new.dropoff_address
    when new.direction='Destination → Airport'
      then coalesce(nullif(new.dropoff_address,''),nullif(new.pickup_location,''),'Pickup') || ' -> ' || coalesce(nullif(new.airport,''),'Airport')
    else coalesce(nullif(new.airport,''),'Airport') || ' -> ' || coalesce(nullif(new.dropoff_address,''),nullif(new.pickup_location,''),'Destination')
  end;
  v_routed := replace(v_route, ' -> ', ' → ');

  if v_status='paid' then v_fare := ' Fare: PAID in advance, nothing to collect.'; v_farev := 'Paid in advance, nothing to collect';
  elsif v_status='invoiced' then v_fare := ' Fare: invoiced to account, do not collect.'; v_farev := 'Invoiced to account, do not collect';
  elsif new.quoted_price is not null then v_fare := ' Fare to collect GBP ' || trim(to_char(new.quoted_price,'FM999990.00')) || '.'; v_farev := '£' || trim(to_char(new.quoted_price,'FM999990.00')) || ' to collect';
  else v_fare := ' Fare: TBC.'; v_farev := 'TBC'; end if;

  v_drows := jsonb_build_array(
    jsonb_build_object('label','Reference',  'value', new.ref),
    jsonb_build_object('label','When',       'value', v_timetxt),
    jsonb_build_object('label','Journey',    'value', v_routed),
    jsonb_build_object('label','Customer',   'value', v_cust || coalesce(' · ' || v_custphone,'')),
    jsonb_build_object('label','Flight',     'value', nullif(new.flight_number,'')),
    jsonb_build_object('label','Passengers', 'value', new.passengers::text),
    jsonb_build_object('label','Bags',       'value', nullif(new.luggage,'')),
    jsonb_build_object('label','Fare',       'value', v_farev)
  );

  v_remind := v_bn || 'REMINDER: Job ' || new.ref || ' tomorrow at ' || coalesce(nullif(v_time5,''),'the booked time') || ': ' || v_route
    || '. Customer ' || v_cust || coalesce(' ' || v_custphone,'') || coalesce('. Flight ' || nullif(new.flight_number,''),'')
    || coalesce('. Pax ' || new.passengers::text,'') || coalesce('. Bags ' || nullif(new.luggage,''),'') || '.' || v_fare;
  v_remind_html := tenant_notification_email(new.tenant_id, 
    'Reminder: job tomorrow', '#e6effb', '#1e4a8a',
    'This is a reminder for your job tomorrow at ' || coalesce(nullif(v_time5,''),'the booked time') || '.',
    v_drows, 'Please be ready in good time. Drive safely.');

  if v_driver_changed then
    v_alloc := v_bn || 'NEW JOB ' || new.ref || ': ' || v_route || coalesce(' on ' || v_timetxt,'')
      || '. Customer ' || v_cust || coalesce(' ' || v_custphone,'') || coalesce('. Flight ' || nullif(new.flight_number,''),'')
      || coalesce('. Pax ' || new.passengers::text,'') || coalesce('. Bags ' || nullif(new.luggage,''),'') || '.';
    v_alloc_html := tenant_notification_email(new.tenant_id, 
      'New job', '#fbf3e0', '#8a6516',
      'A new job has been assigned to you.',
      v_drows, 'Please be ready in good time. Drive safely.');

    insert into notification_queue (id,booking_id,type,channel,recipient,subject,body,html,status,attempts,next_attempt_at,created_at)
    select gen_random_uuid(),new.id,'driver_allocated','email',v_email,'New job '||new.ref||': '||v_routed,v_alloc,v_alloc_html,'pending',0,now(),now()
    where not exists (select 1 from notification_queue q where q.booking_id=new.id and q.type='driver_allocated' and q.status='pending');

    if v_sched is not null and v_sched - interval '24 hours' > now() then
      insert into notification_queue (id,booking_id,type,channel,recipient,subject,body,html,status,attempts,next_attempt_at,created_at)
      values (gen_random_uuid(),new.id,'driver_reminder_24h','email',v_email,'Reminder: job '||new.ref||' tomorrow',v_remind,v_remind_html,'pending',0,v_sched - interval '24 hours',now());
    end if;

  elsif v_pay_changed then
    update notification_queue set body=v_remind, html=case when channel='email' then v_remind_html else html end
     where booking_id=new.id and type='driver_reminder_24h' and status='pending';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enqueue_operator_customer_notifications()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_phone   text := nullif(trim(new.customer_phone), '');
  v_email   text := nullif(trim(new.customer_email), '');
  v_name    text := coalesce(nullif(trim(new.customer_name), ''), 'there');
  v_first   text := coalesce(nullif(split_part(trim(coalesce(new.customer_name, '')), ' ', 1), ''), 'there');
  v_timetxt text;
  v_status  text := lower(coalesce(new.payment_status, ''));
  v_did     uuid := coalesce(new.assigned_driver_id, new.driver_id);
  v_msg     text; v_conf text; v_ch text;
  v_is_operator boolean := coalesce(new.source, 'website') = 'operator';
  v_reminder_type text;
  v_rows    jsonb;
  v_html    text;
  v_drv_name text; v_drv_vehicle text;
  -- This business's own name and number (never another business's).
  v_b       jsonb := public.tenant_brand(new.tenant_id);
  v_biz     text  := nullif(v_b->>'name', '');
  v_bn      text  := coalesce(v_biz || ' ', '');
  v_pre     text  := coalesce(v_biz || ': ', '');
  v_foot    text  := case when nullif(v_b->>'phone', '') is not null
                          then 'Questions? Call or WhatsApp ' || (v_b->>'phone') || '.' end;
begin
  if v_phone is null and v_email is null then return new; end if;

  v_ch := case when v_email is not null then 'email'
               when v_phone is not null then 'sms'
               else null end;

  v_timetxt := coalesce(
    to_char(new.pickup_time at time zone 'Europe/London', 'DD/MM/YYYY HH24:MI'),
    nullif(btrim(coalesce(to_char(new.travel_date, 'DD/MM/YYYY'), '')
                 || ' ' || coalesce(left(new.travel_time::text, 5), '')), '')
  );

  if v_did is not null then
    select nullif(trim(d.full_name), ''),
           nullif(btrim(coalesce(d.vehicle_model, '') || ' ' || coalesce(upper(d.vehicle_registration), '')), '')
      into v_drv_name, v_drv_vehicle
      from drivers d where d.id = v_did;
  end if;

  v_rows := jsonb_build_array(
    jsonb_build_object('label', 'Reference', 'value', new.ref),
    jsonb_build_object('label', 'Pickup',    'value', coalesce(nullif(new.pickup_location, ''), new.airport)),
    jsonb_build_object('label', 'Drop-off',  'value', coalesce(nullif(new.dropoff_address, ''),
                                                      case when nullif(new.pickup_location, '') is not null then new.airport end)),
    jsonb_build_object('label', 'Date & time', 'value', v_timetxt),
    jsonb_build_object('label', 'Flight',    'value', upper(nullif(new.flight_number, '')))
  );

  if tg_op = 'INSERT' then
    if v_is_operator and v_ch is not null
       and coalesce(new.notes, '') !~* '^Return leg created automatically' then
      v_conf := v_pre || 'Hi ' || v_name || ', your airport transfer' || coalesce(' (' || v_timetxt || ')','') || ' is booked. Ref ' || new.ref || '.';

      if not exists (select 1 from notification_queue q where q.booking_id=new.id and q.type='received')
         and not exists (select 1 from notification_log   l where l.booking_id=new.id and l.type='received')
         and not exists (select 1 from operator_sms_tasks  t where t.booking_id=new.id and t.kind='confirmation') then
        if v_ch='email' then
          v_html := tenant_notification_email(new.tenant_id, 
            'Booking confirmed', '#fbf3e0', '#8a6516',
            'Hi ' || evexec_esc(v_first) || ', your airport transfer is booked. We look forward to seeing you.',
            v_rows, v_foot);
          insert into notification_queue (id,booking_id,type,channel,recipient,subject,body,html,status,attempts,next_attempt_at,created_at)
          values (gen_random_uuid(),new.id,'received','email',v_email,'Your '||v_bn||'airport transfer is booked (Ref '||new.ref||')',v_conf,v_html,'pending',0,now(),now());
        else
          insert into public.operator_sms_tasks (tenant_id, booking_id, kind, customer_name, customer_phone, message, status)
          values (new.tenant_id, new.id, 'confirmation', v_name, v_phone, v_conf, 'pending')
          on conflict (booking_id, kind) do nothing;
        end if;
      end if;
    end if;

  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      if new.status='En Route' and old.status='Dispatched' then
        v_msg := v_pre||'your driver is on the way. Ref '||new.ref||'.';
        v_reminder_type := 'en_route';
        v_html := tenant_notification_email(new.tenant_id, 
          'Driver on the way', '#e6effb', '#1e4a8a',
          'Hi ' || evexec_esc(v_first) || ', your driver is now on the way to your pickup point.',
          v_rows || jsonb_build_array(
            jsonb_build_object('label', 'Driver',  'value', v_drv_name),
            jsonb_build_object('label', 'Vehicle', 'value', v_drv_vehicle)),
          v_foot);
      elsif new.status='Arrived' and old.status='En Route' then
        v_msg := v_pre||'your driver has arrived at the pickup point. Ref '||new.ref||'.';
        v_reminder_type := 'arrived';
        v_html := tenant_notification_email(new.tenant_id, 
          'Driver arrived', '#dcfce7', '#166534',
          'Hi ' || evexec_esc(v_first) || ', your driver has arrived at your pickup point and is ready when you are.',
          v_rows || jsonb_build_array(
            jsonb_build_object('label', 'Driver',  'value', v_drv_name),
            jsonb_build_object('label', 'Vehicle', 'value', v_drv_vehicle)),
          v_foot);
      elsif new.status='Cancelled' and old.status<>'Completed'
            and not (new.operator_response = 'rejected'
                     and old.operator_response is distinct from new.operator_response) then
        v_msg := v_pre||'your booking '||new.ref||' has been cancelled. Please contact us if this is unexpected.';
        v_reminder_type := 'cancelled';
        v_html := tenant_notification_email(new.tenant_id, 
          'Booking cancelled', '#fee2e2', '#991b1b',
          'Hi ' || evexec_esc(v_first) || ', your booking has been cancelled. If this is unexpected, please get in touch.',
          v_rows, v_foot);
      else v_msg := null; end if;

      if v_msg is not null and v_ch is not null then
        if v_ch='email' then
          insert into notification_queue (id,booking_id,type,channel,recipient,subject,body,html,status,attempts,next_attempt_at,created_at)
          values (gen_random_uuid(),new.id,'status_update','email',v_email,'Update on your '||v_bn||'transfer (Ref '||new.ref||')',v_msg,v_html,'pending',0,now(),now());
        elsif v_reminder_type in ('en_route', 'arrived') then
          null;
        else
          -- No email: the office sends the cancellation text (Today -> Texts to send).
          insert into public.operator_sms_tasks
            (tenant_id, booking_id, kind, customer_name, customer_phone, message, status)
          values
            (new.tenant_id, new.id, 'cancellation', v_name, v_phone, v_msg, 'pending')
          on conflict (booking_id, kind) do nothing;
        end if;
      end if;
    end if;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.evexec_esc(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select replace(replace(replace(coalesce(p,''),'&','&amp;'),'<','&lt;'),'>','&gt;')
$function$
;

CREATE OR REPLACE FUNCTION public.evexec_notification_email(p_pill text, p_pill_bg text, p_pill_fg text, p_lead text, p_rows jsonb, p_footnote text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select public.tenant_notification_email('00000000-0000-0000-0000-000000000001'::uuid, p_pill, p_pill_bg, p_pill_fg, p_lead, p_rows, p_footnote)
$function$
;

CREATE OR REPLACE FUNCTION public.get_booking_status_breakdown(since timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(status text, count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT status, count(*) AS count
  FROM bookings
  WHERE since IS NULL OR pickup_time >= since
  GROUP BY status
  ORDER BY count DESC;
$function$
;

CREATE OR REPLACE FUNCTION public.get_booking_totals(since timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(total_bookings bigint, completed_bookings bigint, cancelled_bookings bigint, total_revenue numeric, unique_customers bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    count(*)                                                          AS total_bookings,
    count(*) FILTER (WHERE status = 'Completed')                      AS completed_bookings,
    count(*) FILTER (WHERE status = 'Cancelled')                      AS cancelled_bookings,
    coalesce(sum(price) FILTER (WHERE status = 'Completed'), 0)       AS total_revenue,
    count(DISTINCT coalesce(customer_phone, customer_name))           AS unique_customers
  FROM bookings
  WHERE since IS NULL OR pickup_time >= since;
$function$
;

CREATE OR REPLACE FUNCTION public.get_push_dispatch_bundle(p_secret text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
      from public.operator_push_subscriptions s
      where exists (
        select 1 from public.tenant_users tu
        where tu.user_id = s.user_id
          and tu.role in ('super_admin', 'operator_admin', 'dispatcher')
      )), '[]'::jsonb)
  ) into v;
  return v;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_push_dispatch_bundle_for_tenant(p_secret text, p_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare c public.push_config; v jsonb;
begin
  select * into c from public.push_config where id = true;
  if c.webhook_secret is null or p_secret is distinct from c.webhook_secret then
    return null;
  end if;
  if p_tenant_id is null then
    return null; -- the caller must say which business the alert is for
  end if;
  select jsonb_build_object(
    'vapid_public',  c.vapid_public,
    'vapid_private', c.vapid_private,
    'vapid_subject', coalesce(c.vapid_subject, 'mailto:book@evexec.co.uk'),
    'subscriptions', coalesce((
      select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
      from public.operator_push_subscriptions s
      where (s.tenant_id = p_tenant_id or s.tenant_id is null)
        and exists (
          select 1 from public.tenant_users tu
          where tu.user_id = s.user_id
            and tu.role in ('super_admin', 'operator_admin', 'dispatcher')
        )), '[]'::jsonb)
  ) into v;
  return v;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_push_public_key()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ select vapid_public from public.push_config where id = true; $function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_raw text := NEW.raw_user_meta_data->>'tenant_id';
  v_tenant uuid;
begin
  if v_raw ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select id into v_tenant from public.tenants where id = v_raw::uuid and status = 'active';
  end if;

  insert into public.profiles (id, full_name, tenant_id)
  values (NEW.id, NEW.raw_user_meta_data->>'full_name',
          coalesce(v_tenant, '00000000-0000-0000-0000-000000000001'::uuid))
  on conflict (id) do nothing;
  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notif_pick_channel(p_urgent boolean, p_has_email boolean, p_has_phone boolean)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare s public.notification_channel_settings;
begin
  select * into s from public.notification_channel_settings where id = true;
  if not found then
    if p_has_phone then return 'sms'; elsif p_has_email then return 'email'; else return null; end if;
  end if;
  if p_urgent or not s.sms_only_when_necessary then
    if s.sms_enabled and p_has_phone then return 'sms'; end if;
    if s.email_enabled and p_has_email then return 'email'; end if;
  else
    if s.email_enabled and p_has_email then return 'email'; end if;
    if s.sms_enabled and p_has_phone then return 'sms'; end if;
  end if;
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_driver_job_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- The driver's own no-show: they know, so no "job cancelled" alert.
  IF is_cancelled AND coalesce(new.driver_notes, '') LIKE '%[No Show]%'
     AND coalesce(old.driver_notes, '') NOT LIKE '%[No Show]%' THEN
    RETURN new;
  END IF;

  IF NOT (is_cancelled OR detail_changed) THEN RETURN new; END IF;

  payload := jsonb_build_object(
    'record', jsonb_build_object(
      'id',                 new.id,
      'ref',                new.ref,
      'status',             new.status,
      'assigned_driver_id', new.assigned_driver_id,
      'customer_name',      new.customer_name,
      'travel_date',        new.travel_date,
      'travel_time',        new.travel_time,
      'pickup_location',    new.pickup_location,
      'airport',            new.airport,
      'dropoff_address',    new.dropoff_address,
      'journey_type',       new.journey_type
    ),
    'old_record', jsonb_build_object(
      'id',              old.id,
      'status',          old.status,
      'travel_date',     old.travel_date,
      'travel_time',     old.travel_time,
      'pickup_location', old.pickup_location,
      'airport',         old.airport,
      'dropoff_address', old.dropoff_address
    )
  );

  PERFORM net.http_post(
    url     := 'https://yoltkmhtxwluqxxpewbl.supabase.co/functions/v1/notify-job-update',
    body    := payload,
    headers := jsonb_build_object(
      'Content-Type',     'application/json',
      'x-webhook-secret', (SELECT s.decrypted_secret FROM vault.decrypted_secrets s
                           WHERE s.name = 'driver_alert_webhook_secret' LIMIT 1)
    )
  );

  RETURN new;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_driver_new_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
                 'x-webhook-secret', (select s.decrypted_secret from vault.decrypted_secrets s
                                      where s.name = 'driver_alert_webhook_secret' limit 1)
               ),
    body    := jsonb_build_object('record', row_to_json(NEW))
  );

  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_operator_new_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_secret text;
begin
  if coalesce(new.source, 'website') <> 'website' then return new; end if;
  select webhook_secret into v_secret from public.push_config where id = true;
  if v_secret is null then return new; end if;
  perform net.http_post(
    url     := 'https://evexecoperator.vercel.app/api/push/dispatch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
    body    := jsonb_build_object('record', row_to_json(new))
  );
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_operator_no_show()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_secret text; v_driver text; v_when text; v_where text;
begin
  if not ((new.status = 'No Show' and old.status is distinct from 'No Show')
    or (new.status = 'Cancelled' and old.status is distinct from 'Cancelled'
        and coalesce(new.driver_notes, '') like '%[No Show]%')) then return new; end if;
  begin
    select webhook_secret into v_secret from public.push_config where id = true;
    if v_secret is null then return new; end if;
    select coalesce(nullif(d.full_name, ''), d.name) into v_driver from public.drivers d where d.id = new.assigned_driver_id;
    v_when  := concat_ws(' ', left(new.travel_time, 5), to_char(new.travel_date, 'DD/MM/YYYY'));
    v_where := coalesce(nullif(new.pickup_location, ''), new.airport);
    perform net.http_post(
      url := 'https://evexecoperator.vercel.app/api/push/dispatch',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
      body := jsonb_build_object(
        'tenant_id', new.tenant_id,
        'notification', jsonb_build_object(
          'title', 'No-show: ' || coalesce(new.customer_name, 'customer'),
          'body',  concat_ws(' · ', v_where, nullif(v_when, ''), 'Driver ' || v_driver, 'Ref ' || new.ref),
          'url',   '/operator/bookings?q=' || new.ref,
          'tag',   'noshow-' || new.ref)));
  exception when others then null; -- An alert must never stop the driver recording the no-show.
  end;
  return new;
end; $function$
;

CREATE OR REPLACE FUNCTION public.prevent_driver_double_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  conflict_count int;
  new_dir text;
BEGIN
  IF NEW.driver_id IS NULL OR NEW.pickup_time IS NULL THEN RETURN NEW; END IF;
  IF NEW.status IN ('Completed', 'Cancelled', 'No Show') THEN RETURN NEW; END IF;

  -- Classify the new job's airport direction (journey_type is the reliable
  -- source of truth; direction is a fallback). 'to' = outbound to the airport,
  -- 'from' = inbound from the airport, NULL = unknown (e.g. Point to Point).
  new_dir := CASE
    WHEN lower(coalesce(NEW.journey_type,'')) LIKE '%to airport%'   THEN 'to'
    WHEN lower(coalesce(NEW.journey_type,'')) LIKE '%from airport%' THEN 'from'
    WHEN lower(coalesce(NEW.direction,''))    LIKE 'destination%'   THEN 'to'
    WHEN lower(coalesce(NEW.direction,''))    LIKE 'airport%'       THEN 'from'
    WHEN lower(coalesce(NEW.direction,''))    LIKE 'from airport%'  THEN 'from'
    ELSE NULL
  END;

  SELECT count(*) INTO conflict_count
  FROM bookings b
  WHERE b.driver_id  = NEW.driver_id
    AND b.id        != NEW.id
    AND b.status NOT IN ('Completed', 'Cancelled', 'No Show')
    AND b.pickup_time BETWEEN (NEW.pickup_time - INTERVAL '3 hours')
                          AND (NEW.pickup_time + INTERVAL '3 hours')
    -- OVERRIDE: allow a same-driver outbound (To Airport) and inbound
    -- (From Airport) pair to be chained back-to-back inside the 3h window,
    -- provided the two pickups are not at the exact same time. Same-direction
    -- overlaps and unknown-direction jobs still block exactly as before.
    AND NOT (
      new_dir IS NOT NULL
      AND b.pickup_time <> NEW.pickup_time
      AND (CASE
        WHEN lower(coalesce(b.journey_type,'')) LIKE '%to airport%'   THEN 'to'
        WHEN lower(coalesce(b.journey_type,'')) LIKE '%from airport%' THEN 'from'
        WHEN lower(coalesce(b.direction,''))    LIKE 'destination%'   THEN 'to'
        WHEN lower(coalesce(b.direction,''))    LIKE 'airport%'       THEN 'from'
        WHEN lower(coalesce(b.direction,''))    LIKE 'from airport%'  THEN 'from'
        ELSE NULL
      END) IS NOT NULL
      AND new_dir <> (CASE
        WHEN lower(coalesce(b.journey_type,'')) LIKE '%to airport%'   THEN 'to'
        WHEN lower(coalesce(b.journey_type,'')) LIKE '%from airport%' THEN 'from'
        WHEN lower(coalesce(b.direction,''))    LIKE 'destination%'   THEN 'to'
        WHEN lower(coalesce(b.direction,''))    LIKE 'airport%'       THEN 'from'
        WHEN lower(coalesce(b.direction,''))    LIKE 'from airport%'  THEN 'from'
        ELSE NULL
      END)
    );

  IF conflict_count > 0 THEN
    RAISE EXCEPTION
      'Driver already has an active booking within 3 hours of this pickup time. '
      'Resolve or complete the existing booking before reassigning.';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION private.award_journey_points(p_booking_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  b record;
  uid uuid;
begin
  select id, tenant_id, user_id, customer_email, status, ref, airport, journey_type, travel_date
    into b from public.bookings where id = p_booking_id;
  if not found or b.status not in ('Completed', 'completed') then return; end if;

  uid := b.user_id;
  if uid is null and nullif(btrim(b.customer_email), '') is not null then
    select u.id into uid from auth.users u
     where lower(u.email) = lower(btrim(b.customer_email)) and u.email_confirmed_at is not null
     limit 1;
  end if;
  if uid is null then return; end if;

  insert into public.points_transactions (tenant_id, user_id, booking_id, points, type, note)
  values (b.tenant_id, uid, b.id, 1, 'journey_completed',
          concat_ws(' · ', b.ref, coalesce(b.airport, b.journey_type), to_char(b.travel_date, 'DD/MM/YYYY')))
  on conflict (booking_id) where type = 'journey_completed' do nothing;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.can_brand_tenant_folder(p_folder text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid()
      and (tu.role = 'super_admin'
           or (tu.role = 'operator_admin' and tu.tenant_id::text = p_folder))
  );
$function$
;

CREATE OR REPLACE FUNCTION private.ensure_invoice_for_booking(p_booking_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  b record;
  r record;
  inv_id uuid;
  from_place text;
  to_place text;
  kind text;
  items jsonb;
  today date := (now() at time zone 'Europe/London')::date;
  paid boolean;
begin
  select * into b from public.bookings where id = p_booking_id;
  if not found or b.status not in ('Completed', 'completed') then return null; end if;

  select id into inv_id from public.invoices where booking_id = b.id;
  if inv_id is not null then return inv_id; end if;

  update public.invoices set booking_id = b.id
   where id = (select id from public.invoices
                where booking_id is null and (booking_ref = b.ref or booking_ref = b.id::text)
                order by created_at limit 1)
  returning id into inv_id;
  if inv_id is not null then return inv_id; end if;

  if coalesce(b.quoted_price, 0) <= 0 then return null; end if;
  if coalesce(b.notes, '') like 'Return leg created automatically%' then return null; end if;

  select * into r from public.bookings
   where b.ref is not null and notes like '%Outbound ref: ' || b.ref || '%'
   order by created_at limit 1;

  if b.journey_type ilike '%from%airport%' then
    from_place := coalesce(b.airport, b.pickup_location); to_place := coalesce(b.dropoff_address, b.airport);
  else
    from_place := coalesce(b.pickup_location, b.airport); to_place := coalesce(b.dropoff_address, b.airport);
  end if;
  kind := case when b.journey_type ilike '%airport%' or b.airport is not null
                    or from_place ilike '%airport%' or to_place ilike '%airport%'
               then 'Airport transfer' else 'Private passenger transport' end;

  items := jsonb_build_array(jsonb_build_object(
    'description', kind || ' — ' || coalesce(split_part(from_place, ',', 1), 'Pickup') || ' → ' || coalesce(split_part(to_place, ',', 1), 'Destination'),
    'quantity', 1, 'unit_price', b.quoted_price));
  if r.id is not null then
    items := items || jsonb_build_array(jsonb_build_object(
      'description', 'Return transfer — ' || coalesce(split_part(coalesce(r.pickup_location, r.airport), ',', 1), 'Pickup') || ' → ' || coalesce(split_part(coalesce(r.dropoff_address, r.airport), ',', 1), 'Destination'),
      'quantity', 1, 'unit_price', 0));
  end if;

  paid := b.payment_status = 'Paid';

  insert into public.invoices (tenant_id, booking_id, booking_ref, customer_name, customer_email, customer_phone,
                               line_items, journey, subtotal, vat_rate, vat_amount, total, status, issue_date, due_date)
  values (b.tenant_id, b.id, b.ref, b.customer_name, b.customer_email, b.customer_phone, items,
          jsonb_strip_nulls(jsonb_build_object(
            'pickup', from_place, 'dropoff', to_place,
            'date', b.travel_date, 'time', left(b.travel_time, 5),
            'flight', b.flight_number, 'passengers', b.passengers, 'luggage', b.luggage,
            'returnDate', r.travel_date, 'returnTime', left(r.travel_time, 5))),
          b.quoted_price, 0, 0, b.quoted_price,
          case when paid then 'Paid' else 'Sent' end,
          today, case when paid then null else today + 15 end)
  on conflict (booking_id) where booking_id is not null do nothing
  returning id into inv_id;

  return coalesce(inv_id, (select id from public.invoices where booking_id = b.id));
end;
$function$
;

CREATE OR REPLACE FUNCTION private.guard_driver_booking_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  allowed constant text[] := array[
    'status', 'driver_notes', 'payment_method', 'driver_confirmed_at', 'attestation_status',
    'tracking_started_at', 'arrived_at', 'passenger_onboard_at', 'pob_at', 'completed_at', 'updated_at'
  ];
  driver_statuses constant text[] := array[
    'En Route', 'Arrived', 'Passenger On Board', 'Completed', 'No Show'
  ];
  changed text[];
begin
  -- Runs only for app users who are not office staff for this booking's
  -- business: see the trigger's WHEN clause in 20261015032000 (staff check
  -- there, because app roles have no USAGE on schema private).
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- Payment is the office's: keep the stored values (see header).
  new.payment_status := old.payment_status;
  if lower(coalesce(old.payment_status, '')) in ('paid', 'invoiced') then
    new.payment_method := old.payment_method;
  end if;

  select array_agg(n.key order by n.key) into changed
  from jsonb_each(to_jsonb(new)) n
  where n.value is distinct from (to_jsonb(old) -> n.key)
    and not (n.key = any(allowed));
  if changed is not null then
    raise exception 'Drivers can''t change % on a booking.', array_to_string(changed, ', ')
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status and new.status = 'Cancelled' then
    raise exception 'Drivers can''t cancel a job. Record a no-show at the pickup, or ask the office to cancel it.'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status and not (new.status = any(driver_statuses)) then
    raise exception 'Drivers can''t set a booking to "%".', new.status using errcode = '42501';
  end if;

  -- A driver may end a job only at the pickup stage, and only as a no-show.
  -- Cancelling a job is always the office's.
  if new.status is distinct from old.status and new.status = 'No Show'
     and old.status not in ('En Route', 'en_route', 'Arrived', 'arrived') then
    raise exception 'Drivers can only record a no-show after setting off or arriving. Ask the office to cancel this job.'
      using errcode = '42501';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.guard_driver_record_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  allowed constant text[] := array[
    'current_lat', 'current_lng', 'location_updated_at', 'battery_percent', 'is_online', 'updated_at'
  ];
  changed text[];
begin
  -- See the trigger's WHEN clause (app users who are not office staff only).
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  select array_agg(n.key order by n.key) into changed
  from jsonb_each(to_jsonb(new)) n
  where n.value is distinct from (to_jsonb(old) -> n.key)
    and not (n.key = any(allowed));
  if changed is not null then
    raise exception 'Drivers can''t change % on their driver record. Ask the office.', array_to_string(changed, ', ')
      using errcode = '42501';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.is_known_driver()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from drivers where id = auth.uid());
$function$
;

CREATE OR REPLACE FUNCTION private.is_member_of_tenant(target_tenant uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid()
      and (tu.role = 'super_admin' or tu.tenant_id = target_tenant)
  );
$function$
;

CREATE OR REPLACE FUNCTION private.is_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from private.staff_users where user_id = auth.uid());
$function$
;

CREATE OR REPLACE FUNCTION private.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid() and tu.role = 'super_admin'
  );
$function$
;

CREATE OR REPLACE FUNCTION private.log_booking_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_email text;
begin
  select email into v_email from auth.users where id = auth.uid();

  if new.status is distinct from old.status then
    insert into booking_audit_log (booking_id, booking_ref, field, old_value, new_value, changed_by_email)
    values (new.id, new.ref, 'status', old.status, new.status, v_email);
  end if;

  if new.driver_id is distinct from old.driver_id then
    insert into booking_audit_log (booking_id, booking_ref, field, old_value, new_value, changed_by_email)
    values (
      new.id, new.ref, 'driver',
      (select name from drivers where id = old.driver_id),
      (select name from drivers where id = new.driver_id),
      v_email
    );
  end if;

  if new.payment_status is distinct from old.payment_status then
    insert into booking_audit_log (booking_id, booking_ref, field, old_value, new_value, changed_by_email)
    values (new.id, new.ref, 'payment_status', old.payment_status, new.payment_status, v_email);
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.run_evexec_backup()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  url constant text := 'https://xrcrwcejxkcowhrfbmgq.supabase.co/rest/v1/rpc/store_evexec_backup';
  key constant text := 'sb_publishable_5x6A7BtHKULnjllWEcNSpw_G7xUrPtm';
  secret text;
  run uuid := gen_random_uuid();
  t record;
  rows jsonb;
  sent int := 0;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'evexec_backup_secret';
  if secret is null then raise exception 'evexec_backup_secret missing from vault'; end if;

  for t in
    select table_schema, table_name from information_schema.tables
     where table_schema in ('public', 'private') and table_type = 'BASE TABLE'
     order by 1, 2
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from %I.%I x', t.table_schema, t.table_name) into rows;
    perform net.http_post(
      url := url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', key),
      body := jsonb_build_object('p_secret', secret, 'p_run_id', run, 'p_table', t.table_schema || '.' || t.table_name, 'p_rows', rows),
      timeout_milliseconds := 30000);
    sent := sent + 1;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', u.id, 'email', u.email, 'phone', u.phone, 'created_at', u.created_at,
           'email_confirmed_at', u.email_confirmed_at, 'last_sign_in_at', u.last_sign_in_at,
           'raw_user_meta_data', u.raw_user_meta_data)), '[]'::jsonb)
    into rows from auth.users u;
  perform net.http_post(
    url := url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', key),
    body := jsonb_build_object('p_secret', secret, 'p_run_id', run, 'p_table', 'auth.users', 'p_rows', rows),
    timeout_milliseconds := 30000);

  return sent + 1;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.set_audit_log_tenant()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.tenant_id is null then
    new.tenant_id := coalesce(
      (select tu.tenant_id from public.tenant_users tu where tu.user_id = new.actor_id and tu.tenant_id is not null limit 1),
      '00000000-0000-0000-0000-000000000001'
    );
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.set_push_subscription_tenant()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.tenant_id := (
    select tu.tenant_id from public.tenant_users tu
    where tu.user_id = new.user_id and tu.tenant_id is not null
    order by tu.created_at
    limit 1
  );
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.set_tenant_from_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.booking_id is not null then
    new.tenant_id := coalesce(
      (select b.tenant_id from public.bookings b where b.id = new.booking_id),
      new.tenant_id
    );
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.staff_for_tenant(target_tenant uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid()
      and (
        tu.role = 'super_admin'
        or (tu.tenant_id = target_tenant and tu.role in ('operator_admin', 'dispatcher'))
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION private.trg_award_journey_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.status in ('Completed', 'completed') then
    begin
      perform private.award_journey_points(new.id);
    exception when others then
      raise warning 'award_journey_points failed for booking %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.trg_ensure_invoice()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.status in ('Completed', 'completed') then
    begin
      perform private.ensure_invoice_for_booking(new.id);
    exception when others then
      raise warning 'ensure_invoice_for_booking failed for booking %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.provision_tenant(p_slug text, p_name text, p_contact_email text DEFAULT NULL::text, p_contact_phone text DEFAULT NULL::text)
 RETURNS tenants
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_email text := nullif(btrim(coalesce(p_contact_email, '')), '');
  v_phone text := nullif(btrim(coalesce(p_contact_phone, '')), '');
  v_prefix text;
  t public.tenants;
begin
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(v_slug) > 40 then
    raise exception 'The short name must be lowercase letters, numbers and hyphens (up to 40 characters).' using errcode = '22023';
  end if;
  if v_name = '' or length(v_name) > 100 then
    raise exception 'The business name is required (up to 100 characters).' using errcode = '22023';
  end if;
  if v_email is not null and v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'The contact email is not valid.' using errcode = '22023';
  end if;

  v_prefix := left(regexp_replace(upper(v_slug), '[^A-Z]', '', 'g'), 4);
  if length(v_prefix) < 2 then v_prefix := 'BKG'; end if;

  insert into public.tenants (slug, name, contact_email, contact_phone, brand, pricing, ref_prefix)
  values (v_slug, v_name, v_email, v_phone,
          jsonb_build_object('invoice', jsonb_build_object('business_name', v_name)),
          jsonb_build_object('airports', '[]'::jsonb, 'extra_stop', 0),
          v_prefix)
  returning * into t;

  insert into public.notification_channel_settings
    (tenant_id, email_enabled, sms_enabled, whatsapp_enabled, push_enabled, sms_only_when_necessary)
  values (t.id, true, false, false, false, true);

  return t;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.queue_customer_sms(p_ref text, p_recipient text, p_body text, p_type text DEFAULT 'operator_response'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_id uuid; v_tenant uuid;
begin
  if p_recipient is null or btrim(p_recipient) = '' or p_body is null then return; end if;
  select id, tenant_id into v_id, v_tenant from public.bookings where ref = p_ref;
  if v_id is null then return; end if;
  if not private.staff_for_tenant(v_tenant) then return; end if;
  insert into public.notification_queue
    (id, booking_id, type, channel, recipient, body, status, attempts, next_attempt_at, created_at)
  values
    (gen_random_uuid(), v_id, p_type, 'sms', p_recipient, p_body, 'pending', 0, now(), now());
end;
$function$
;

CREATE OR REPLACE FUNCTION public.register_operator_push(p_endpoint text, p_p256dh text, p_auth text, p_label text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if auth.uid() is null or not exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid()
      and tu.role in ('super_admin', 'operator_admin', 'dispatcher')
  ) then
    raise exception 'Only office staff can turn on booking alerts.' using errcode = '42501';
  end if;

  if coalesce(btrim(p_endpoint), '') = '' or coalesce(btrim(p_p256dh), '') = '' or coalesce(btrim(p_auth), '') = '' then
    raise exception 'Invalid push subscription.' using errcode = '22023';
  end if;

  insert into public.operator_push_subscriptions (endpoint, p256dh, auth, label, user_id)
  values (p_endpoint, p_p256dh, p_auth, p_label, auth.uid())
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh, auth = excluded.auth,
        label = excluded.label, user_id = excluded.user_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_invoice_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.invoice_number is null or new.invoice_number = '' then
    new.invoice_number := 'INV-' || to_char(nextval('public.invoice_seq'), 'FM0000');
  end if;
  new.updated_at := now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$
;

CREATE OR REPLACE FUNCTION public.stripe_webhook_event_seen(p_event_id text, p_event_type text, p_livemode boolean, p_session_id text)
 RETURNS stripe_webhook_events
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  insert into public.stripe_webhook_events as e (event_id, event_type, livemode, session_id)
  values (p_event_id, p_event_type, p_livemode, p_session_id)
  on conflict (event_id) do update
    set attempts = e.attempts + 1, last_attempt_at = now()
  returning e.*;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_assigned_driver_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.driver_id IS NOT NULL AND NEW.assigned_driver_id IS NULL THEN
    NEW.assigned_driver_id := NEW.driver_id;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_booking_driver_assignment_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.driver_id is not null and new.assigned_driver_id is distinct from new.driver_id then
    new.assigned_driver_id := new.driver_id;
  elsif new.assigned_driver_id is not null and new.driver_id is distinct from new.assigned_driver_id then
    new.driver_id := new.assigned_driver_id;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_my_invoices()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  uid uuid := auth.uid();
  em text;
  bk record;
begin
  if uid is null then return; end if;
  select lower(email) into em from auth.users where id = uid and email_confirmed_at is not null;
  for bk in
    select b.id from public.bookings b
     where b.status in ('Completed', 'completed')
       and (b.user_id = uid or (b.user_id is null and em is not null and lower(btrim(b.customer_email)) = em))
       and not exists (select 1 from public.invoices i where i.booking_id = b.id)
  loop
    perform private.ensure_invoice_for_booking(bk.id);
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_my_points()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  uid uuid := auth.uid();
  em text;
  r record;
begin
  if uid is null then return; end if;
  select lower(email) into em from auth.users where id = uid and email_confirmed_at is not null;
  for r in
    select b.id from public.bookings b
     where b.status in ('Completed', 'completed')
       and (b.user_id = uid or (b.user_id is null and em is not null and lower(btrim(b.customer_email)) = em))
       and not exists (select 1 from public.points_transactions t where t.booking_id = b.id and t.type = 'journey_completed')
  loop
    perform private.award_journey_points(r.id);
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.tenant_brand(p_tenant uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with t as (
    select t.name, t.contact_email, t.contact_phone, t.brand
    from public.tenants t
    where t.id = coalesce(p_tenant, '00000000-0000-0000-0000-000000000001'::uuid)
  ),
  p as (
    select t.*,
           regexp_replace(coalesce(t.contact_phone, ''), '[\s()-]', '', 'g') as digits
    from t
  ),
  n as (
    select p.*,
           case when p.digits like '+44%'  then '0' || substr(p.digits, 4)
                when p.digits like '0044%' then '0' || substr(p.digits, 5)
                else p.digits end as national
    from p
  )
  select jsonb_build_object(
    'name',     btrim(coalesce(n.name, '')),
    'wordmark', upper(btrim(coalesce(n.name, ''))),
    'phone',    case when n.national ~ '^07[0-9]{9}$' then substr(n.national, 1, 5) || ' ' || substr(n.national, 6)
                     else btrim(coalesce(n.contact_phone, '')) end,
    'email',    btrim(coalesce(n.contact_email, '')),
    'domain',   case when coalesce(n.brand->>'site_url', '') ~* '^https?://'
                     then regexp_replace(regexp_replace(btrim(n.brand->>'site_url'), '^https?://', '', 'i'), '/+$', '')
                     else '' end,
    'tagline',  btrim(coalesce(n.brand->>'tagline', '')),
    'licence',  btrim(coalesce(n.brand->>'licence', ''))
  )
  from n
  union all
  select jsonb_build_object('name','','wordmark','','phone','','email','','domain','','tagline','','licence','')
  where not exists (select 1 from t)
  limit 1
$function$
;

CREATE OR REPLACE FUNCTION public.tenant_notification_email(p_tenant uuid, p_pill text, p_pill_bg text, p_pill_fg text, p_lead text, p_rows jsonb, p_footnote text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select
     '<!doctype html><html lang="en"><head>'
  || '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
  || '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">'
  || '<style>:root{color-scheme:light;supported-color-schemes:light}</style></head>'
  || '<body style="margin:0;background:#E9EBF2;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#0f1b33">'
  || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#E9EBF2" style="background:#E9EBF2"><tr><td align="center">'
  || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e5ee">'
  || '<tr><td bgcolor="#0B132B" style="background:#0B132B;padding:22px 28px">'
  ||   '<div style="color:#d7a23f;font-size:20px;font-weight:800;letter-spacing:.22em">' || evexec_esc(b.v->>'wordmark') || '</div>'
  || '</td></tr>'
  || '<tr><td bgcolor="#C9A550" style="background:#C9A550;height:4px;line-height:4px;font-size:0">&nbsp;</td></tr>'
  || '<tr><td bgcolor="#ffffff" style="background:#ffffff;padding:26px 28px">'
  ||   '<span style="display:inline-block;background:' || p_pill_bg || ';color:' || p_pill_fg || ';border-radius:999px;padding:6px 14px;font-size:12px;font-weight:700">' || p_pill || '</span>'
  ||   '<p style="margin:18px 0 16px;font-size:15px;line-height:1.6;color:#0f1b33">' || p_lead || '</p>'
  ||   '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin:0">'
  ||   coalesce((
         select string_agg(
                  '<tr><td style="padding:9px 0;color:#64748b;width:118px;border-bottom:1px solid #eef0f3;font-size:12px;text-transform:uppercase;letter-spacing:.04em;vertical-align:top">'
                  || evexec_esc(e->>'label')
                  || '</td><td style="padding:9px 0;font-weight:700;color:#0f1b33;border-bottom:1px solid #eef0f3;font-size:14px;vertical-align:top">'
                  || evexec_esc(e->>'value') || '</td></tr>',
                  '' order by ord)
         from jsonb_array_elements(p_rows) with ordinality as t(e, ord)
         where nullif(btrim(e->>'value'),'') is not null
       ),'')
  ||   '</table>'
  ||   case when nullif(btrim(coalesce(p_footnote,'')),'') is not null
            then '<p style="margin:18px 0 0;font-size:14px;line-height:1.6;color:#475569">' || p_footnote || '</p>'
            else '' end
  || '</td></tr>'
  || '<tr><td bgcolor="#0B132B" style="background:#0B132B;padding:14px 28px;color:#9aa3b2;font-size:11px">'
  ||   evexec_esc(concat_ws(' · ', nullif(b.v->>'name',''), nullif(b.v->>'tagline',''), nullif(b.v->>'phone',''), nullif(b.v->>'email',''), nullif(b.v->>'domain','')))
  ||   case when nullif(b.v->>'licence','') is not null then '<br>Private hire operator licence ' || evexec_esc(b.v->>'licence') else '' end
  ||   '</td></tr>'
  || '</table></td></tr></table></body></html>'
  from (select public.tenant_brand(p_tenant) as v) b
$function$
;

CREATE OR REPLACE FUNCTION public.touch_driver_location_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_fn_notify_driver_unassigned()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if old.assigned_driver_id is not null and (
    new.assigned_driver_id is null or
    new.assigned_driver_id <> old.assigned_driver_id
  ) then
    insert into public.driver_events (driver_id, event_type, payload)
    values (
      old.assigned_driver_id,
      'booking_unassigned',
      jsonb_build_object(
        'booking_id',    new.id,
        'ref',           new.ref,
        'customer_name', new.customer_name
      )
    );
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.unregister_operator_push(p_endpoint text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  delete from public.operator_push_subscriptions
  where endpoint = p_endpoint and user_id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.update_tenant_branding(p_tenant_id uuid, p_logo_url text, p_primary text, p_accent text)
 RETURNS tenants
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.tenants;
  v_logo text := nullif(btrim(coalesce(p_logo_url, '')), '');
  v_primary text := upper(nullif(btrim(coalesce(p_primary, '')), ''));
  v_accent text := upper(nullif(btrim(coalesce(p_accent, '')), ''));
begin
  if not exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid()
      and (tu.role = 'super_admin'
           or (tu.tenant_id = p_tenant_id and tu.role = 'operator_admin'))
  ) then
    raise exception 'Only an operator admin can change the logo and colours' using errcode = '42501';
  end if;

  if v_logo is not null and v_logo !~ ('^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/brand-assets/'
                                        || p_tenant_id::text || '/[A-Za-z0-9._-]{1,120}$') then
    raise exception 'Logo must be uploaded from Settings → Branding' using errcode = '22023';
  end if;
  if v_primary is not null and v_primary !~ '^#[0-9A-F]{6}$' then
    raise exception 'Main colour must be a hex colour like #0B132B' using errcode = '22023';
  end if;
  if v_accent is not null and v_accent !~ '^#[0-9A-F]{6}$' then
    raise exception 'Accent colour must be a hex colour like #D7A23F' using errcode = '22023';
  end if;

  update public.tenants t
     set brand = (coalesce(t.brand, '{}'::jsonb) - 'logo_url' - 'colors')
                 || case when v_logo is null then '{}'::jsonb else jsonb_build_object('logo_url', v_logo) end
                 || case when v_primary is null and v_accent is null then '{}'::jsonb
                         else jsonb_build_object('colors', jsonb_strip_nulls(jsonb_build_object('primary', v_primary, 'accent', v_accent))) end,
         updated_at = now()
   where t.id = p_tenant_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Unknown tenant' using errcode = 'P0002';
  end if;
  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_tenant_legal(p_tenant_id uuid, p_legal jsonb)
 RETURNS tenants
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.tenants;
  v_in jsonb := coalesce(p_legal, '{}'::jsonb);
  v_clean jsonb := '{}'::jsonb;
  v_text_fields text[] := array['legal_name','company_number','registered_address','base','area','service','fleet','luggage','points_name','ico_registration'];
  v_key text;
  v_val text;
  v_limits jsonb := '{"legal_name":100,"company_number":20,"registered_address":200,"base":100,"area":150,"service":150,"fleet":300,"luggage":300,"points_name":40,"ico_registration":40}';
  v_insured boolean;
  v_resp boolean;
  v_policy jsonb;
  v_pb jsonb;
  v_prev_hours numeric := null;
  v_prev_pct numeric := -1;
  v_i int;
  v_existing jsonb;
  v_final jsonb;
  v_text text;
begin
  if not exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid()
      and (tu.role = 'super_admin'
           or (tu.tenant_id = p_tenant_id and tu.role = 'operator_admin'))
  ) then
    raise exception 'Only an operator admin can change the legal details' using errcode = '42501';
  end if;

  select coalesce(t.brand -> 'legal', '{}'::jsonb) into v_existing
    from public.tenants t where t.id = p_tenant_id for update;
  if v_existing is null then
    raise exception 'Unknown tenant' using errcode = 'P0002';
  end if;

  foreach v_key in array v_text_fields loop
    if v_in ? v_key then
      v_val := btrim(coalesce(v_in ->> v_key, ''));
      if length(v_val) > (v_limits ->> v_key)::int then
        raise exception '% is too long (up to % characters)', v_key, (v_limits ->> v_key)::int using errcode = '22001';
      end if;
      v_clean := v_clean || jsonb_build_object(v_key, v_val);
    end if;
  end loop;

  if v_in ? 'status' then
    if v_in ->> 'status' not in ('sole trader', 'limited company', 'partnership') then
      raise exception 'Status must be sole trader, limited company or partnership' using errcode = '22023';
    end if;
    v_clean := v_clean || jsonb_build_object('status', v_in ->> 'status');
  end if;

  if v_in ? 'jurisdiction' then
    if v_in ->> 'jurisdiction' not in ('england-wales', 'scotland', 'northern-ireland') then
      raise exception 'Jurisdiction must be England and Wales, Scotland or Northern Ireland' using errcode = '22023';
    end if;
    v_clean := v_clean || jsonb_build_object('jurisdiction', v_in ->> 'jurisdiction');
  end if;

  if v_in ? 'insurance_confirmed' then
    if jsonb_typeof(v_in -> 'insurance_confirmed') <> 'boolean' then
      raise exception 'Insurance confirmation must be true or false' using errcode = '22023';
    end if;
    v_insured := (v_in ->> 'insurance_confirmed')::boolean;
    v_clean := v_clean || jsonb_build_object('insurance_confirmed', v_insured);
  end if;


  if v_in ? 'responsibilities_confirmed' then
    if jsonb_typeof(v_in -> 'responsibilities_confirmed') <> 'boolean' then
      raise exception 'The responsibilities confirmation must be true or false' using errcode = '22023';
    end if;
    v_resp := (v_in ->> 'responsibilities_confirmed')::boolean;
    v_clean := v_clean || jsonb_build_object('responsibilities_confirmed', v_resp);
  end if;

  if v_in ? 'policy' then
    v_policy := v_in -> 'policy';
    if jsonb_typeof(v_policy) <> 'object' or not (v_policy ? 'standard') or jsonb_typeof(v_policy -> 'standard') <> 'array'
       or jsonb_array_length(v_policy -> 'standard') <> 3 then
      raise exception 'Cancellation policy needs three bands (standard)' using errcode = '22023';
    end if;
    for v_i in 0..2 loop
      v_pb := (v_policy -> 'standard') -> v_i;
      if jsonb_typeof(v_pb) <> 'object' or jsonb_typeof(v_pb -> 'hours') <> 'number' or jsonb_typeof(v_pb -> 'pct') <> 'number' then
        raise exception 'Each cancellation band needs an hours number and a percentage' using errcode = '22023';
      end if;
      if (v_pb ->> 'hours')::numeric < 1 or (v_pb ->> 'hours')::numeric > 336 then
        raise exception 'Notice hours must be between 1 and 336' using errcode = '22023';
      end if;
      if (v_pb ->> 'pct')::numeric < 0 or (v_pb ->> 'pct')::numeric > 100 then
        raise exception 'A percentage must be between 0 and 100' using errcode = '22023';
      end if;
      if v_prev_hours is not null and ((v_pb ->> 'hours')::numeric >= v_prev_hours or (v_pb ->> 'pct')::numeric <= v_prev_pct) then
        raise exception 'Bands must get stricter: fewer hours and a higher percentage each time' using errcode = '22023';
      end if;
      v_prev_hours := (v_pb ->> 'hours')::numeric;
      v_prev_pct := (v_pb ->> 'pct')::numeric;
    end loop;
    if ((v_policy -> 'standard') -> 0 ->> 'pct')::numeric <> 0 then
      raise exception 'The first band must be 0 percent (free cancellation)' using errcode = '22023';
    end if;
    v_clean := v_clean || jsonb_build_object('policy', jsonb_build_object('standard', jsonb_build_array(
      jsonb_build_object('hours', (v_policy -> 'standard') -> 0 -> 'hours', 'pct', (v_policy -> 'standard') -> 0 -> 'pct'),
      jsonb_build_object('hours', (v_policy -> 'standard') -> 1 -> 'hours', 'pct', (v_policy -> 'standard') -> 1 -> 'pct'),
      jsonb_build_object('hours', (v_policy -> 'standard') -> 2 -> 'hours', 'pct', (v_policy -> 'standard') -> 2 -> 'pct')
    )));
  end if;


  if v_in ? 'terms_mode' then
    if v_in ->> 'terms_mode' not in ('standard', 'custom') then
      raise exception 'Terms must be standard or custom' using errcode = '22023';
    end if;
    v_clean := v_clean || jsonb_build_object('terms_mode', v_in ->> 'terms_mode');
  end if;

  if v_in ? 'custom_terms' then
    v_text := replace(btrim(coalesce(v_in ->> 'custom_terms', '')), E'\r', '');
    if length(v_text) > 30000 then
      raise exception 'Your terms are too long (up to 30000 characters)' using errcode = '22001';
    end if;
    v_clean := v_clean || jsonb_build_object('custom_terms', v_text);
    -- A new version each time the text changes, so each booking keeps the version it accepted.
    if v_text is distinct from coalesce(v_existing ->> 'custom_terms', '') then
      v_clean := v_clean || jsonb_build_object(
        'custom_terms_version', coalesce((v_existing ->> 'custom_terms_version')::int, 0) + 1,
        'custom_terms_updated_at', now()::text);
    end if;
  end if;

  if v_in ? 'privacy_extra' then
    v_text := replace(btrim(coalesce(v_in ->> 'privacy_extra', '')), E'\r', '');
    if length(v_text) > 4000 then
      raise exception 'The extra privacy section is too long (up to 4000 characters)' using errcode = '22001';
    end if;
    v_clean := v_clean || jsonb_build_object('privacy_extra', v_text);
  end if;

  if v_in ? 'numbers_confirmed' then
    if jsonb_typeof(v_in -> 'numbers_confirmed') <> 'boolean' then
      raise exception 'The confirmation must be true or false' using errcode = '22023';
    end if;
    v_clean := v_clean || jsonb_build_object('numbers_confirmed', (v_in ->> 'numbers_confirmed')::boolean);
  end if;

  -- Their own terms need real text and the operator's confirmation that the terms
  -- and the cancellation numbers say the same thing.
  v_final := v_existing || v_clean;
  if v_final ->> 'terms_mode' = 'custom' then
    if length(coalesce(btrim(v_final ->> 'custom_terms'), '')) < 100 then
      raise exception 'Write your terms before switching to them (at least 100 characters)' using errcode = '22023';
    end if;
    if coalesce((v_final ->> 'numbers_confirmed')::boolean, false) is not true then
      raise exception 'Confirm that your terms match the cancellation charges you set' using errcode = '22023';
    end if;
  end if;

  update public.tenants t
     set brand = jsonb_set(
           coalesce(t.brand, '{}'::jsonb),
           '{legal}',
           (v_existing || v_clean)
             || case
                  when v_insured is true then jsonb_build_object('insurance_confirmed_at', now()::text)
                  when v_insured is false then jsonb_build_object('insurance_confirmed_at', null)
                  else '{}'::jsonb
                end
             || case
                  when v_resp is true then jsonb_build_object('responsibilities_confirmed_at', now()::text, 'responsibilities_version', 1)
                  when v_resp is false then jsonb_build_object('responsibilities_confirmed_at', null, 'responsibilities_version', null)
                  else '{}'::jsonb
                end
         ),
         updated_at = now()
   where t.id = p_tenant_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Unknown tenant' using errcode = 'P0002';
  end if;
  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_tenant_pricing(p_tenant_id uuid, p_pricing jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_airports jsonb := '[]'::jsonb;
  v_item jsonb;
  v_name text;
  v_code text;
  v_one numeric;
  v_ret numeric;
  v_extra numeric;
  v_names text[] := '{}';
  v_result jsonb;
begin
  if not exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid()
      and (tu.role = 'super_admin'
           or (tu.tenant_id = p_tenant_id and tu.role = 'operator_admin'))
  ) then
    raise exception 'Only an operator admin can change prices' using errcode = '42501';
  end if;

  if p_pricing is null or jsonb_typeof(p_pricing) <> 'object'
     or jsonb_typeof(p_pricing->'airports') is distinct from 'array' then
    raise exception 'Prices must include a list of airports' using errcode = '22023';
  end if;
  if jsonb_array_length(p_pricing->'airports') > 30 then
    raise exception 'At most 30 airports' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_pricing->'airports') loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Each airport must be an object' using errcode = '22023';
    end if;
    v_name := nullif(btrim(coalesce(v_item->>'name', '')), '');
    if v_name is null or length(v_name) > 80 then
      raise exception 'Each airport needs a name (max 80 characters)' using errcode = '22023';
    end if;
    if lower(v_name) = any (v_names) then
      raise exception 'Airport "%" is listed twice', v_name using errcode = '22023';
    end if;
    v_names := v_names || lower(v_name);

    v_code := upper(nullif(btrim(coalesce(v_item->>'code', '')), ''));
    if v_code is not null and v_code !~ '^[A-Z]{3,4}$' then
      raise exception 'Airport code for % must be 3 or 4 letters', v_name using errcode = '22023';
    end if;

    if jsonb_typeof(v_item->'one_way') is distinct from 'number' or jsonb_typeof(v_item->'return_fare') is distinct from 'number' then
      raise exception 'One-way and return prices for % must be numbers', v_name using errcode = '22023';
    end if;
    v_one := round((v_item->>'one_way')::numeric, 2);
    v_ret := round((v_item->>'return_fare')::numeric, 2);
    if v_one <= 0 or v_one > 10000 or v_ret <= 0 or v_ret > 20000 then
      raise exception 'Prices for % must be between £0.01 and £10,000 one way (£20,000 return)', v_name using errcode = '22023';
    end if;

    v_airports := v_airports || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'name', v_name, 'code', v_code, 'one_way', v_one, 'return_fare', v_ret)));
  end loop;

  if p_pricing ? 'extra_stop' then
    if jsonb_typeof(p_pricing->'extra_stop') is distinct from 'number' then
      raise exception 'Extra stop charge must be a number' using errcode = '22023';
    end if;
    v_extra := round((p_pricing->>'extra_stop')::numeric, 2);
    if v_extra < 0 or v_extra > 500 then
      raise exception 'Extra stop charge must be between £0 and £500' using errcode = '22023';
    end if;
  else
    v_extra := 0;
  end if;

  v_result := jsonb_build_object('airports', v_airports, 'extra_stop', v_extra);

  update public.tenants t
     set pricing = v_result, updated_at = now()
   where t.id = p_tenant_id;
  if not found then
    raise exception 'Unknown tenant' using errcode = 'P0002';
  end if;
  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_tenant_profile(p_tenant_id uuid, p_name text, p_contact_email text, p_contact_phone text, p_invoice jsonb)
 RETURNS tenants
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_invoice jsonb := '{}'::jsonb;
  v_row public.tenants;
begin
  if not exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid()
      and (tu.role = 'super_admin'
           or (tu.tenant_id = p_tenant_id and tu.role = 'operator_admin'))
  ) then
    raise exception 'Only an operator admin can change business details'
      using errcode = '42501';
  end if;

  p_name := nullif(btrim(coalesce(p_name, '')), '');
  if p_name is null or length(p_name) > 120 then
    raise exception 'Business name is required (max 120 characters)' using errcode = '22023';
  end if;
  p_contact_email := nullif(btrim(coalesce(p_contact_email, '')), '');
  if p_contact_email is not null and (length(p_contact_email) > 254 or p_contact_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'Contact email is not valid' using errcode = '22023';
  end if;
  p_contact_phone := nullif(btrim(coalesce(p_contact_phone, '')), '');
  if p_contact_phone is not null and length(p_contact_phone) > 40 then
    raise exception 'Phone number is too long' using errcode = '22023';
  end if;

  if p_invoice is not null then
    if jsonb_typeof(p_invoice) <> 'object' then
      raise exception 'Invoice details must be an object' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_each(p_invoice) e
      where e.key in ('business_name', 'address_lines', 'phone', 'email', 'web', 'tagline', 'payment_terms')
        and (
          length(e.value::text) > 2000
          or (e.key in ('address_lines', 'tagline')
              and case when jsonb_typeof(e.value) <> 'array' then true
                       else exists (select 1 from jsonb_array_elements(e.value) x where jsonb_typeof(x) <> 'string')
                  end)
          or (e.key not in ('address_lines', 'tagline') and jsonb_typeof(e.value) <> 'string')
        )
    ) then
      raise exception 'Invoice details are not in the expected format' using errcode = '22023';
    end if;
    select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_invoice
    from jsonb_each(p_invoice)
    where key in ('business_name', 'address_lines', 'phone', 'email', 'web', 'tagline', 'payment_terms');
  end if;

  update public.tenants t
     set name = p_name,
         contact_email = p_contact_email,
         contact_phone = p_contact_phone,
         brand = coalesce(t.brand, '{}'::jsonb)
                 || jsonb_build_object('invoice', coalesce(t.brand->'invoice', '{}'::jsonb) || v_invoice),
         updated_at = now()
   where t.id = p_tenant_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Unknown tenant' using errcode = 'P0002';
  end if;
  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.verify_notification_sweep_token(p_token text)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'notification_sweep_token'
      and decrypted_secret = p_token
  );
$function$
;


-- ─── Views ─────────────────────────────────────────────────────────────────

create view public.notification_log_dashboard with (security_invoker=on) as  SELECT id,
    booking_id,
    type,
    channel,
    sent_at
   FROM notification_log;

create view public.notification_queue_dashboard with (security_invoker=on) as  SELECT id,
    booking_id,
    type,
    channel,
    status,
    delivery_status,
    attempts,
    next_attempt_at,
    sent_at,
    created_at,
    last_error IS NOT NULL AS has_error
   FROM notification_queue;


-- ─── Triggers ──────────────────────────────────────────────────────────────

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
CREATE TRIGGER audit_log_set_tenant BEFORE INSERT ON public.audit_log FOR EACH ROW EXECUTE FUNCTION private.set_audit_log_tenant();
CREATE TRIGGER award_journey_points AFTER INSERT OR UPDATE OF status, user_id, customer_email ON public.bookings FOR EACH ROW EXECUTE FUNCTION private.trg_award_journey_points();
CREATE TRIGGER booking_audit_log_trigger AFTER UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION private.log_booking_changes();
CREATE TRIGGER booking_status_transition BEFORE UPDATE ON public.bookings FOR EACH ROW WHEN ((old.status IS DISTINCT FROM new.status)) EXECUTE FUNCTION enforce_booking_status_transition();
CREATE TRIGGER bookings_updated_at BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER driver_double_booking BEFORE INSERT OR UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION prevent_driver_double_booking();
CREATE TRIGGER enforce_booking_status_transition BEFORE UPDATE OF status ON public.bookings FOR EACH ROW EXECUTE FUNCTION enforce_booking_status_transition();
CREATE TRIGGER ensure_invoice_on_completion AFTER UPDATE OF status ON public.bookings FOR EACH ROW EXECUTE FUNCTION private.trg_ensure_invoice();
CREATE TRIGGER sync_booking_driver_assignment_fields_trigger BEFORE INSERT OR UPDATE OF driver_id, assigned_driver_id ON public.bookings FOR EACH ROW EXECUTE FUNCTION sync_booking_driver_assignment_fields();
CREATE TRIGGER trg_booking_push AFTER INSERT OR UPDATE OF assigned_driver_id ON public.bookings FOR EACH ROW EXECUTE FUNCTION notify_driver_new_booking();
CREATE TRIGGER trg_enqueue_driver_notifications AFTER INSERT OR UPDATE OF driver_id, assigned_driver_id, payment_status ON public.bookings FOR EACH ROW EXECUTE FUNCTION enqueue_driver_notifications();
CREATE TRIGGER trg_enqueue_operator_customer_notifications AFTER INSERT OR UPDATE OF status, payment_status, driver_id, assigned_driver_id ON public.bookings FOR EACH ROW EXECUTE FUNCTION enqueue_operator_customer_notifications();
CREATE TRIGGER trg_notify_driver_unassigned AFTER UPDATE OF assigned_driver_id ON public.bookings FOR EACH ROW EXECUTE FUNCTION trg_fn_notify_driver_unassigned();
CREATE TRIGGER trg_notify_job_update AFTER UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION notify_driver_job_update();
CREATE TRIGGER trg_operator_new_booking_push AFTER INSERT ON public.bookings FOR EACH ROW EXECUTE FUNCTION notify_operator_new_booking();
CREATE TRIGGER trg_operator_no_show_push AFTER UPDATE OF status ON public.bookings FOR EACH ROW EXECUTE FUNCTION notify_operator_no_show();
CREATE TRIGGER trg_sync_assigned_driver_id BEFORE INSERT OR UPDATE OF driver_id ON public.bookings FOR EACH ROW EXECUTE FUNCTION sync_assigned_driver_id();
CREATE TRIGGER zz_guard_driver_booking_update BEFORE UPDATE ON public.bookings FOR EACH ROW WHEN (((CURRENT_USER = ANY (ARRAY['authenticated'::name, 'anon'::name])) AND (NOT private.staff_for_tenant(old.tenant_id)))) EXECUTE FUNCTION private.guard_driver_booking_update();
CREATE TRIGGER driver_locations_touch BEFORE INSERT OR UPDATE ON public.driver_locations FOR EACH ROW EXECUTE FUNCTION touch_driver_location_updated_at();
CREATE TRIGGER drivers_updated_at BEFORE UPDATE ON public.drivers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER zz_guard_driver_record_update BEFORE UPDATE ON public.drivers FOR EACH ROW WHEN (((CURRENT_USER = ANY (ARRAY['authenticated'::name, 'anon'::name])) AND (NOT private.staff_for_tenant(old.tenant_id)))) EXECUTE FUNCTION private.guard_driver_record_update();
CREATE TRIGGER trg_set_invoice_number BEFORE INSERT OR UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION set_invoice_number();
CREATE TRIGGER missed_calls_updated_at BEFORE UPDATE ON public.missed_calls FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER notification_log_set_tenant BEFORE INSERT ON public.notification_log FOR EACH ROW EXECUTE FUNCTION private.set_tenant_from_booking();
CREATE TRIGGER notification_queue_set_tenant BEFORE INSERT ON public.notification_queue FOR EACH ROW EXECUTE FUNCTION private.set_tenant_from_booking();
CREATE TRIGGER set_push_subscription_tenant BEFORE INSERT OR UPDATE OF user_id ON public.operator_push_subscriptions FOR EACH ROW EXECUTE FUNCTION private.set_push_subscription_tenant();

-- ─── Row-level security ────────────────────────────────────────────────────

alter table private.staff_users enable row level security;
alter table public.audit_log enable row level security;
alter table public.booking_audit_log enable row level security;
alter table public.booking_expenses enable row level security;
alter table public.booking_photos enable row level security;
alter table public.bookings enable row level security;
alter table public.contact_messages enable row level security;
alter table public.driver_events enable row level security;
alter table public.driver_locations enable row level security;
alter table public.driver_messages enable row level security;
alter table public.driver_shifts enable row level security;
alter table public.driver_sms_reminders enable row level security;
alter table public.driver_unavailable_dates enable row level security;
alter table public.drivers enable row level security;
alter table public.error_log enable row level security;
alter table public.flight_verification_settings enable row level security;
alter table public.flight_verifications enable row level security;
alter table public.invoices enable row level security;
alter table public.job_proofs enable row level security;
alter table public.missed_calls enable row level security;
alter table public.notification_channel_settings enable row level security;
alter table public.notification_log enable row level security;
alter table public.notification_queue enable row level security;
alter table public.operator_push_subscriptions enable row level security;
alter table public.operator_sms_tasks enable row level security;
alter table public.points_transactions enable row level security;
alter table public.profiles enable row level security;
alter table public.push_config enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.quote_requests enable row level security;
alter table public.reviews enable row level security;
alter table public.saved_addresses enable row level security;
alter table public.stripe_webhook_events enable row level security;
alter table public.stripe_webhook_rejections enable row level security;
alter table public.tenant_users enable row level security;
alter table public.tenants enable row level security;

-- ─── Policies ──────────────────────────────────────────────────────────────

create policy audit_log_insert_own on public.audit_log as PERMISSIVE for INSERT to authenticated
  with check ((actor_id = auth.uid()));

create policy audit_log_select_staff on public.audit_log as PERMISSIVE for SELECT to public
  using (private.staff_for_tenant(tenant_id));

create policy audit_log_service_bypass on public.audit_log as PERMISSIVE for ALL to service_role
  using (true)
  with check (true);

create policy staff_select_booking_audit_log on public.booking_audit_log as PERMISSIVE for SELECT to public
  using ((EXISTS ( SELECT 1
   FROM bookings b
  WHERE ((b.id = booking_audit_log.booking_id) AND private.staff_for_tenant(b.tenant_id)))));

create policy driver_own_expenses on public.booking_expenses as PERMISSIVE for ALL to public
  using ((EXISTS ( SELECT 1
   FROM bookings b
  WHERE ((b.id = booking_expenses.booking_id) AND (b.assigned_driver_id = ( SELECT auth.uid() AS uid))))))
  with check ((EXISTS ( SELECT 1
   FROM bookings b
  WHERE ((b.id = booking_expenses.booking_id) AND (b.assigned_driver_id = ( SELECT auth.uid() AS uid))))));

create policy "driver delete own booking photos" on public.booking_photos as PERMISSIVE for DELETE to public
  using ((( SELECT auth.uid() AS uid) = driver_id));

create policy "driver insert own booking photos" on public.booking_photos as PERMISSIVE for INSERT to public
  with check ((( SELECT auth.uid() AS uid) = driver_id));

create policy "driver read own booking photos" on public.booking_photos as PERMISSIVE for SELECT to public
  using ((( SELECT auth.uid() AS uid) = driver_id));

create policy bookings_driver_select on public.bookings as PERMISSIVE for SELECT to authenticated
  using (((assigned_driver_id = ( SELECT auth.uid() AS uid)) AND (tenant_id = ( SELECT d.tenant_id
   FROM drivers d
  WHERE (d.id = ( SELECT auth.uid() AS uid))))));

create policy bookings_driver_update on public.bookings as PERMISSIVE for UPDATE to authenticated
  using (((assigned_driver_id = ( SELECT auth.uid() AS uid)) AND (tenant_id = ( SELECT d.tenant_id
   FROM drivers d
  WHERE (d.id = ( SELECT auth.uid() AS uid))))))
  with check (((assigned_driver_id = ( SELECT auth.uid() AS uid)) AND (tenant_id = ( SELECT d.tenant_id
   FROM drivers d
  WHERE (d.id = ( SELECT auth.uid() AS uid))))));

create policy customers_see_own_bookings on public.bookings as PERMISSIVE for SELECT to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)));

create policy staff_all_bookings on public.bookings as PERMISSIVE for ALL to public
  using (private.staff_for_tenant(tenant_id))
  with check (private.staff_for_tenant(tenant_id));

create policy anon_insert_contact_messages on public.contact_messages as PERMISSIVE for INSERT to anon
  with check (true);

create policy auth_insert_contact_messages on public.contact_messages as PERMISSIVE for INSERT to authenticated
  with check (true);

create policy staff_all_contact_messages on public.contact_messages as PERMISSIVE for ALL to public
  using (private.staff_for_tenant(tenant_id))
  with check (private.staff_for_tenant(tenant_id));

create policy driver_events_insert_service on public.driver_events as PERMISSIVE for INSERT to public
  with check (false);

create policy driver_events_select_own on public.driver_events as PERMISSIVE for SELECT to public
  using ((driver_id = auth.uid()));

create policy driver_locations_service_bypass on public.driver_locations as PERMISSIVE for ALL to service_role
  using (true)
  with check (true);

create policy driver_own_locations on public.driver_locations as PERMISSIVE for ALL to authenticated
  using ((driver_id = ( SELECT auth.uid() AS uid)))
  with check ((driver_id = ( SELECT auth.uid() AS uid)));

create policy staff_select_driver_locations on public.driver_locations as PERMISSIVE for SELECT to public
  using ((EXISTS ( SELECT 1
   FROM drivers d
  WHERE ((d.id = driver_locations.driver_id) AND private.staff_for_tenant(d.tenant_id)))));

create policy "driver insert own messages" on public.driver_messages as PERMISSIVE for INSERT to public
  with check (((( SELECT auth.uid() AS uid) = driver_id) AND (from_driver = true)));

create policy "driver read own messages" on public.driver_messages as PERMISSIVE for SELECT to public
  using ((( SELECT auth.uid() AS uid) = driver_id));

create policy "driver read own shifts" on public.driver_shifts as PERMISSIVE for SELECT to public
  using ((( SELECT auth.uid() AS uid) = driver_id));

create policy driver_insert_own_sms_reminders on public.driver_sms_reminders as PERMISSIVE for INSERT to authenticated
  with check (((driver_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM bookings b
  WHERE ((b.id = driver_sms_reminders.booking_id) AND (b.assigned_driver_id = ( SELECT auth.uid() AS uid)) AND (b.tenant_id = driver_sms_reminders.tenant_id))))));

create policy driver_select_own_sms_reminders on public.driver_sms_reminders as PERMISSIVE for SELECT to authenticated
  using ((driver_id = ( SELECT auth.uid() AS uid)));

create policy driver_update_own_sms_reminders on public.driver_sms_reminders as PERMISSIVE for UPDATE to public
  using ((driver_id = ( SELECT auth.uid() AS uid)))
  with check ((driver_id = ( SELECT auth.uid() AS uid)));

create policy staff_select_sms_reminders on public.driver_sms_reminders as PERMISSIVE for SELECT to public
  using (private.staff_for_tenant(tenant_id));

create policy staff_update_sms_reminders on public.driver_sms_reminders as PERMISSIVE for UPDATE to public
  using (private.staff_for_tenant(tenant_id))
  with check (private.staff_for_tenant(tenant_id));

create policy driver_own_unavailability on public.driver_unavailable_dates as PERMISSIVE for ALL to public
  using ((( SELECT auth.uid() AS uid) = driver_id))
  with check ((( SELECT auth.uid() AS uid) = driver_id));

create policy staff_select_driver_unavailable_dates on public.driver_unavailable_dates as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM drivers d
  WHERE ((d.id = driver_unavailable_dates.driver_id) AND private.staff_for_tenant(d.tenant_id)))));

create policy drivers_self_select on public.drivers as PERMISSIVE for SELECT to authenticated
  using ((id = ( SELECT auth.uid() AS uid)));

create policy drivers_self_update on public.drivers as PERMISSIVE for UPDATE to public
  using ((id = ( SELECT auth.uid() AS uid)))
  with check ((id = ( SELECT auth.uid() AS uid)));

create policy staff_all_drivers on public.drivers as PERMISSIVE for ALL to public
  using (private.staff_for_tenant(tenant_id))
  with check (private.staff_for_tenant(tenant_id));

create policy error_log_insert_authenticated on public.error_log as PERMISSIVE for INSERT to authenticated
  with check (true);

create policy error_log_select_staff on public.error_log as PERMISSIVE for SELECT to public
  using (private.staff_for_tenant(tenant_id));

create policy error_log_service_bypass on public.error_log as PERMISSIVE for ALL to service_role
  using (true)
  with check (true);

create policy staff_all_flight_verification_settings on public.flight_verification_settings as PERMISSIVE for ALL to public
  using (private.staff_for_tenant(tenant_id))
  with check (private.staff_for_tenant(tenant_id));

create policy driver_select_flight_verifications on public.flight_verifications as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM bookings b
  WHERE ((b.id = flight_verifications.booking_id) AND (b.assigned_driver_id = ( SELECT auth.uid() AS uid))))));

create policy staff_all_flight_verifications on public.flight_verifications as PERMISSIVE for ALL to public
  using (private.staff_for_tenant(tenant_id))
  with check (private.staff_for_tenant(tenant_id));

create policy staff_all_invoices on public.invoices as PERMISSIVE for ALL to public
  using (private.staff_for_tenant(tenant_id))
  with check (private.staff_for_tenant(tenant_id));

create policy driver_insert_job_proofs on public.job_proofs as PERMISSIVE for INSERT to authenticated
  with check ((EXISTS ( SELECT 1
   FROM bookings b
  WHERE ((b.id = job_proofs.booking_id) AND (b.assigned_driver_id = ( SELECT auth.uid() AS uid))))));

create policy job_proofs_service_bypass on public.job_proofs as PERMISSIVE for ALL to service_role
  using (true)
  with check (true);

create policy staff_select_job_proofs on public.job_proofs as PERMISSIVE for SELECT to public
  using ((EXISTS ( SELECT 1
   FROM bookings b
  WHERE ((b.id = job_proofs.booking_id) AND private.staff_for_tenant(b.tenant_id)))));

create policy staff_all_missed_calls on public.missed_calls as PERMISSIVE for ALL to public
  using (private.staff_for_tenant(tenant_id))
  with check (private.staff_for_tenant(tenant_id));

create policy staff_insert_notification_channel_settings on public.notification_channel_settings as PERMISSIVE for INSERT to authenticated
  with check (private.staff_for_tenant(tenant_id));

create policy staff_select_notification_channel_settings on public.notification_channel_settings as PERMISSIVE for SELECT to authenticated
  using (private.staff_for_tenant(tenant_id));

create policy staff_update_notification_channel_settings on public.notification_channel_settings as PERMISSIVE for UPDATE to authenticated
  using (private.staff_for_tenant(tenant_id))
  with check (private.staff_for_tenant(tenant_id));

create policy "service role only" on public.notification_log as PERMISSIVE for ALL to public
  using ((( SELECT auth.role() AS role) = 'service_role'::text))
  with check ((( SELECT auth.role() AS role) = 'service_role'::text));

create policy staff_select_notification_log on public.notification_log as PERMISSIVE for SELECT to authenticated
  using (private.staff_for_tenant(tenant_id));

create policy service_role_full_access_notification_queue on public.notification_queue as PERMISSIVE for ALL to public
  using ((( SELECT auth.role() AS role) = 'service_role'::text))
  with check ((( SELECT auth.role() AS role) = 'service_role'::text));

create policy staff_select_notification_queue on public.notification_queue as PERMISSIVE for SELECT to authenticated
  using (private.staff_for_tenant(tenant_id));

create policy staff_manage_own_push_subscription on public.operator_push_subscriptions as PERMISSIVE for ALL to authenticated
  using (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.user_id = auth.uid()) AND (tu.role = ANY (ARRAY['super_admin'::text, 'operator_admin'::text, 'dispatcher'::text])))))))
  with check (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.user_id = auth.uid()) AND (tu.role = ANY (ARRAY['super_admin'::text, 'operator_admin'::text, 'dispatcher'::text])))))));

create policy staff_select_operator_sms_tasks on public.operator_sms_tasks as PERMISSIVE for SELECT to public
  using (private.staff_for_tenant(tenant_id));

create policy staff_update_operator_sms_tasks on public.operator_sms_tasks as PERMISSIVE for UPDATE to public
  using (private.staff_for_tenant(tenant_id))
  with check (private.staff_for_tenant(tenant_id));

create policy points_select_own on public.points_transactions as PERMISSIVE for SELECT to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)));

create policy points_staff_select on public.points_transactions as PERMISSIVE for SELECT to authenticated
  using (private.staff_for_tenant(tenant_id));

create policy "Users can insert own profile" on public.profiles as PERMISSIVE for INSERT to public
  with check ((( SELECT auth.uid() AS uid) = id));

create policy "Users can update own profile" on public.profiles as PERMISSIVE for UPDATE to public
  using ((( SELECT auth.uid() AS uid) = id));

create policy "Users can view own profile" on public.profiles as PERMISSIVE for SELECT to public
  using ((( SELECT auth.uid() AS uid) = id));

create policy driver_own_subs on public.push_subscriptions as PERMISSIVE for ALL to public
  using ((driver_id = ( SELECT auth.uid() AS uid)))
  with check ((driver_id = ( SELECT auth.uid() AS uid)));

create policy anon_insert on public.quote_requests as PERMISSIVE for INSERT to anon
  with check (true);

create policy staff_all_quote_requests on public.quote_requests as PERMISSIVE for ALL to public
  using (private.staff_for_tenant(tenant_id))
  with check (private.staff_for_tenant(tenant_id));

create policy public_read_reviews on public.reviews as PERMISSIVE for SELECT to anon, authenticated
  using (true);

create policy "Users manage their own saved addresses" on public.saved_addresses as PERMISSIVE for ALL to public
  using ((( SELECT auth.uid() AS uid) = user_id))
  with check ((( SELECT auth.uid() AS uid) = user_id));

create policy tenant_users_self_select on public.tenant_users as PERMISSIVE for SELECT to public
  using (((user_id = auth.uid()) OR private.is_super_admin()));

create policy tenants_self_select on public.tenants as PERMISSIVE for SELECT to public
  using (private.is_member_of_tenant(id));

create policy "Drivers delete job photos" on storage.objects as PERMISSIVE for DELETE to public
  using (((bucket_id = 'job-photos'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

create policy "Drivers delete own docs" on storage.objects as PERMISSIVE for DELETE to public
  using (((bucket_id = 'driver-docs'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

create policy "Drivers update own docs" on storage.objects as PERMISSIVE for UPDATE to public
  using (((bucket_id = 'driver-docs'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

create policy "Drivers upload job photos" on storage.objects as PERMISSIVE for INSERT to public
  with check (((bucket_id = 'job-photos'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

create policy "Drivers upload own docs" on storage.objects as PERMISSIVE for INSERT to public
  with check (((bucket_id = 'driver-docs'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

create policy "Drivers view job photos" on storage.objects as PERMISSIVE for SELECT to public
  using (((bucket_id = 'job-photos'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

create policy "Drivers view own docs" on storage.objects as PERMISSIVE for SELECT to public
  using (((bucket_id = 'driver-docs'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

create policy avatars_owner_delete on storage.objects as PERMISSIVE for DELETE to authenticated
  using (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

create policy avatars_owner_update on storage.objects as PERMISSIVE for UPDATE to authenticated
  using (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)))
  with check (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

create policy avatars_owner_write on storage.objects as PERMISSIVE for INSERT to authenticated
  with check (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

create policy avatars_public_read on storage.objects as PERMISSIVE for SELECT to public
  using ((bucket_id = 'avatars'::text));

create policy brand_assets_admin_delete on storage.objects as PERMISSIVE for DELETE to authenticated
  using (((bucket_id = 'brand-assets'::text) AND private.can_brand_tenant_folder((storage.foldername(name))[1])));

create policy brand_assets_admin_insert on storage.objects as PERMISSIVE for INSERT to authenticated
  with check (((bucket_id = 'brand-assets'::text) AND private.can_brand_tenant_folder((storage.foldername(name))[1])));

create policy brand_assets_admin_read on storage.objects as PERMISSIVE for SELECT to authenticated
  using (((bucket_id = 'brand-assets'::text) AND private.can_brand_tenant_folder((storage.foldername(name))[1])));

create policy brand_assets_admin_update on storage.objects as PERMISSIVE for UPDATE to authenticated
  using (((bucket_id = 'brand-assets'::text) AND private.can_brand_tenant_folder((storage.foldername(name))[1])))
  with check (((bucket_id = 'brand-assets'::text) AND private.can_brand_tenant_folder((storage.foldername(name))[1])));


-- ─── Schema rights ─────────────────────────────────────────────────────────

revoke all on schema private from public, anon, authenticated, service_role;
grant USAGE on schema public to anon;
grant USAGE on schema public to authenticated;
grant USAGE on schema public to public;
grant USAGE on schema public to service_role;

-- ─── Table, view and sequence rights ───────────────────────────────────────

revoke all on table private.staff_users from public, anon, authenticated, service_role;
revoke all on table public.audit_log from public, anon, authenticated, service_role;
revoke all on table public.booking_audit_log from public, anon, authenticated, service_role;
revoke all on sequence public.booking_audit_log_id_seq from public, anon, authenticated, service_role;
revoke all on table public.booking_expenses from public, anon, authenticated, service_role;
revoke all on table public.booking_photos from public, anon, authenticated, service_role;
revoke all on table public.bookings from public, anon, authenticated, service_role;
revoke all on table public.contact_messages from public, anon, authenticated, service_role;
revoke all on table public.driver_events from public, anon, authenticated, service_role;
revoke all on sequence public.driver_events_id_seq from public, anon, authenticated, service_role;
revoke all on table public.driver_locations from public, anon, authenticated, service_role;
revoke all on table public.driver_messages from public, anon, authenticated, service_role;
revoke all on table public.driver_shifts from public, anon, authenticated, service_role;
revoke all on table public.driver_sms_reminders from public, anon, authenticated, service_role;
revoke all on table public.driver_unavailable_dates from public, anon, authenticated, service_role;
revoke all on table public.drivers from public, anon, authenticated, service_role;
revoke all on table public.error_log from public, anon, authenticated, service_role;
revoke all on table public.flight_verification_settings from public, anon, authenticated, service_role;
revoke all on table public.flight_verifications from public, anon, authenticated, service_role;
revoke all on sequence public.invoice_seq from public, anon, authenticated, service_role;
revoke all on table public.invoices from public, anon, authenticated, service_role;
revoke all on table public.job_proofs from public, anon, authenticated, service_role;
revoke all on table public.missed_calls from public, anon, authenticated, service_role;
revoke all on table public.notification_channel_settings from public, anon, authenticated, service_role;
revoke all on table public.notification_log from public, anon, authenticated, service_role;
revoke all on table public.notification_log_dashboard from public, anon, authenticated, service_role;
revoke all on sequence public.notification_log_id_seq from public, anon, authenticated, service_role;
revoke all on table public.notification_queue from public, anon, authenticated, service_role;
revoke all on table public.notification_queue_dashboard from public, anon, authenticated, service_role;
revoke all on table public.operator_push_subscriptions from public, anon, authenticated, service_role;
revoke all on table public.operator_sms_tasks from public, anon, authenticated, service_role;
revoke all on table public.points_transactions from public, anon, authenticated, service_role;
revoke all on table public.profiles from public, anon, authenticated, service_role;
revoke all on table public.push_config from public, anon, authenticated, service_role;
revoke all on table public.push_subscriptions from public, anon, authenticated, service_role;
revoke all on table public.quote_requests from public, anon, authenticated, service_role;
revoke all on table public.reviews from public, anon, authenticated, service_role;
revoke all on table public.saved_addresses from public, anon, authenticated, service_role;
revoke all on table public.stripe_webhook_events from public, anon, authenticated, service_role;
revoke all on table public.stripe_webhook_rejections from public, anon, authenticated, service_role;
revoke all on sequence public.stripe_webhook_rejections_id_seq from public, anon, authenticated, service_role;
revoke all on table public.tenant_users from public, anon, authenticated, service_role;
revoke all on table public.tenants from public, anon, authenticated, service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.audit_log to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public.audit_log to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.booking_audit_log to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public.booking_audit_log to authenticated;
grant SELECT, UPDATE, USAGE on sequence public.booking_audit_log_id_seq to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.booking_expenses to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public.booking_expenses to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.booking_photos to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public.booking_photos to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.bookings to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public.bookings to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.contact_messages to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public.contact_messages to authenticated;
grant INSERT on table public.contact_messages to anon;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.driver_events to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public.driver_events to authenticated;
grant SELECT, UPDATE, USAGE on sequence public.driver_events_id_seq to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.driver_locations to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public.driver_locations to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.driver_messages to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public.driver_messages to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.driver_shifts to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public.driver_shifts to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.driver_sms_reminders to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public.driver_sms_reminders to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.driver_unavailable_dates to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public.driver_unavailable_dates to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.drivers to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public.drivers to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.error_log to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public.error_log to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.flight_verification_settings to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public.flight_verification_settings to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.flight_verifications to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public.flight_verifications to authenticated;
grant SELECT, UPDATE, USAGE on sequence public.invoice_seq to service_role;
grant USAGE on sequence public.invoice_seq to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.invoices to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public.invoices to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.job_proofs to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public.job_proofs to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.missed_calls to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public.missed_calls to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.notification_channel_settings to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public.notification_channel_settings to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.notification_log to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public.notification_log to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.notification_log_dashboard to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public.notification_log_dashboard to authenticated;
grant SELECT, UPDATE, USAGE on sequence public.notification_log_id_seq to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.notification_queue to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public.notification_queue to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.notification_queue_dashboard to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public.notification_queue_dashboard to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.operator_push_subscriptions to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public.operator_push_subscriptions to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.operator_sms_tasks to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public.operator_sms_tasks to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.points_transactions to service_role;
grant SELECT on table public.points_transactions to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.profiles to service_role;
grant SELECT on table public.profiles to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.push_config to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.push_subscriptions to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public.push_subscriptions to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.quote_requests to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public.quote_requests to authenticated;
grant INSERT on table public.quote_requests to anon;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.reviews to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public.reviews to authenticated;
grant SELECT on table public.reviews to anon;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.saved_addresses to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public.saved_addresses to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.stripe_webhook_events to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.stripe_webhook_rejections to service_role;
grant SELECT, UPDATE, USAGE on sequence public.stripe_webhook_rejections_id_seq to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.tenant_users to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public.tenant_users to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.tenants to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public.tenants to authenticated;

-- ─── Function rights ───────────────────────────────────────────────────────

revoke all on function driver_accept_booking(uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function driver_alert_webhook_secrets() from public, anon, authenticated, service_role;
revoke all on function driver_update_status(uuid,text,uuid) from public, anon, authenticated, service_role;
revoke all on function enforce_booking_status_transition() from public, anon, authenticated, service_role;
revoke all on function enqueue_driver_notifications() from public, anon, authenticated, service_role;
revoke all on function enqueue_operator_customer_notifications() from public, anon, authenticated, service_role;
revoke all on function evexec_esc(text) from public, anon, authenticated, service_role;
revoke all on function evexec_notification_email(text,text,text,text,jsonb,text) from public, anon, authenticated, service_role;
revoke all on function get_booking_status_breakdown(timestamp with time zone) from public, anon, authenticated, service_role;
revoke all on function get_booking_totals(timestamp with time zone) from public, anon, authenticated, service_role;
revoke all on function get_push_dispatch_bundle(text) from public, anon, authenticated, service_role;
revoke all on function get_push_dispatch_bundle_for_tenant(text,uuid) from public, anon, authenticated, service_role;
revoke all on function get_push_public_key() from public, anon, authenticated, service_role;
revoke all on function handle_new_user() from public, anon, authenticated, service_role;
revoke all on function notif_pick_channel(boolean,boolean,boolean) from public, anon, authenticated, service_role;
revoke all on function notify_driver_job_update() from public, anon, authenticated, service_role;
revoke all on function notify_driver_new_booking() from public, anon, authenticated, service_role;
revoke all on function notify_operator_new_booking() from public, anon, authenticated, service_role;
revoke all on function notify_operator_no_show() from public, anon, authenticated, service_role;
revoke all on function prevent_driver_double_booking() from public, anon, authenticated, service_role;
revoke all on function private.award_journey_points(uuid) from public, anon, authenticated, service_role;
revoke all on function private.can_brand_tenant_folder(text) from public, anon, authenticated, service_role;
revoke all on function private.ensure_invoice_for_booking(uuid) from public, anon, authenticated, service_role;
revoke all on function private.guard_driver_booking_update() from public, anon, authenticated, service_role;
revoke all on function private.guard_driver_record_update() from public, anon, authenticated, service_role;
revoke all on function private.is_known_driver() from public, anon, authenticated, service_role;
revoke all on function private.is_member_of_tenant(uuid) from anon, authenticated, service_role;
revoke all on function private.is_staff() from public, anon, authenticated, service_role;
revoke all on function private.is_super_admin() from anon, authenticated, service_role;
revoke all on function private.log_booking_changes() from public, anon, authenticated, service_role;
revoke all on function private.run_evexec_backup() from public, anon, authenticated, service_role;
revoke all on function private.set_audit_log_tenant() from anon, authenticated, service_role;
revoke all on function private.set_push_subscription_tenant() from public, anon, authenticated, service_role;
revoke all on function private.set_tenant_from_booking() from public, anon, authenticated, service_role;
revoke all on function private.staff_for_tenant(uuid) from anon, authenticated, service_role;
revoke all on function private.trg_award_journey_points() from public, anon, authenticated, service_role;
revoke all on function private.trg_ensure_invoice() from public, anon, authenticated, service_role;
revoke all on function provision_tenant(text,text,text,text) from public, anon, authenticated, service_role;
revoke all on function queue_customer_sms(text,text,text,text) from public, anon, authenticated, service_role;
revoke all on function register_operator_push(text,text,text,text) from public, anon, authenticated, service_role;
revoke all on function set_invoice_number() from public, anon, authenticated, service_role;
revoke all on function set_updated_at() from public, anon, authenticated, service_role;
revoke all on function stripe_webhook_event_seen(text,text,boolean,text) from public, anon, authenticated, service_role;
revoke all on function sync_assigned_driver_id() from public, anon, authenticated, service_role;
revoke all on function sync_booking_driver_assignment_fields() from public, anon, authenticated, service_role;
revoke all on function sync_my_invoices() from public, anon, authenticated, service_role;
revoke all on function sync_my_points() from public, anon, authenticated, service_role;
revoke all on function tenant_brand(uuid) from public, anon, authenticated, service_role;
revoke all on function tenant_notification_email(uuid,text,text,text,text,jsonb,text) from public, anon, authenticated, service_role;
revoke all on function touch_driver_location_updated_at() from public, anon, authenticated, service_role;
revoke all on function trg_fn_notify_driver_unassigned() from public, anon, authenticated, service_role;
revoke all on function unregister_operator_push(text) from public, anon, authenticated, service_role;
revoke all on function update_tenant_branding(uuid,text,text,text) from public, anon, authenticated, service_role;
revoke all on function update_tenant_legal(uuid,jsonb) from public, anon, authenticated, service_role;
revoke all on function update_tenant_pricing(uuid,jsonb) from public, anon, authenticated, service_role;
revoke all on function update_tenant_profile(uuid,text,text,text,jsonb) from public, anon, authenticated, service_role;
revoke all on function update_updated_at() from public, anon, authenticated, service_role;
revoke all on function verify_notification_sweep_token(text) from public, anon, authenticated, service_role;
grant execute on function driver_accept_booking(uuid,uuid) to service_role;
grant execute on function driver_alert_webhook_secrets() to service_role;
grant execute on function driver_update_status(uuid,text,uuid) to service_role;
grant execute on function enforce_booking_status_transition() to anon;
grant execute on function enforce_booking_status_transition() to authenticated;
grant execute on function enforce_booking_status_transition() to public;
grant execute on function enforce_booking_status_transition() to service_role;
grant execute on function enqueue_driver_notifications() to service_role;
grant execute on function enqueue_operator_customer_notifications() to service_role;
grant execute on function evexec_esc(text) to service_role;
grant execute on function evexec_notification_email(text,text,text,text,jsonb,text) to service_role;
grant execute on function get_booking_status_breakdown(timestamp with time zone) to authenticated;
grant execute on function get_booking_status_breakdown(timestamp with time zone) to service_role;
grant execute on function get_booking_totals(timestamp with time zone) to authenticated;
grant execute on function get_booking_totals(timestamp with time zone) to service_role;
grant execute on function get_push_dispatch_bundle(text) to anon;
grant execute on function get_push_dispatch_bundle(text) to authenticated;
grant execute on function get_push_dispatch_bundle(text) to service_role;
grant execute on function get_push_dispatch_bundle_for_tenant(text,uuid) to anon;
grant execute on function get_push_dispatch_bundle_for_tenant(text,uuid) to authenticated;
grant execute on function get_push_dispatch_bundle_for_tenant(text,uuid) to service_role;
grant execute on function get_push_public_key() to authenticated;
grant execute on function get_push_public_key() to service_role;
grant execute on function handle_new_user() to service_role;
grant execute on function notif_pick_channel(boolean,boolean,boolean) to service_role;
grant execute on function notify_driver_job_update() to service_role;
grant execute on function notify_driver_new_booking() to service_role;
grant execute on function notify_operator_new_booking() to service_role;
grant execute on function notify_operator_no_show() to service_role;
grant execute on function prevent_driver_double_booking() to anon;
grant execute on function prevent_driver_double_booking() to authenticated;
grant execute on function prevent_driver_double_booking() to public;
grant execute on function prevent_driver_double_booking() to service_role;
grant execute on function private.can_brand_tenant_folder(text) to authenticated;
grant execute on function private.guard_driver_booking_update() to anon;
grant execute on function private.guard_driver_booking_update() to authenticated;
grant execute on function private.guard_driver_booking_update() to public;
grant execute on function private.guard_driver_record_update() to anon;
grant execute on function private.guard_driver_record_update() to authenticated;
grant execute on function private.guard_driver_record_update() to public;
grant execute on function private.is_known_driver() to authenticated;
grant execute on function private.is_staff() to authenticated;
grant execute on function private.is_staff() to public;
grant execute on function private.log_booking_changes() to authenticated;
grant execute on function private.log_booking_changes() to public;
grant execute on function provision_tenant(text,text,text,text) to service_role;
grant execute on function queue_customer_sms(text,text,text,text) to authenticated;
grant execute on function queue_customer_sms(text,text,text,text) to service_role;
grant execute on function register_operator_push(text,text,text,text) to authenticated;
grant execute on function register_operator_push(text,text,text,text) to service_role;
grant execute on function set_invoice_number() to anon;
grant execute on function set_invoice_number() to authenticated;
grant execute on function set_invoice_number() to public;
grant execute on function set_invoice_number() to service_role;
grant execute on function set_updated_at() to anon;
grant execute on function set_updated_at() to authenticated;
grant execute on function set_updated_at() to public;
grant execute on function set_updated_at() to service_role;
grant execute on function stripe_webhook_event_seen(text,text,boolean,text) to service_role;
grant execute on function sync_assigned_driver_id() to anon;
grant execute on function sync_assigned_driver_id() to authenticated;
grant execute on function sync_assigned_driver_id() to public;
grant execute on function sync_assigned_driver_id() to service_role;
grant execute on function sync_booking_driver_assignment_fields() to anon;
grant execute on function sync_booking_driver_assignment_fields() to authenticated;
grant execute on function sync_booking_driver_assignment_fields() to public;
grant execute on function sync_booking_driver_assignment_fields() to service_role;
grant execute on function sync_my_invoices() to authenticated;
grant execute on function sync_my_invoices() to service_role;
grant execute on function sync_my_points() to authenticated;
grant execute on function sync_my_points() to service_role;
grant execute on function tenant_brand(uuid) to service_role;
grant execute on function tenant_notification_email(uuid,text,text,text,text,jsonb,text) to service_role;
grant execute on function touch_driver_location_updated_at() to anon;
grant execute on function touch_driver_location_updated_at() to authenticated;
grant execute on function touch_driver_location_updated_at() to public;
grant execute on function touch_driver_location_updated_at() to service_role;
grant execute on function trg_fn_notify_driver_unassigned() to service_role;
grant execute on function unregister_operator_push(text) to authenticated;
grant execute on function unregister_operator_push(text) to service_role;
grant execute on function update_tenant_branding(uuid,text,text,text) to authenticated;
grant execute on function update_tenant_branding(uuid,text,text,text) to service_role;
grant execute on function update_tenant_legal(uuid,jsonb) to authenticated;
grant execute on function update_tenant_legal(uuid,jsonb) to service_role;
grant execute on function update_tenant_pricing(uuid,jsonb) to authenticated;
grant execute on function update_tenant_pricing(uuid,jsonb) to service_role;
grant execute on function update_tenant_profile(uuid,text,text,text,jsonb) to authenticated;
grant execute on function update_tenant_profile(uuid,text,text,text,jsonb) to service_role;
grant execute on function update_updated_at() to anon;
grant execute on function update_updated_at() to authenticated;
grant execute on function update_updated_at() to public;
grant execute on function update_updated_at() to service_role;
grant execute on function verify_notification_sweep_token(text) to service_role;

-- ─── Realtime ──────────────────────────────────────────────────────────────

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                     and schemaname = 'public' and tablename = 'bookings') then
    alter publication supabase_realtime add table public.bookings;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                     and schemaname = 'public' and tablename = 'driver_events') then
    alter publication supabase_realtime add table public.driver_events;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                     and schemaname = 'public' and tablename = 'driver_locations') then
    alter publication supabase_realtime add table public.driver_locations;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                     and schemaname = 'public' and tablename = 'drivers') then
    alter publication supabase_realtime add table public.drivers;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                     and schemaname = 'public' and tablename = 'job_proofs') then
    alter publication supabase_realtime add table public.job_proofs;
  end if;
end $$;

-- ─── Storage buckets ───────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('avatars', 'avatars', 't', null, null) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('brand-assets', 'brand-assets', 't', 1048576, '{image/png,image/jpeg,image/webp}'::text[]) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('driver-docs', 'driver-docs', 'f', 10485760, '{image/jpeg,image/png,image/webp,image/heic,application/pdf}'::text[]) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('job-photos', 'job-photos', 'f', 10485760, '{image/jpeg,image/png,image/webp,image/heic}'::text[]) on conflict (id) do nothing;

-- ─── Rights given to tables, sequences and functions created later ─────────
-- As on live for role postgres in schema public (10/11/2026).
alter default privileges for role postgres in schema public revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges for role postgres in schema public grant all on tables to service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant execute on functions to anon, authenticated, service_role;


-- ─── Rows the structure depends on ──────────────────────────────────────────
-- The first operator business. Column defaults and the sign-up trigger point at
-- this id, so it must exist. Name only: no contact details, prices or branding.
insert into public.tenants (id, slug, name)
values ('00000000-0000-0000-0000-000000000001', 'ev-exec', 'EV Exec')
on conflict (id) do nothing;


-- ─── Live settings recorded for reference (not created here) ────────────────
-- live: for role postgres in schema public, S: {postgres=rwU/postgres,anon=rwU/postgres,authenticated=rwU/postgres,service_role=rwU/postgres}
-- live: for role supabase_admin in schema public, S: {postgres=rwU/supabase_admin,anon=rwU/supabase_admin,authenticated=rwU/supabase_admin,service_role=rwU/supabase_admin}
-- live: for role postgres in schema public, f: {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- live: for role supabase_admin in schema public, f: {postgres=X/supabase_admin,anon=X/supabase_admin,authenticated=X/supabase_admin,service_role=X/supabase_admin}
-- live: for role postgres in schema public, r: {postgres=arwdDxtm/postgres,authenticated=arwd/postgres,service_role=arwdDxtm/postgres}
-- live: for role supabase_admin in schema public, r: {postgres=arwdDxtm/supabase_admin,anon=arwdDxtm/supabase_admin,authenticated=arwdDxtm/supabase_admin,service_role=arwdDxtm/supabase_admin}
-- cron job (not created by the baseline): attestation-engine-sweep  schedule * * * * *
-- cron job (not created by the baseline): customer-sms-reminder-push-sweep  schedule * * * * *
-- cron job (not created by the baseline): driver-reminder-sweep  schedule * * * * *
-- cron job (not created by the baseline): nightly-database-backup  schedule 17 2 * * *
-- cron job (not created by the baseline): notification-queue-sweep  schedule * * * * *

-- business_signin_brand (20261112240000)

create or replace function public.business_signin_brand(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select jsonb_build_object(
    'name', t.name,
    'logo_url', nullif(t.brand ->> 'logo_url', ''),
    'primary', case when t.brand #>> '{colors,primary}' ~ '^#[0-9A-Fa-f]{6}$' then t.brand #>> '{colors,primary}' end,
    'accent', case when t.brand #>> '{colors,accent}' ~ '^#[0-9A-Fa-f]{6}$' then t.brand #>> '{colors,accent}' end
  )
  from public.tenants t
  where t.slug = lower(btrim(coalesce(p_slug, ''))) and t.status = 'active'
  limit 1;
$fn$;

revoke all on function public.business_signin_brand(text) from public;
grant execute on function public.business_signin_brand(text) to anon, authenticated, service_role;

-- update_tenant_licence (20261112260000)

create or replace function public.update_tenant_licence(p_tenant_id uuid, p_licence text)
returns public.tenants
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_row public.tenants;
  v_clean text;
begin
  if not exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid()
      and (tu.role = 'super_admin'
           or (tu.tenant_id = p_tenant_id and tu.role = 'operator_admin'))
  ) then
    raise exception 'Only an operator admin can change the licence number' using errcode = '42501';
  end if;

  v_clean := upper(regexp_replace(coalesce(p_licence, ''), '[\s-]', '', 'g'));
  if v_clean <> '' and v_clean !~ '^[A-Z0-9]{3,20}$' then
    raise exception 'The licence number must be 3 to 20 letters and numbers' using errcode = '22023';
  end if;

  update public.tenants t
     set brand = jsonb_set(coalesce(t.brand, '{}'::jsonb), '{licence}',
                           case when v_clean = '' then 'null'::jsonb else to_jsonb(v_clean) end),
         updated_at = now()
   where t.id = p_tenant_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Unknown tenant' using errcode = 'P0002';
  end if;
  return v_row;
end;
$fn$;

revoke all on function public.update_tenant_licence(uuid, text) from public, anon;
grant execute on function public.update_tenant_licence(uuid, text) to authenticated, service_role;

-- platform fees (20261113150000)

create table if not exists public.platform_fees (
  id boolean primary key default true check (id),
  default_monthly_pence integer not null default 9900 check (default_monthly_pence between 0 and 1000000),
  default_setup_pence integer not null default 99900 check (default_setup_pence between 0 and 10000000),
  updated_at timestamptz not null default now()
);
insert into public.platform_fees (id) values (true) on conflict (id) do nothing;
alter table public.platform_fees enable row level security;
revoke all on public.platform_fees from public, anon, authenticated;

alter table public.tenants
  add column if not exists monthly_fee_pence integer check (monthly_fee_pence is null or monthly_fee_pence between 0 and 1000000),
  add column if not exists setup_fee_pence integer check (setup_fee_pence is null or setup_fee_pence between 0 and 10000000);


create or replace function public.get_platform_fees()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
begin
  if not private.is_super_admin() then
    raise exception 'Only the platform owner can see the fees' using errcode = '42501';
  end if;
  return (select jsonb_build_object('default_monthly_pence', f.default_monthly_pence, 'default_setup_pence', f.default_setup_pence)
            from public.platform_fees f where f.id);
end;
$fn$;

create or replace function public.set_default_fees(p_monthly_pence integer, p_setup_pence integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if not private.is_super_admin() then
    raise exception 'Only the platform owner can change the fees' using errcode = '42501';
  end if;
  if p_monthly_pence is null or p_monthly_pence < 0 or p_monthly_pence > 1000000 then
    raise exception 'The monthly fee must be between £0 and £10,000' using errcode = '22023';
  end if;
  if p_setup_pence is null or p_setup_pence < 0 or p_setup_pence > 10000000 then
    raise exception 'The set-up fee must be between £0 and £100,000' using errcode = '22023';
  end if;
  update public.platform_fees set default_monthly_pence = p_monthly_pence, default_setup_pence = p_setup_pence, updated_at = now() where id;
  return jsonb_build_object('default_monthly_pence', p_monthly_pence, 'default_setup_pence', p_setup_pence);
end;
$fn$;

create or replace function public.set_tenant_fees(p_tenant_id uuid, p_monthly_pence integer, p_setup_pence integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if not private.is_super_admin() then
    raise exception 'Only the platform owner can change a business''s fees' using errcode = '42501';
  end if;
  if p_monthly_pence is not null and (p_monthly_pence < 0 or p_monthly_pence > 1000000) then
    raise exception 'The monthly fee must be between £0 and £10,000' using errcode = '22023';
  end if;
  if p_setup_pence is not null and (p_setup_pence < 0 or p_setup_pence > 10000000) then
    raise exception 'The set-up fee must be between £0 and £100,000' using errcode = '22023';
  end if;
  update public.tenants set monthly_fee_pence = p_monthly_pence, setup_fee_pence = p_setup_pence, updated_at = now() where id = p_tenant_id;
  if not found then
    raise exception 'Unknown business' using errcode = 'P0002';
  end if;
  return jsonb_build_object('tenant_id', p_tenant_id, 'monthly_fee_pence', p_monthly_pence, 'setup_fee_pence', p_setup_pence);
end;
$fn$;

create or replace function public.list_tenant_fees()
returns table (tenant_id uuid, slug text, name text, monthly_pence integer, setup_pence integer, custom boolean)
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
begin
  if not private.is_super_admin() then
    raise exception 'Only the platform owner can see the fees' using errcode = '42501';
  end if;
  return query
    select t.id, t.slug, t.name,
           coalesce(t.monthly_fee_pence, f.default_monthly_pence),
           coalesce(t.setup_fee_pence, f.default_setup_pence),
           (t.monthly_fee_pence is not null or t.setup_fee_pence is not null)
      from public.tenants t
      cross join public.platform_fees f
     where f.id
     order by t.created_at;
end;
$fn$;

revoke all on function public.get_platform_fees() from public, anon;
revoke all on function public.set_default_fees(integer, integer) from public, anon;
revoke all on function public.set_tenant_fees(uuid, integer, integer) from public, anon;
revoke all on function public.list_tenant_fees() from public, anon;
grant execute on function public.get_platform_fees() to authenticated, service_role;
grant execute on function public.set_default_fees(integer, integer) to authenticated, service_role;
grant execute on function public.set_tenant_fees(uuid, integer, integer) to authenticated, service_role;
grant execute on function public.list_tenant_fees() to authenticated, service_role;
