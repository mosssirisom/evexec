-- Flight verification: a dedicated, append-only table recording every
-- AeroDataBox lookup run against an airport booking, independent of the
-- pre-existing bookings.flight_status/flight_checked_at cache (which backs
-- the driver app's separate live FlightAware tracker widget on the job
-- detail page and is left untouched by this migration).
begin;

create table if not exists public.flight_verifications (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references public.tenants(id) default '00000000-0000-0000-0000-000000000001',
  booking_id              uuid not null references public.bookings(id) on delete cascade,

  direction               text not null check (direction in ('arrival','departure')),
  flight_number           text not null,
  flight_date             date not null,
  departure_airport_input text,
  arrival_airport_input   text,
  customer_time_input     text,

  result                  text not null check (result in ('verified','mismatch','unavailable','error')),
  severity                text not null check (severity in ('green','amber','red')),
  issues                  jsonb not null default '[]'::jsonb,

  flight_status           text,
  departure_iata          text,
  arrival_iata            text,
  scheduled_departure     timestamptz,
  scheduled_arrival       timestamptz,
  estimated_departure     timestamptz,
  estimated_arrival       timestamptz,
  actual_departure        timestamptz,
  actual_arrival          timestamptz,

  recommended_pickup      timestamptz,
  buffer_minutes_used     int,

  raw_response            jsonb,

  source                  text not null default 'manual' check (source in ('manual','auto_initial','auto_day_before')),
  verified_by             uuid references auth.users(id),
  verified_by_name        text,
  verified_at             timestamptz not null default now(),

  override                boolean not null default false,
  override_reason         text,
  override_by             uuid references auth.users(id),
  override_at             timestamptz,

  created_at              timestamptz not null default now()
);

comment on table public.flight_verifications is 'One row per AeroDataBox verification attempt against an airport booking. Append-only -- the full history for a booking_id is its audit trail.';

create index if not exists flight_verifications_booking_idx on public.flight_verifications (booking_id, verified_at desc);
create index if not exists flight_verifications_tenant_idx  on public.flight_verifications (tenant_id);

alter table public.flight_verifications enable row level security;

create policy staff_all_flight_verifications on public.flight_verifications
  for all
  using (private.staff_for_tenant(tenant_id))
  with check (private.staff_for_tenant(tenant_id));

create policy driver_select_flight_verifications on public.flight_verifications
  for select
  using (
    exists (
      select 1 from public.bookings b
      where b.id = flight_verifications.booking_id
        and (
          b.assigned_driver_id = auth.uid()
          or b.assigned_driver_id in (select id from public.drivers where email = auth.email())
        )
    )
  );

-- Settings: configurable pickup buffer per tenant (Requirement 5 -- "make
-- the buffer configurable rather than hardcoded").
create table if not exists public.flight_verification_settings (
  tenant_id             uuid primary key references public.tenants(id) default '00000000-0000-0000-0000-000000000001',
  pickup_buffer_minutes int not null default 45 check (pickup_buffer_minutes >= 0 and pickup_buffer_minutes <= 240),
  updated_at            timestamptz not null default now(),
  updated_by            uuid references auth.users(id)
);

insert into public.flight_verification_settings (tenant_id)
values ('00000000-0000-0000-0000-000000000001')
on conflict (tenant_id) do nothing;

alter table public.flight_verification_settings enable row level security;

create policy staff_all_flight_verification_settings on public.flight_verification_settings
  for all
  using (private.staff_for_tenant(tenant_id))
  with check (private.staff_for_tenant(tenant_id));

commit;
