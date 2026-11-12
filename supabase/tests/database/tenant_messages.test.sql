-- Messages built inside the database name the booking's own business (draft
-- migration supabase/pending/20261112090000_tenant_aware_messages.sql).
--
-- Three businesses: EV Exec (details as on live), Coastal Cars (everything set)
-- and Bare Business (name only). Each gets a driver and an operator-made booking
-- that is run through Dispatched, En Route, Arrived and Cancelled, with one more
-- booking that has an email address. Checks that no other business ever sees
-- EV Exec's name, number, address or licence, that EV Exec's texts read exactly as
-- before, and that the server-only helpers stay server-only.
-- Runs in one transaction and rolls back; creates its own fixtures.

begin;

create extension if not exists pgtap with schema extensions;

select * from no_plan();

-- ─── Fixtures ────────────────────────────────────────────────────────────────

-- EV Exec as it is on live (11/11/2026).
update public.tenants
set contact_email = 'book@evexec.co.uk', contact_phone = '07721070370',
    brand = jsonb_build_object('licence', 'PHO0079', 'site_url', 'https://www.evexec.co.uk',
                               'tagline', 'Premium airport transfers from Blackpool & the Fylde Coast')
where id = '00000000-0000-0000-0000-000000000001';

insert into public.tenants (id, slug, name, contact_email, contact_phone, brand) values
  ('cccccccc-0000-4000-8000-000000000002', 'msg-test-coastal', 'Coastal Cars', 'hello@coastal.test', '+44 7123 456789',
   '{"licence":"PHO1234","site_url":"https://coastal.test/","tagline":"Airport transfers from Southport"}'),
  ('cccccccc-0000-4000-8000-000000000003', 'msg-test-bare', 'Bare Business', null, null, '{}');

insert into public.drivers (id, name, email, tenant_id) values
  ('cccccccc-0000-4000-8000-0000000000d1', 'Dee One', 'd1@msg-test.invalid', '00000000-0000-0000-0000-000000000001'),
  ('cccccccc-0000-4000-8000-0000000000d2', 'Dee Two', 'd2@msg-test.invalid', 'cccccccc-0000-4000-8000-000000000002'),
  ('cccccccc-0000-4000-8000-0000000000d3', 'Dee Three', 'd3@msg-test.invalid', 'cccccccc-0000-4000-8000-000000000003');

-- One operator-made booking per business with a driver and no email (texts), plus a
-- second per business with an email (emails). Far enough ahead for the 24 h reminder.
insert into public.bookings (id, tenant_id, ref, customer_name, customer_phone, customer_email, travel_date, travel_time,
                             status, payment_status, source, assigned_driver_id, pickup_location, dropoff_address, quoted_price)
select b.id::uuid, b.tenant::uuid, b.ref, 'Jo Customer', '07000000001', b.email, current_date + 10, '09:00',
       'Dispatched', 'Unpaid', 'operator', b.driver::uuid, '1 Test Street, Southport', 'Liverpool Airport', 90
from (values
  ('cccccccc-0000-4000-8000-00000000b101', '00000000-0000-0000-0000-000000000001', 'EVX-MSGEV1', null,            'cccccccc-0000-4000-8000-0000000000d1'),
  ('cccccccc-0000-4000-8000-00000000b102', '00000000-0000-0000-0000-000000000001', 'EVX-MSGEV2', 'jo@msg-test.invalid', 'cccccccc-0000-4000-8000-0000000000d1'),
  ('cccccccc-0000-4000-8000-00000000b201', 'cccccccc-0000-4000-8000-000000000002', 'EVX-MSGCO1', null,            'cccccccc-0000-4000-8000-0000000000d2'),
  ('cccccccc-0000-4000-8000-00000000b202', 'cccccccc-0000-4000-8000-000000000002', 'EVX-MSGCO2', 'jo@msg-test.invalid', 'cccccccc-0000-4000-8000-0000000000d2'),
  ('cccccccc-0000-4000-8000-00000000b301', 'cccccccc-0000-4000-8000-000000000003', 'EVX-MSGBA1', null,            'cccccccc-0000-4000-8000-0000000000d3'),
  ('cccccccc-0000-4000-8000-00000000b302', 'cccccccc-0000-4000-8000-000000000003', 'EVX-MSGBA2', 'jo@msg-test.invalid', 'cccccccc-0000-4000-8000-0000000000d3')
) as b(id, tenant, ref, email, driver);

