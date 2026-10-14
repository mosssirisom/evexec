-- Per-operator logo and brand colours.
--
-- tenants.brand gains:
--   logo_url  public URL of the business's logo in the brand-assets bucket
--   colors    { "primary": "#0B132B", "accent": "#D7A23F" }  (header band, accent)
-- Read by the Operator app (sidebar, invoices) and the website (customer
-- invoice PDF). Written only through update_tenant_branding(): operator_admin
-- of that tenant or super_admin, with the URL and colours checked.
--
-- Logos are stored in a public bucket (no new billing: Supabase Storage is
-- already in use on this project), one folder per tenant:
--   brand-assets/<tenant_id>/logo-<time>.png
-- Only an admin of that tenant (or a super_admin) can add, replace or remove
-- files in its folder. PNG, JPEG or WebP only (no SVG, which can carry
-- script), 1 MB max.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brand-assets', 'brand-assets', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.can_brand_tenant_folder(p_folder text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid()
      and (tu.role = 'super_admin'
           or (tu.role = 'operator_admin' and tu.tenant_id::text = p_folder))
  );
$$;

revoke all on function private.can_brand_tenant_folder(text) from public, anon;
grant execute on function private.can_brand_tenant_folder(text) to authenticated;

create policy brand_assets_admin_read on storage.objects
  for select to authenticated
  using (bucket_id = 'brand-assets' and private.can_brand_tenant_folder((storage.foldername(name))[1]));

create policy brand_assets_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'brand-assets' and private.can_brand_tenant_folder((storage.foldername(name))[1]));

create policy brand_assets_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'brand-assets' and private.can_brand_tenant_folder((storage.foldername(name))[1]))
  with check (bucket_id = 'brand-assets' and private.can_brand_tenant_folder((storage.foldername(name))[1]));

create policy brand_assets_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'brand-assets' and private.can_brand_tenant_folder((storage.foldername(name))[1]));

create or replace function public.update_tenant_branding(
  p_tenant_id uuid,
  p_logo_url text,
  p_primary text,
  p_accent text
)
returns public.tenants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.tenants;
  v_logo text := nullif(btrim(coalesce(p_logo_url, '')), '');
  v_primary text := upper(nullif(btrim(coalesce(p_primary, '')), ''));
  v_accent text := upper(nullif(btrim(coalesce(p_accent, '')), ''));
begin
  if not exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid()
      and (tu.role = 'super_admin'
           or (tu.tenant_id = p_tenant_id and tu.role = 'operator_admin'))
  ) then
    raise exception 'Only an operator admin can change the logo and colours' using errcode = '42501';
  end if;

  -- The logo must be a file in this tenant's own brand-assets folder.
  if v_logo is not null and v_logo !~ ('^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/brand-assets/'
                                        || p_tenant_id::text || '/[A-Za-z0-9._-]{1,120}$') then
    raise exception 'Logo must be uploaded from Settings → Branding' using errcode = '22023';
  end if;
  if v_primary is not null and v_primary !~ '^#[0-9A-F]{6}$' then
    raise exception 'Main colour must be a hex colour like #0B132B' using errcode = '22023';
  end if;
  if v_accent is not null and v_accent !~ '^#[0-9A-F]{6}$' then
    raise exception 'Accent colour must be a hex colour like #D7A23F' using errcode = '22023';
  end if;

  update public.tenants t
     set brand = (coalesce(t.brand, '{}'::jsonb) - 'logo_url' - 'colors')
                 || case when v_logo is null then '{}'::jsonb else jsonb_build_object('logo_url', v_logo) end
                 || case when v_primary is null and v_accent is null then '{}'::jsonb
                         else jsonb_build_object('colors', jsonb_strip_nulls(jsonb_build_object('primary', v_primary, 'accent', v_accent))) end,
         updated_at = now()
   where t.id = p_tenant_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Unknown tenant' using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

revoke all on function public.update_tenant_branding(uuid, text, text, text) from public, anon;
grant execute on function public.update_tenant_branding(uuid, text, text, text) to authenticated;
