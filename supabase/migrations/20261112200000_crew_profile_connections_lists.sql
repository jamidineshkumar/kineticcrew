create or replace function public.crew_profile_connections(p_auth_id text default null,p_kind text default 'followers')
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth
as $$
declare v_target text; v_items jsonb;
begin
 if auth.uid() is null then raise exception 'Please sign in first.'; end if;
 v_target:=coalesce(nullif(p_auth_id,''),auth.uid()::text);
 if p_kind not in ('followers','following') then raise exception 'Choose followers or following.'; end if;
 if not exists(select 1 from public.crew_profiles where auth_id=v_target) then raise exception 'Crew profile not found.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('auth_id',q.auth_id,'name',q.name,'username',q.username,'role',q.role,'avatar_url',q.avatar_url) order by q.name),'[]'::jsonb)
 into v_items
 from (select p.auth_id,p.name,p.username,p.role,p.avatar_url from public.crew_profile_follows f
 join public.crew_profiles p on p.auth_id=case when p_kind='followers' then f.follower_id else f.followed_id end
 where case when p_kind='followers' then f.followed_id else f.follower_id end=v_target) q;
 return jsonb_build_object('kind',p_kind,'items',v_items,'count',jsonb_array_length(v_items));
end; $$;
revoke all on function public.crew_profile_connections(text,text) from public,anon;
grant execute on function public.crew_profile_connections(text,text) to authenticated;