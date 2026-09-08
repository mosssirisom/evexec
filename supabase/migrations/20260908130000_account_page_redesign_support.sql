-- Support for the My Account redesign: real payment-method management
-- (Stripe Customer + saved cards) and per-customer notification channel
-- preferences (previously push_enabled existed but had no UI; email/sms
-- preference didn't exist at all).
alter table public.profiles
  add column if not exists stripe_customer_id text,
  add column if not exists notify_email boolean not null default true,
  add column if not exists notify_sms boolean not null default true;

-- Avatar storage: public-read (profile photos are low-sensitivity and need
-- to be directly displayable without signed URLs), but only the owning user
-- may write to their own folder (path must start with their auth.uid()).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy avatars_public_read on storage.objects
  for select to public
  using (bucket_id = 'avatars');

create policy avatars_owner_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy avatars_owner_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy avatars_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
