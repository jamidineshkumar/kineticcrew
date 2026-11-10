-- Secure member-only wardrobe reads with signed URLs and database-owned role checks.
create or replace function public.crew_wardrobe_is_member() returns boolean
language sql stable security definer set search_path=pg_catalog,public,auth as $$
  select auth.uid() is not null and exists(select 1 from public.crew_profiles p where p.auth_id=auth.uid()::text);
$$;
create or replace function public.crew_wardrobe_is_admin() returns boolean
language sql stable security definer set search_path=pg_catalog,public,auth as $$
  select auth.uid() is not null and exists(select 1 from public.crew_profiles p where p.auth_id=auth.uid()::text and p.role in ('admin','super_admin'));
$$;
revoke all on function public.crew_wardrobe_is_member() from public,anon;
revoke all on function public.crew_wardrobe_is_admin() from public,anon;
grant execute on function public.crew_wardrobe_is_member() to authenticated;
grant execute on function public.crew_wardrobe_is_admin() to authenticated;

drop policy if exists "Crew members view wardrobe" on public.crew_wardrobe_items;
create policy "Crew members view wardrobe" on public.crew_wardrobe_items for select to authenticated
using (public.crew_wardrobe_is_member());
drop policy if exists "Crew admins publish wardrobe" on public.crew_wardrobe_items;
create policy "Crew admins publish wardrobe" on public.crew_wardrobe_items for insert to authenticated
with check (created_by=auth.uid()::text and public.crew_wardrobe_is_admin());
drop policy if exists "Crew admins update wardrobe" on public.crew_wardrobe_items;
create policy "Crew admins update wardrobe" on public.crew_wardrobe_items for update to authenticated
using (public.crew_wardrobe_is_admin())
with check (public.crew_wardrobe_is_admin());
drop policy if exists "Crew admins delete wardrobe" on public.crew_wardrobe_items;
create policy "Crew admins delete wardrobe" on public.crew_wardrobe_items for delete to authenticated
using (public.crew_wardrobe_is_admin());

update storage.buckets set public=false,file_size_limit=41943040,
allowed_mime_types=array['image/png','image/jpeg','image/webp','model/gltf-binary','application/octet-stream']
where id='crew-wardrobe';
drop policy if exists "Crew members view wardrobe media" on storage.objects;
create policy "Crew members view wardrobe media" on storage.objects for select to authenticated
using(bucket_id='crew-wardrobe' and public.crew_wardrobe_is_member());
drop policy if exists "Crew admins upload wardrobe media" on storage.objects;
create policy "Crew admins upload wardrobe media" on storage.objects for insert to authenticated
with check(bucket_id='crew-wardrobe' and (storage.foldername(name))[1]='wardrobe' and public.crew_wardrobe_is_admin());
drop policy if exists "Crew admins update wardrobe media" on storage.objects;
create policy "Crew admins update wardrobe media" on storage.objects for update to authenticated
using(bucket_id='crew-wardrobe' and (storage.foldername(name))[1]='wardrobe' and public.crew_wardrobe_is_admin())
with check(bucket_id='crew-wardrobe' and (storage.foldername(name))[1]='wardrobe' and public.crew_wardrobe_is_admin());
notify pgrst,'reload schema';
