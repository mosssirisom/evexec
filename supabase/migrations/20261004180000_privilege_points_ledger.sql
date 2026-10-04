-- Privilege Points: one point per completed journey, recorded in a ledger.
--
-- Before this, points were a mutable profiles.privilege_points number bumped
-- from the website when a booking was created or claimed (read-modify-write,
-- no history, never reversed, awarded before anyone travelled).
--
-- Now:
--  * points_transactions is the source of truth; a balance is the sum of a
--    customer's rows.
--  * A booking can earn 'journey_completed' points once, ever (unique index),
--    so repeated status changes (Completed -> Passenger On Board -> Completed),
--    retries or repeated API calls can never award twice.
--  * Points are awarded by the database when a booking is Completed, to the
--    linked account (bookings.user_id) or, if none, to the account whose
--    confirmed email matches the booking email.
--  * Customers can read their own rows and nothing else; only the server and
--    these functions write.

create table if not exists public.points_transactions (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default '00000000-0000-0000-0000-000000000001' references public.tenants(id),
  user_id     uuid not null references auth.users(id) on delete cascade,
  booking_id  uuid references public.bookings(id) on delete set null,
  points      integer not null check (points <> 0),
  type        text not null check (type in ('journey_completed', 'adjustment', 'reversal')),
  note        text,
  created_at  timestamptz not null default now(),
  created_by  uuid
);

create unique index if not exists points_transactions_one_award_per_booking
  on public.points_transactions (booking_id) where type = 'journey_completed';
create index if not exists points_transactions_user_idx on public.points_transactions (user_id, created_at desc);

alter table public.points_transactions enable row level security;
revoke all on public.points_transactions from anon, authenticated;
grant select on public.points_transactions to authenticated;
create policy points_select_own on public.points_transactions
  for select to authenticated using (user_id = (select auth.uid()));
create policy points_staff_select on public.points_transactions
  for select to authenticated using (private.staff_for_tenant(tenant_id));

-- Award points for one booking if it is completed. Idempotent.
create or replace function private.award_journey_points(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
          concat_ws(' · ', b.ref, coalesce(b.airport, b.journey_type), to_char(b.travel_date, 'DD Mon YYYY')))
  on conflict (booking_id) where type = 'journey_completed' do nothing;
end;
$$;

-- Trigger: never blocks the booking update, whatever happens.
create or replace function private.trg_award_journey_points()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

drop trigger if exists award_journey_points on public.bookings;
create trigger award_journey_points
  after insert or update of status, user_id, customer_email on public.bookings
  for each row execute function private.trg_award_journey_points();

-- Called by the account API on load: awards any completed journeys of the
-- signed-in customer that have not been awarded yet (e.g. an account created
-- after the journeys, or a booking linked later). Idempotent.
create or replace function public.sync_my_points()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

revoke all on function public.sync_my_points() from public, anon;
grant execute on function public.sync_my_points() to authenticated;
revoke all on function private.award_journey_points(uuid) from public, anon, authenticated;
revoke all on function private.trg_award_journey_points() from public, anon, authenticated;

-- Backfill: every completed booking that belongs to an account.
do $$
declare r record;
begin
  for r in select id from public.bookings where status in ('Completed', 'completed') loop
    perform private.award_journey_points(r.id);
  end loop;
end $$;

comment on column public.profiles.privilege_points is
  'Deprecated 2026-10-04: no longer written or read. Balance = sum(points_transactions.points).';
