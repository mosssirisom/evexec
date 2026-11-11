-- Stand-ins for the parts of a Supabase project that plain Postgres lacks, so
-- schema.sql and the tests can load on a throwaway local database.
--
-- For tests only. Never run this on a Supabase project (it has the real things).
-- Run as a superuser named postgres, on an empty database, before schema.sql.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to public;
do $$ begin execute format('alter database %I set search_path to "$user", public, extensions', current_database()); end $$;
set search_path to "$user", public, extensions;

-- What Supabase sets up for the public schema before any migration runs.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;

-- auth: users and the request helpers that policies call.
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid,
  aud text,
  role text,
  email text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  created_at timestamptz,
  updated_at timestamptz
);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select auth.jwt() ->> 'role'
$$;
create function auth.email() returns text language sql stable as $$
  select auth.jwt() ->> 'email'
$$;

-- storage: just enough for the bucket rows and the file policies.
create schema storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (
  id text primary key,
  name text not null,
  owner uuid,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  owner_id text,
  metadata jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1 : array_length(string_to_array(name, '/'), 1) - 1]
$$;

-- vault: no secrets locally, so every lookup finds nothing.
create schema vault;
create table vault.decrypted_secrets (id uuid default gen_random_uuid(), name text, decrypted_secret text);

-- pg_net: outgoing calls go nowhere, but are remembered in net._sent so tests
-- can check what the triggers would have sent.
create schema net;
create table net._sent (id bigserial primary key, url text, headers jsonb, body jsonb);
create function net.http_post(
  url text,
  body jsonb default '{}'::jsonb,
  params jsonb default '{}'::jsonb,
  headers jsonb default '{"Content-Type": "application/json"}'::jsonb,
  timeout_milliseconds integer default 5000
) returns bigint language sql as $$
  insert into net._sent (url, headers, body) values (url, headers, body) returning id
$$;
grant usage on schema net to anon, authenticated, service_role;

create publication supabase_realtime;
