-- EV Exec Notification Infrastructure Setup
-- Run inside Supabase SQL editor

create extension if not exists pgcrypto;

create table if not exists notification_queue (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid null,
  type text,
  channel text not null,
  recipient text not null,
  subject text,
  body text,
  html text,
  meta jsonb default '{}'::jsonb,

  status text default 'pending',
  delivery_status text,
  provider_message_id text,

  attempts int default 0,
  next_attempt_at timestamptz default now(),
  sent_at timestamptz,
  last_error text,

  created_at timestamptz default now()
);

create index if not exists idx_notification_queue_status
on notification_queue(status);

create index if not exists idx_notification_queue_next_attempt
on notification_queue(next_attempt_at);

create index if not exists idx_notification_queue_booking
on notification_queue(booking_id);

create index if not exists idx_notification_queue_delivery
on notification_queue(delivery_status);

alter table notification_queue enable row level security;

create policy "service_role_full_access_notification_queue"
on notification_queue
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

comment on table notification_queue is
'Persistent retry queue for EV Exec SMS and email notifications';
