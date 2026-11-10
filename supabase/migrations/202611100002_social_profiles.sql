-- Kinetic Crew social profiles: banners, public member directory and follow graph.
alter table public.crew_profiles add column if not exists banner_url text;
drop function if exists public.crew_update_profile(text,text,text);
create or replace function public.crew_update_profile(p_name text,p_bio text,p_avatar_url text,p_banner_url text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_uid text;v_name text;
begin
 if auth.uid() is null then raise exception 'Please sign in first.'; end if;
 v_uid:=auth.uid()::text;v_name:=left(trim(coalesce(p_name,'')),100);
 if v_name='' then raise exception 'Enter your full name.'; end if;
 update public.crew_profiles set name=v_name,bio=left(coalesce(p_bio,''),500),avatar_url=case when p_avatar_url is null then avatar_url else p_avatar_url end,banner_url=case when p_banner_url is null then banner_url else p_banner_url end where auth_id=v_uid;
 if not found then raise exception 'Crew profile not found.'; end if;
 return (select jsonb_build_object('auth_id',auth_id,'name',name,'email',email,'role',role,'username',username,'bio',bio,'avatar_url',avatar_url,'banner_url',banner_url) from public.crew_profiles where auth_id=v_uid);
end $$;
revoke all on function public.crew_update_profile(text,text,text,text) from public,anon;
grant execute on function public.crew_update_profile(text,text,text,text) to authenticated;
create table if not exists public.crew_profile_follows(follower_id text not null references public.crew_profiles(auth_id) on delete cascade,followed_id text not null references public.crew_profiles(auth_id) on delete cascade,created_at timestamptz not null default now(),primary key(follower_id,followed_id),check(follower_id<>followed_id));
create index if not exists crew_profile_follows_followed_idx on public.crew_profile_follows(followed_id);
alter table public.crew_profile_follows enable row level security;
revoke all on public.crew_profile_follows from public,anon,authenticated;
create or replace function public.crew_profile_social(p_auth_id text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_uid text;v_target text;v_profile jsonb;v_fc int;v_gc int;v_is_following boolean;
begin
 if auth.uid() is null then raise exception 'Please sign in first.'; end if;
 v_uid:=auth.uid()::text;v_target:=coalesce(nullif(p_auth_id,''),v_uid);
 select jsonb_build_object('auth_id',p.auth_id,'name',p.name,'email',case when p.auth_id=v_uid then p.email else null end,'role',p.role,'username',p.username,'bio',p.bio,'avatar_url',p.avatar_url,'banner_url',p.banner_url) into v_profile from public.crew_profiles p where p.auth_id=v_target;
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
 select coalesce(jsonb_agg(jsonb_build_object('auth_id',p.auth_id,'name',p.name,'username',p.username,'role',p.role,'bio',p.bio,'avatar_url',p.avatar_url,'followers_count',(select count(*)::int from public.crew_profile_follows f where f.followed_id=p.auth_id)) order by (p.role='super_admin') desc,p.name),'[]'::jsonb) into v_people from public.crew_profiles p;
 return v_people;
end $$;
revoke all on function public.crew_profile_directory() from public,anon;
grant execute on function public.crew_profile_directory() to authenticated;
create or replace function public.crew_follow_profile(p_target_auth_id text,p_follow boolean default true)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_uid text;v_count int;
begin
 if auth.uid() is null then raise exception 'Please sign in first.'; end if;
 v_uid:=auth.uid()::text;
 if p_target_auth_id is null or p_target_auth_id=v_uid then raise exception 'You cannot follow your own profile.'; end if;
 if not exists(select 1 from public.crew_profiles where auth_id=p_target_auth_id) then raise exception 'Crew profile not found.'; end if;
 if coalesce(p_follow,true) then insert into public.crew_profile_follows(follower_id,followed_id) values(v_uid,p_target_auth_id) on conflict do nothing; else delete from public.crew_profile_follows where follower_id=v_uid and followed_id=p_target_auth_id; end if;
 select count(*)::int into v_count from public.crew_profile_follows where followed_id=p_target_auth_id;
 return jsonb_build_object('following',coalesce(p_follow,true),'followers_count',v_count);
end $$;
revoke all on function public.crew_follow_profile(text,boolean) from public,anon;
grant execute on function public.crew_follow_profile(text,boolean) to authenticated;
notify pgrst,'reload schema';
