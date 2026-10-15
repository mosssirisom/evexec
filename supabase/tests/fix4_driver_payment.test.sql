-- Fix 4: completing a job never marks it Paid; Paid/Invoiced stay untouched.
-- Works the same for the old Driver App (still on some phones until they
-- reload) and the fixed one, so the release order doesn't matter.
-- d01 is assigned b1 (Unpaid), b3 (Invoiced, On Board) and b4 (Paid, On Board).
select test.as_owner();
update public.bookings set status = 'En Route' where id = 'cccccccc-0000-0000-0000-0000000000b1';
update public.bookings set status = 'Passenger On Board' where id = 'cccccccc-0000-0000-0000-0000000000b1';

select test.login('bbbbbbbb-0000-0000-0000-000000000d01', 'dr1@example.com');

-- Exactly what the OLD Driver App sends for Card: the job completes, the
-- Card method is recorded, but payment_status stays Unpaid.
select test.lives($$update public.bookings set status = 'Completed', completed_at = now(), updated_at = now(), payment_method = 'Card', payment_status = 'Paid' where id = 'cccccccc-0000-0000-0000-0000000000b1'$$,
  'old app: Card completion still goes through');
select test.as_owner();
select test.ok((select payment_status = 'Unpaid' and payment_method = 'Card' and status = 'Completed' and completed_at is not null from public.bookings where id = 'cccccccc-0000-0000-0000-0000000000b1'),
  'old app: job Completed, method Card, still Unpaid (not marked Paid)');

-- Fixed Driver App on an unpaid job: same result.
update public.bookings set status = 'Passenger On Board', payment_method = null, completed_at = null where id = 'cccccccc-0000-0000-0000-0000000000b1';
select test.login('bbbbbbbb-0000-0000-0000-000000000d01', 'dr1@example.com');
select test.lives($$update public.bookings set status = 'Completed', completed_at = now(), updated_at = now(), payment_method = 'Bank Transfer' where id = 'cccccccc-0000-0000-0000-0000000000b1'$$,
  'new app: completes an unpaid job and records Bank Transfer');
select test.as_owner();
select test.ok((select payment_status = 'Unpaid' and payment_method = 'Bank Transfer' from public.bookings where id = 'cccccccc-0000-0000-0000-0000000000b1'),
  'new app: unpaid job stays Unpaid until the office confirms');

-- Invoiced account job: old app picks Cash and sends nothing about status.
select test.login('bbbbbbbb-0000-0000-0000-000000000d01', 'dr1@example.com');
select test.lives($$update public.bookings set status = 'Completed', completed_at = now(), updated_at = now(), payment_method = 'Cash' where id = 'cccccccc-0000-0000-0000-0000000000b3'$$,
  'old app: completes an invoiced job');
-- Prepaid job: old app picks Card -> sends payment_status Paid too.
select test.lives($$update public.bookings set status = 'Completed', completed_at = now(), updated_at = now(), payment_method = 'Cash', payment_status = 'Unpaid' where id = 'cccccccc-0000-0000-0000-0000000000b4'$$,
  'driver update that tries to un-pay a prepaid job still completes it');

select test.as_owner();
select test.ok((select status = 'Completed' and payment_status = 'Invoiced' and payment_method = 'Bank Transfer' from public.bookings where id = 'cccccccc-0000-0000-0000-0000000000b3'),
  'invoiced job: Completed, keeps Invoiced and Bank Transfer');
select test.ok((select status = 'Completed' and payment_status = 'Paid' and payment_method = 'Card' from public.bookings where id = 'cccccccc-0000-0000-0000-0000000000b4'),
  'prepaid job: Completed, keeps Paid and Card');

-- A bare payment_status write by a driver changes nothing.
select test.login('bbbbbbbb-0000-0000-0000-000000000d01', 'dr1@example.com');
update public.bookings set payment_status = 'Paid' where id = 'cccccccc-0000-0000-0000-0000000000b1';
select test.as_owner();
select test.ok((select payment_status = 'Unpaid' from public.bookings where id = 'cccccccc-0000-0000-0000-0000000000b1'),
  'driver cannot mark a job Paid directly');

-- Other columns are still refused outright (Fix 3 rule kept).
select test.login('bbbbbbbb-0000-0000-0000-000000000d01', 'dr1@example.com');
select test.throws($$update public.bookings set price = 1 where id = 'cccccccc-0000-0000-0000-0000000000b1'$$,
  'driver still cannot change the price');

-- The office can still record payment.
select test.login('aaaaaaaa-0000-0000-0000-0000000000a1', 'admin@example.com');
select test.lives($$update public.bookings set payment_status = 'Paid' where id = 'cccccccc-0000-0000-0000-0000000000b1'$$,
  'office marks the job Paid once it clears');
select test.as_owner();
select test.ok((select payment_status = 'Paid' from public.bookings where id = 'cccccccc-0000-0000-0000-0000000000b1'),
  'office payment update is saved');
-- Website/edge functions (service role) can still record a Stripe payment.
select test.as_service();
update public.bookings set payment_status = 'Paid', payment_method = 'Card' where id = 'cccccccc-0000-0000-0000-0000000000b2';
select test.as_owner();
select test.ok((select payment_status = 'Paid' from public.bookings where id = 'cccccccc-0000-0000-0000-0000000000b2'),
  'service role (Stripe webhook) still records payment');
