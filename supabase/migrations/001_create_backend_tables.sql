create extension if not exists pgcrypto;

create table if not exists quote_requests (
  id uuid primary key default gen_random_uuid(),
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
  status text default 'new',
  created_at timestamptz default now()
);

create table if not exists contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  message text not null,
  status text default 'new',
  created_at timestamptz default now()
);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  reviewer_name text not null,
  rating integer not null default 5,
  review_text text not null,
  source text default 'Google',
  is_featured boolean default true,
  created_at timestamptz default now()
);

alter table quote_requests enable row level security;
alter table contact_messages enable row level security;
alter table reviews enable row level security;
