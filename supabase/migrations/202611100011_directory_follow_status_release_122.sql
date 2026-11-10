create or replace function public.crew_profile_directory()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,auth
as $$
declare v_people jsonb;
begin
 if auth.uid() is null then raise exception 'Please sign in first.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'auth_id',p.auth_id,
   'name',p.name,
   'username',p.username,
   'role',p.role,
   'bio',p.bio,
   'avatar_url',p.avatar_url,
   'banner_url',p.banner_url,
   'followers_count',(select count(*)::int from public.crew_profile_follows f where f.followed_id=p.auth_id),
   'is_following',case when p.auth_id=auth.uid()::text then false else exists(
      select 1 from public.crew_profile_follows f where f.follower_id=auth.uid()::text and f.followed_id=p.auth_id
   ) end
 ) order by (p.role='super_admin') desc,(p.role='admin') desc,p.name),'[]'::jsonb)
 into v_people from public.crew_profiles p;
 return v_people;
end $$;
revoke all on function public.crew_profile_directory() from public,anon;
grant execute on function public.crew_profile_directory() to authenticated;
update public.crew_app_settings set setting_value='"1.2.2"'::jsonb,updated_at=now()
where setting_key='latest_version';
notify pgrst,'reload schema';