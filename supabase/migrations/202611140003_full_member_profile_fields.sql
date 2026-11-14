-- Expose the extended member identity in the crew directory while preserving approval and block checks.
create or replace function public.crew_profile_directory()
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_people jsonb;
begin
 perform public.crew_assert_not_blocked();
 if auth.uid() is null then raise exception 'Please sign in first.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'auth_id',p.auth_id,'name',p.name,'username',p.username,'role',p.role,
  'crew_title',p.crew_title,'bio',p.bio,'avatar_url',p.avatar_url,'banner_url',p.banner_url,
  'profession',p.profession,'designation',p.designation,'instagram_username',p.instagram_username,
  'followers_count',(select count(*)::int from public.crew_profile_follows f where f.followed_id=p.auth_id),
  'is_following',case when p.auth_id=auth.uid()::text then false else exists(
    select 1 from public.crew_profile_follows f where f.follower_id=auth.uid()::text and f.followed_id=p.auth_id
  ) end
 ) order by (p.role='super_admin') desc,(p.role='admin') desc,p.name),'[]'::jsonb)
 into v_people from public.crew_profiles p where p.approval_status='approved';
 return v_people;
end $$;
revoke all on function public.crew_profile_directory() from public,anon;
grant execute on function public.crew_profile_directory() to authenticated;
notify pgrst,'reload schema';
