-- Persist the full editable member profile and expose the fields to directory/profile RPCs.
alter table public.crew_profiles
 add column if not exists date_of_birth date,
 add column if not exists instagram_username text not null default '',
 add column if not exists profession text not null default '',
 add column if not exists designation text not null default '';

create or replace function public.crew_update_profile(
 p_name text,
 p_username text,
 p_bio text,
 p_avatar_url text,
 p_banner_url text,
 p_date_of_birth date,
 p_instagram_username text,
 p_profession text,
 p_designation text
) returns jsonb
language plpgsql security definer
set search_path=pg_catalog,public,auth as $$
declare v_uid text; v_name text; v_username text; v_instagram text;
begin
 if auth.uid() is null then raise exception 'Please sign in first.'; end if;
 v_uid:=auth.uid()::text;
 v_name:=left(trim(coalesce(p_name,'')),100);
 v_username:=lower(trim(coalesce(p_username,'')));
 v_instagram:=regexp_replace(trim(coalesce(p_instagram_username,'')),'^@','');
 if v_name='' then raise exception 'Enter your full name.'; end if;
 if v_username !~ '^[a-z0-9_]{3,24}$' then raise exception 'Username must be 3–24 characters using letters, numbers or underscores.'; end if;
 if v_instagram !~ '^[A-Za-z0-9._]{1,30}$' then raise exception 'Enter a valid Instagram username.'; end if;
 if p_date_of_birth is null or p_date_of_birth>current_date then raise exception 'Enter a valid date of birth.'; end if;
 if length(trim(coalesce(p_profession,'')))=0 or length(trim(coalesce(p_designation,'')))=0 then raise exception 'Enter your profession and designation.'; end if;
 if exists(select 1 from public.crew_profiles where lower(username)=v_username and auth_id<>v_uid) then raise exception 'That username is already taken. Choose another.'; end if;
 update public.crew_profiles set
  name=v_name, username=v_username, bio=left(coalesce(p_bio,''),500),
  avatar_url=coalesce(p_avatar_url,avatar_url), banner_url=coalesce(p_banner_url,banner_url),
  date_of_birth=p_date_of_birth, instagram_username=v_instagram,
  profession=left(trim(p_profession),100), designation=left(trim(p_designation),100)
 where auth_id=v_uid;
 if not found then raise exception 'Crew profile not found.'; end if;
 return (select jsonb_build_object(
  'auth_id',auth_id,'name',name,'email',email,'role',role,'username',username,
  'bio',bio,'avatar_url',avatar_url,'banner_url',banner_url,
  'date_of_birth',date_of_birth,'instagram_username',instagram_username,
  'profession',profession,'designation',designation
 ) from public.crew_profiles where auth_id=v_uid);
end $$;
revoke all on function public.crew_update_profile(text,text,text,text,text,date,text,text,text) from public,anon;
grant execute on function public.crew_update_profile(text,text,text,text,text,date,text,text,text) to authenticated;

create or replace function public.crew_profile_social(p_auth_id text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_uid text;v_target text;v_profile jsonb;v_fc int;v_gc int;v_is_following boolean;
begin
 if auth.uid() is null then raise exception 'Please sign in first.'; end if;
 v_uid:=auth.uid()::text;v_target:=coalesce(nullif(p_auth_id,''),v_uid);
 select jsonb_build_object(
  'auth_id',p.auth_id,'name',p.name,'email',case when p.auth_id=v_uid then p.email else null end,
  'role',p.role,'username',p.username,'bio',p.bio,'avatar_url',p.avatar_url,'banner_url',p.banner_url,
  'date_of_birth',p.date_of_birth,'instagram_username',p.instagram_username,
  'profession',p.profession,'designation',p.designation
 ) into v_profile from public.crew_profiles p where p.auth_id=v_target;
 if v_profile is null then raise exception 'Crew profile not found.'; end if;
 select count(*)::int into v_fc from public.crew_profile_follows where followed_id=v_target;
 select count(*)::int into v_gc from public.crew_profile_follows where follower_id=v_target;
 select exists(select 1 from public.crew_profile_follows where follower_id=v_uid and followed_id=v_target) into v_is_following;
 return jsonb_build_object('profile',v_profile,'followers_count',v_fc,'following_count',v_gc,'is_following',v_is_following);
end $$;
revoke all on function public.crew_profile_social(text) from public,anon;
grant execute on function public.crew_profile_social(text) to authenticated;

create or replace function public.crew_profile_directory()
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_people jsonb;
begin
 if auth.uid() is null then raise exception 'Please sign in first.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'auth_id',p.auth_id,'name',p.name,'username',p.username,'role',p.role,'bio',p.bio,
  'avatar_url',p.avatar_url,'banner_url',p.banner_url,'profession',p.profession,
  'designation',p.designation,'instagram_username',p.instagram_username,
  'followers_count',(select count(*)::int from public.crew_profile_follows f where f.followed_id=p.auth_id)
 ) order by (p.role='super_admin') desc,p.name),'[]'::jsonb) into v_people from public.crew_profiles p;
 return v_people;
end $$;
revoke all on function public.crew_profile_directory() from public,anon;
grant execute on function public.crew_profile_directory() to authenticated;
notify pgrst,'reload schema';