update public.bookings set status = 'En Route'  where ref like 'EVX-MSG%';
update public.bookings set status = 'Arrived'   where ref like 'EVX-MSG%';
update public.bookings set status = 'Cancelled' where ref like 'EVX-MSG%';

-- Everything the database wrote for these bookings, as one searchable text per row.
create temp table msg as
  select t.tenant_id, 'queue'::text as src, q.type as kind, q.channel,
         coalesce(q.subject, '') as subject, coalesce(q.body, '') as body, to_jsonb(q)::text as whole,
         coalesce(q.subject, '') || ' ' || coalesce(q.body, '') || ' ' || coalesce(q.html, '') as content
  from public.notification_queue q join public.bookings t on t.id = q.booking_id where t.ref like 'EVX-MSG%'
  union all
  select s.tenant_id, 'task', s.kind, 'sms', '', s.message, to_jsonb(s)::text, s.message
  from public.operator_sms_tasks s join public.bookings t on t.id = s.booking_id where t.ref like 'EVX-MSG%';

grant select on msg to public;

-- ─── Nothing of EV Exec's reaches another business ──────────────────────────

select ok((select count(*) from msg where tenant_id = 'cccccccc-0000-4000-8000-000000000002') >= 6,
  'Coastal Cars got its notifications (queue rows and text tasks)');
select is_empty(
  $$ select src || ' ' || kind from msg
     where tenant_id in ('cccccccc-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000003')
       and whole ~* 'ev exec|evexec|07721|070370|PHO0079' $$,
  'no message for another business mentions EV Exec, its number, address or licence'
);
select is_empty(
  $$ select src || ' ' || kind from msg where content ~* 'undefined|null|\{\}' $$,
  'no message shows a blank placeholder'
);
select ok(exists (select 1 from msg where tenant_id = 'cccccccc-0000-4000-8000-000000000002' and src = 'task' and body like 'Coastal Cars: Hi Jo Customer,%'),
  'Coastal Cars confirmation text opens with its own name');
select ok(exists (select 1 from msg where tenant_id = 'cccccccc-0000-4000-8000-000000000002' and kind = 'driver_allocated' and body like 'Coastal Cars NEW JOB %'),
  'Coastal Cars driver job text names its own business');
select ok(exists (select 1 from msg where tenant_id = 'cccccccc-0000-4000-8000-000000000002' and kind = 'received' and subject = 'Your Coastal Cars airport transfer is booked (Ref EVX-MSGCO2)'),
  'Coastal Cars confirmation email subject names its own business');
select ok(exists (select 1 from msg where tenant_id = 'cccccccc-0000-4000-8000-000000000002' and kind = 'received'
                  and whole like '%07123 456789%' and whole like '%PHO1234%' and whole like '%coastal.test%' and whole like '%Airport transfers from Southport%'),
  'Coastal Cars emails carry its own number, licence, web address and tagline');
select ok(exists (select 1 from msg where tenant_id = 'cccccccc-0000-4000-8000-000000000003' and src = 'task' and body like 'Bare Business: Hi Jo Customer,%'),
  'a business with only a name gets its own name, nothing else filled in');
select is_empty(
  $$ select kind from msg where tenant_id = 'cccccccc-0000-4000-8000-000000000003' and whole ~* 'Questions\?|tel:|licence' $$,
  'a business with no phone or licence has them left out, not filled in');

-- ─── EV Exec reads exactly as before ────────────────────────────────────────

