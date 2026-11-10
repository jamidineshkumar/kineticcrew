-- Kinetic Crew settings and update permissions.
-- Username edits are validated and unique case-insensitively.
drop function if exists public.crew_update_profile(text,text,text,text);
create or replace function public.crew_update_profile(
 p_name text,p_username text,p_bio text,p_avatar_url text,p_banner_url text
) returns jsonb
language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare v_uid text;v_name text;v_username text;
begin
 if auth.uid() is null then raise exception 'Please sign in first.'; end if;
 v_uid:=auth.uid()::text;
 v_name:=left(trim(coalesce(p_name,'')),100);
 v_username:=lower(trim(coalesce(p_username,'')));
 if v_name='' then raise exception 'Enter your full name.'; end if;
 if v_username !~ '^[a-z0-9_]{3,24}$' then
   raise exception 'Username must be 3–24 characters using letters, numbers or underscores.';
 end if;
 if exists(select 1 from public.crew_profiles where lower(username)=v_username and auth_id<>v_uid) then
   raise exception 'That username is already taken. Choose another one.';
 end if;
 update public.crew_profiles
 set name=v_name,username=v_username,bio=left(coalesce(p_bio,''),500),
     avatar_url=case when p_avatar_url is null then avatar_url else p_avatar_url end,
     banner_url=case when p_banner_url is null then banner_url else p_banner_url end
 where auth_id=v_uid;
 if not found then raise exception 'Crew profile not found.'; end if;
 return (select jsonb_build_object('auth_id',auth_id,'name',name,'email',email,'role',role,
   'username',username,'bio',bio,'avatar_url',avatar_url,'banner_url',banner_url)
   from public.crew_profiles where auth_id=v_uid);
end $$;
revoke all on function public.crew_update_profile(text,text,text,text,text) from public,anon;
grant execute on function public.crew_update_profile(text,text,text,text,text) to authenticated;

-- Only the Super Admin can remove a published crew update.
create or replace function public.crew_delete_announcement(p_announcement_id uuid)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare v_role text;
begin
 if auth.uid() is null then raise exception 'Please sign in first.'; end if;
 select role into v_role from public.crew_profiles where auth_id=auth.uid()::text;
 if coalesce(v_role,'')<>'super_admin' then
   raise exception 'Only the Super Admin can delete crew updates.';
 end if;
 delete from public.crew_announcements where id=p_announcement_id;
 if not found then raise exception 'Crew update not found.'; end if;
 return jsonb_build_object('message','Crew update deleted.');
end $$;
revoke all on function public.crew_delete_announcement(uuid) from public,anon;
grant execute on function public.crew_delete_announcement(uuid) to authenticated;
notify pgrst,'reload schema';

-- Ensure the image bucket and owner-only upload policies exist for profile and banner crops.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('crew-avatars','crew-avatars',true,8388608,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=8388608,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
drop policy if exists "Crew avatar images are public" on storage.objects;
create policy "Crew avatar images are public" on storage.objects for select using(bucket_id='crew-avatars');
drop policy if exists "Members upload own crew avatar" on storage.objects;
create policy "Members upload own crew avatar" on storage.objects for insert to authenticated with check(bucket_id='crew-avatars' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "Members update own crew avatar" on storage.objects;
create policy "Members update own crew avatar" on storage.objects for update to authenticated using(bucket_id='crew-avatars' and (storage.foldername(name))[1]=auth.uid()::text) with check(bucket_id='crew-avatars' and (storage.foldername(name))[1]=auth.uid()::text);
