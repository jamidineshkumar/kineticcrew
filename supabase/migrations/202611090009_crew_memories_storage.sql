-- Kinetic Crew shared memories media storage.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('crew-memories','crew-memories',true,41943040,array['image/jpeg','image/png','image/webp','video/mp4','video/webm'])
on conflict (id) do update set public=true,file_size_limit=41943040,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "Crew members can upload their own memories" on storage.objects;
create policy "Crew members can upload their own memories" on storage.objects for insert to authenticated
with check (bucket_id='crew-memories' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "Crew members can update their own memories" on storage.objects;
create policy "Crew members can update their own memories" on storage.objects for update to authenticated
using (bucket_id='crew-memories' and (storage.foldername(name))[1]=auth.uid()::text)
with check (bucket_id='crew-memories' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "Crew members can delete their own memories" on storage.objects;
create policy "Crew members can delete their own memories" on storage.objects for delete to authenticated
using (bucket_id='crew-memories' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "Anyone can view crew memories" on storage.objects;
create policy "Anyone can view crew memories" on storage.objects for select to public
using (bucket_id='crew-memories');