select is((select body from msg where kind = 'confirmation' and tenant_id = '00000000-0000-0000-0000-000000000001'),
  'EV Exec: Hi Jo Customer, your airport transfer (' || to_char(current_date + 10, 'DD/MM/YYYY') || ' 09:00) is booked. Ref EVX-MSGEV1.',
  'EV Exec confirmation text is unchanged');
select is((select body from msg where kind = 'cancellation' and tenant_id = '00000000-0000-0000-0000-000000000001'),
  'EV Exec: your booking EVX-MSGEV1 has been cancelled. Please contact us if this is unexpected.',
  'EV Exec cancellation text is unchanged');
select is((select subject from msg where kind = 'received' and tenant_id = '00000000-0000-0000-0000-000000000001'),
  'Your EV Exec airport transfer is booked (Ref EVX-MSGEV2)',
  'EV Exec confirmation email subject is unchanged');
select is((select subject from msg where kind = 'status_update' and tenant_id = '00000000-0000-0000-0000-000000000001' and body like '%on the way%'),
  'Update on your EV Exec transfer (Ref EVX-MSGEV2)',
  'EV Exec status email subject is unchanged');
select ok(exists (select 1 from msg where kind = 'driver_allocated' and tenant_id = '00000000-0000-0000-0000-000000000001' and body like 'EV Exec NEW JOB EVX-MSGEV1:%'),
  'EV Exec driver job text is unchanged');
select ok(exists (select 1 from msg where kind = 'driver_reminder_24h' and tenant_id = '00000000-0000-0000-0000-000000000001' and body like 'EV Exec REMINDER: Job EVX-MSGEV1 tomorrow at 09:00:%'),
  'EV Exec driver reminder text is unchanged');
select ok(exists (select 1 from msg where kind = 'received' and tenant_id = '00000000-0000-0000-0000-000000000001'
                  and whole like '%EV EXEC%' and whole like '%07721 070370%' and whole like '%PHO0079%' and whole like '%book@evexec.co.uk%' and whole like '%Questions? Call or WhatsApp 07721 070370.%'),
  'EV Exec emails still carry its name, number, licence and help line');

-- ─── The helpers ────────────────────────────────────────────────────────────

select is(public.tenant_brand('cccccccc-0000-4000-8000-000000000002')->>'phone', '07123 456789', 'phone numbers read the house way (+44 form)');
select is(public.tenant_brand('00000000-0000-0000-0000-000000000001')->>'phone', '07721 070370', 'EV Exec''s number reads 07721 070370');
select is(public.tenant_brand('cccccccc-0000-4000-8000-000000000002')->>'domain', 'coastal.test', 'web address without scheme or trailing slash');
select is(public.tenant_brand('cccccccc-0000-4000-8000-000000000003')->>'phone', '', 'a business with no phone has none');
select is(public.tenant_brand('ffffffff-0000-4000-8000-0000000000ff')->>'name', '', 'an unknown business gets blank details, not EV Exec''s');
select is(public.tenant_brand(null)->>'name', 'EV Exec', 'no business means the default business (EV Exec)');
select ok(not has_function_privilege('anon', 'public.tenant_brand(uuid)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.tenant_brand(uuid)', 'EXECUTE')
      and has_function_privilege('service_role', 'public.tenant_brand(uuid)', 'EXECUTE'),
  'tenant_brand is for the servers only');
select ok(not has_function_privilege('anon', 'public.tenant_notification_email(uuid,text,text,text,text,jsonb,text)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.tenant_notification_email(uuid,text,text,text,text,jsonb,text)', 'EXECUTE'),
  'the per-business email shell is for the servers only');
select ok(public.evexec_notification_email('P', '#fff', '#000', 'Lead', '[{"label":"A","value":"B"}]'::jsonb, 'Foot') like '%EV EXEC%',
  'the old email shell name still works for the default business');

select * from finish();
rollback;
