-- Kinetic Crew profile photos, bios and admin profile management.
alter table public.crew_profiles add column if not exists bio text not null default '';
alter table public.crew_profiles add column if not exists avatar_url text;
create or replace function public.crew_update_profile(p_name text,p_bio text default '',p_avatar_url text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_uid text; v_name text;
begin
 if auth.uid() is null then raise exception 'Please sign in first.'; end if;
 v_uid:=auth.uid()::text;v_name:=left(trim(coalesce(p_name,'')),100);
 if v_name='' then raise exception 'Enter your full name.'; end if;
 update public.crew_profiles set name=v_name,bio=left(coalesce(p_bio,''),500),avatar_url=case when p_avatar_url is null then avatar_url else p_avatar_url end where auth_id=v_uid;
 if not found then raise exception 'Crew profile not found.'; end if;
 return (select jsonb_build_object('name',name,'bio',bio,'avatar_url',avatar_url) from public.crew_profiles where auth_id=v_uid);
end $$;
revoke all on function public.crew_update_profile(text,text,text) from public,anon;
grant execute on function public.crew_update_profile(text,text,text) to authenticated;
create or replace function public.crew_manage_profile(p_auth_id text,p_name text,p_bio text default '')
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_role text;v_uid text;
begin
 v_uid:=auth.uid()::text;
 select role into v_role from public.crew_profiles where auth_id=v_uid;
 if v_role not in ('admin','super_admin') then raise exception 'Admin access required.'; end if;
 update public.crew_profiles set name=left(trim(p_name),100),bio=left(coalesce(p_bio,''),500) where auth_id=p_auth_id;
 if not found then raise exception 'Crew member not found.'; end if;
 return (select jsonb_build_object('auth_id',auth_id,'name',name,'bio',bio) from public.crew_profiles where auth_id=p_auth_id);
end $$;
revoke all on function public.crew_manage_profile(text,text,text) from public,anon;
grant execute on function public.crew_manage_profile(text,text,text) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('crew-avatars','crew-avatars',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
drop policy if exists "Crew avatar images are public" on storage.objects;
create policy "Crew avatar images are public" on storage.objects for select using(bucket_id='crew-avatars');
drop policy if exists "Members upload own crew avatar" on storage.objects;
create policy "Members upload own crew avatar" on storage.objects for insert to authenticated with check(bucket_id='crew-avatars' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "Members update own crew avatar" on storage.objects;
create policy "Members update own crew avatar" on storage.objects for update to authenticated using(bucket_id='crew-avatars' and (storage.foldername(name))[1]=auth.uid()::text) with check(bucket_id='crew-avatars' and (storage.foldername(name))[1]=auth.uid()::text);
notify pgrst,'reload schema';
