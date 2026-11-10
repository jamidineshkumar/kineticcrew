-- Kinetic Crew wardrobe, published 3D model support and secure admin uploads.
insert into public.crew_app_settings(setting_key,setting_value,updated_at)
values('latest_version','"1.2.0"'::jsonb,now())
on conflict(setting_key) do update set setting_value=excluded.setting_value,updated_at=now();
create table if not exists public.crew_wardrobe_items (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  category text not null default 'Wardrobe' check (char_length(category) <= 60),
  description text not null default '' check (char_length(description) <= 500),
  image_url text not null,
  model_url text,
  created_by text not null references public.crew_profiles(auth_id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crew_wardrobe_items_created_idx on public.crew_wardrobe_items(created_at desc);
alter table public.crew_wardrobe_items enable row level security;
revoke all on public.crew_wardrobe_items from public, anon, authenticated;
drop policy if exists "Crew members view wardrobe" on public.crew_wardrobe_items;
create policy "Crew members view wardrobe" on public.crew_wardrobe_items for select to authenticated
using (exists(select 1 from public.crew_profiles p where p.auth_id=auth.uid()::text));
drop policy if exists "Crew admins publish wardrobe" on public.crew_wardrobe_items;
create policy "Crew admins publish wardrobe" on public.crew_wardrobe_items for insert to authenticated
with check (created_by=auth.uid()::text and exists(select 1 from public.crew_profiles p where p.auth_id=auth.uid()::text and p.role in ('admin','super_admin')));
drop policy if exists "Crew admins update wardrobe" on public.crew_wardrobe_items;
create policy "Crew admins update wardrobe" on public.crew_wardrobe_items for update to authenticated
using (exists(select 1 from public.crew_profiles p where p.auth_id=auth.uid()::text and p.role in ('admin','super_admin')))
with check (exists(select 1 from public.crew_profiles p where p.auth_id=auth.uid()::text and p.role in ('admin','super_admin')));
drop policy if exists "Crew admins delete wardrobe" on public.crew_wardrobe_items;
create policy "Crew admins delete wardrobe" on public.crew_wardrobe_items for delete to authenticated
using (exists(select 1 from public.crew_profiles p where p.auth_id=auth.uid()::text and p.role in ('admin','super_admin')));
grant select,insert,update,delete on public.crew_wardrobe_items to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('crew-wardrobe','crew-wardrobe',true,41943040,array['image/png','image/jpeg','image/webp','model/gltf-binary','application/octet-stream'])
on conflict(id) do update set public=true,file_size_limit=41943040,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "Crew members view wardrobe media" on storage.objects;
create policy "Crew members view wardrobe media" on storage.objects for select to authenticated using(bucket_id='crew-wardrobe');
drop policy if exists "Crew admins upload wardrobe media" on storage.objects;
create policy "Crew admins upload wardrobe media" on storage.objects for insert to authenticated
with check(bucket_id='crew-wardrobe' and (storage.foldername(name))[1]='wardrobe' and exists(select 1 from public.crew_profiles p where p.auth_id=auth.uid()::text and p.role in ('admin','super_admin')));
drop policy if exists "Crew admins update wardrobe media" on storage.objects;
create policy "Crew admins update wardrobe media" on storage.objects for update to authenticated
using(bucket_id='crew-wardrobe' and (storage.foldername(name))[1]='wardrobe' and exists(select 1 from public.crew_profiles p where p.auth_id=auth.uid()::text and p.role in ('admin','super_admin')))
with check(bucket_id='crew-wardrobe' and (storage.foldername(name))[1]='wardrobe' and exists(select 1 from public.crew_profiles p where p.auth_id=auth.uid()::text and p.role in ('admin','super_admin')));
notify pgrst,'reload schema';
