-- Drivers vs trusted third-party operators ("partners"), 15/10/2026.
--
-- kind = 'driver'  : uses the Driver App. The Operator app emails them an
--                    invite to set a password (drivers.id = their auth user id).
-- kind = 'partner' : a trusted outside operator the business passes jobs to.
--                    No app login and no invite. They still get the job
--                    emails; customer texts for their jobs go to the office
--                    (Operator app, Today → Texts to send) instead of the
--                    Driver App.

alter table public.drivers
  add column if not exists kind text not null default 'driver';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'drivers_kind_check') then
    alter table public.drivers
      add constraint drivers_kind_check check (kind in ('driver', 'partner'));
  end if;
end $$;

comment on column public.drivers.kind is
  'driver = Driver App user (invited by email); partner = trusted third-party operator, no app login; their customer texts go to the office.';

-- James Addy (Crestways Travel) and Marks Taxi are outside operators, not
-- EV Exec drivers (user, 15/10/2026).
update public.drivers set kind = 'partner'
 where id in ('186b94e9-3744-4c29-89f7-aa5204212040', 'cb4dbaea-ce58-4606-8847-26d317ad028f');

-- The office sends partner jobs' customer texts, so staff need to mark the
-- handoff as sent (they could already read it: staff_select_sms_reminders).
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'driver_sms_reminders' and policyname = 'staff_update_sms_reminders') then
    create policy staff_update_sms_reminders on public.driver_sms_reminders
      for update using (private.staff_for_tenant(tenant_id)) with check (private.staff_for_tenant(tenant_id));
  end if;
end $$;
