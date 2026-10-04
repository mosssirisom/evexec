-- Customer invoices: the same invoices table and numbering the operator app
-- uses (INV-0001 …), now linked to bookings and created automatically when a
-- booking is completed.
--
--  * invoices.booking_id links an invoice to its booking; a unique index means
--    a booking can never have two invoices.
--  * Existing hand-made invoices are linked to their booking by reference.
--  * private.ensure_invoice_for_booking() is idempotent: it links an existing
--    invoice for the booking, or creates one. It does nothing for unpriced
--    bookings or for automatically created return legs (the outbound invoice
--    covers the whole return fare and lists the return as a second line).
--  * A bookings trigger runs it when a booking becomes Completed, and
--    sync_my_invoices() runs it for the signed-in customer's completed
--    bookings (accounts created after the journey).
--  * Business details for invoices live in tenants.brand.invoice.

alter table public.invoices add column if not exists booking_id uuid references public.bookings(id) on delete set null;
create unique index if not exists invoices_one_per_booking on public.invoices (booking_id) where booking_id is not null;

update public.invoices i set booking_id = b.id
  from public.bookings b
 where i.booking_id is null and (b.ref = i.booking_ref or b.id::text = i.booking_ref);

update public.tenants
   set brand = coalesce(brand, '{}'::jsonb) || jsonb_build_object('invoice', jsonb_build_object(
     'business_name', 'EV Exec',
     'address_lines', jsonb_build_array('EV Exec', 'Wheeler Hub Drive', 'Blackpool, FY2 0FD', 'United Kingdom'),
     'phone', '07721 070370',
     'email', 'book@evexec.co.uk',
     'web', 'evexec.co.uk',
     'tagline', jsonb_build_array('ELEVATING EXPERIENCES', 'DRIVING EXCELLENCE.'),
     'payment_terms', E'Payment is due within 15 days of invoice date.\nBank Transfer / BACS Preferred.'))
 where slug = 'ev-exec';

create or replace function private.ensure_invoice_for_booking(p_booking_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

  -- A hand-made invoice for this booking: link it rather than duplicate it.
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
$$;
revoke all on function private.ensure_invoice_for_booking(uuid) from public, anon, authenticated;

create or replace function private.trg_ensure_invoice()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;
revoke all on function private.trg_ensure_invoice() from public, anon, authenticated;

create trigger ensure_invoice_on_completion
  after update of status on public.bookings
  for each row execute function private.trg_ensure_invoice();

create or replace function public.sync_my_invoices()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;
revoke all on function public.sync_my_invoices() from public, anon;
grant execute on function public.sync_my_invoices() to authenticated;
