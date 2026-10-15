-- Fix 4: completing a job never marks it Paid; Paid/Invoiced stay untouched.
-- d01 is assigned b1 (Unpaid), b3 (Invoiced, On Board) and b4 (Paid, On Board).
select test.as_owner();
update public.bookings set status = 'En Route' where id = 'cccccccc-0000-0000-0000-0000000000b1';
update public.bookings set status = 'Passenger On Board' where id = 'cccccccc-0000-0000-0000-0000000000b1';

select test.login('bbbbbbbb-0000-0000-0000-000000000d01', 'dr1@example.com');

-- What the current (unfixed) Driver App sends for Card: refused, so this
-- migration must go live only after the fixed Driver App.
select test.throws($$update public.bookings set status = 'Completed', completed_at = now(), payment_method = 'Card', payment_status = 'Paid' where id = 'cccccccc-0000-0000-0000-0000000000b1'$$,
  'driver cannot mark a job Paid at completion');

-- Fixed Driver App, unpaid job: records the method, payment stays Unpaid.
select test.lives($$update public.bookings set status = 'Completed', completed_at = now(), updated_at = now(), payment_method = 'Card' where id = 'cccccccc-0000-0000-0000-0000000000b1'$$,
  'driver completes an unpaid job and records Card');
select test.as_owner();
select test.ok((select payment_status = 'Unpaid' and payment_method = 'Card' and status = 'Completed' from public.bookings where id = 'cccccccc-0000-0000-0000-0000000000b1'),
  'unpaid job stays Unpaid with method Card until the office confirms');

-- Invoiced account job.
select test.login('bbbbbbbb-0000-0000-0000-000000000d01', 'dr1@example.com');
select test.throws($$update public.bookings set payment_method = 'Cash' where id = 'cccccccc-0000-0000-0000-0000000000b3'$$,
  'driver cannot change the method on an invoiced job');
select test.lives($$update public.bookings set status = 'Completed', completed_at = now() where id = 'cccccccc-0000-0000-0000-0000000000b3'$$,
  'driver completes an invoiced job (nothing to collect)');

-- Prepaid job.
select test.throws($$update public.bookings set payment_method = 'Cash' where id = 'cccccccc-0000-0000-0000-0000000000b4'$$,
  'driver cannot replace the card payment on a prepaid job');
select test.lives($$update public.bookings set status = 'Completed', completed_at = now() where id = 'cccccccc-0000-0000-0000-0000000000b4'$$,
  'driver completes a prepaid job');

select test.as_owner();
select test.ok((select payment_status = 'Invoiced' and payment_method = 'Bank Transfer' from public.bookings where id = 'cccccccc-0000-0000-0000-0000000000b3'),
  'invoiced job keeps Invoiced and its method');
select test.ok((select payment_status = 'Paid' and payment_method = 'Card' from public.bookings where id = 'cccccccc-0000-0000-0000-0000000000b4'),
  'prepaid job keeps Paid and Card');

-- The office can still record payment.
select test.login('aaaaaaaa-0000-0000-0000-0000000000a1', 'admin@example.com');
select test.lives($$update public.bookings set payment_status = 'Paid' where id = 'cccccccc-0000-0000-0000-0000000000b1'$$,
  'office marks the card-machine job Paid once it clears');
