-- Super Admin crew designation controls and background pending-approval push alerts.
create or replace function public.crew_set_member_designation(p_auth_id text,p_designation text)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare v_actor_role text; v_target_role text; v_value text;
begin
 if auth.uid() is null then raise exception 'Sign in required.'; end if;
 select role into v_actor_role from public.crew_profiles
 where auth_id=auth.uid()::text and approval_status='approved';
 if coalesce(v_actor_role,'')<>'super_admin' then raise exception 'Only the Super Admin can define crew roles.'; end if;
 if coalesce(p_auth_id,'')=auth.uid()::text then raise exception 'You cannot change your own crew designation.'; end if;
 select role into v_target_role from public.crew_profiles
 where auth_id=p_auth_id and approval_status='approved' for update;
 if not found then raise exception 'Approved crew member not found.'; end if;
 if v_target_role='super_admin' then raise exception 'Super Admin designation is protected.'; end if;
 v_value:=nullif(left(trim(coalesce(p_designation,'')),40),'');
 update public.crew_profiles set designation=v_value where auth_id=p_auth_id;
 return jsonb_build_object('ok',true,'designation',v_value);
end;
$$;
revoke all on function public.crew_set_member_designation(text,text) from public,anon;
grant execute on function public.crew_set_member_designation(text,text) to authenticated;

create or replace function public.crew_profile_directory()
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare v_people jsonb;
begin
 perform public.crew_assert_not_blocked();
 if auth.uid() is null then raise exception 'Please sign in first.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'auth_id',p.auth_id,'name',p.name,'username',p.username,'role',p.role,
   'designation',p.designation,'bio',p.bio,'avatar_url',p.avatar_url,'banner_url',p.banner_url,
   'followers_count',(select count(*)::int from public.crew_profile_follows f where f.followed_id=p.auth_id),
   'is_following',case when p.auth_id=auth.uid()::text then false else exists(
      select 1 from public.crew_profile_follows f where f.follower_id=auth.uid()::text and f.followed_id=p.auth_id
   ) end
 ) order by (p.role='super_admin') desc,(p.role='admin') desc,p.name),'[]'::jsonb)
 into v_people from public.crew_profiles p where p.approval_status='approved';
 return v_people;
end;
$$;

create extension if not exists pg_net;
create table if not exists public.crew_pending_push_alerts (
 auth_id text primary key,
 status text not null default 'sending' check (status in ('sending','sent','failed')),
 sent_at timestamptz,
 last_error text,
 updated_at timestamptz not null default now()
);
alter table public.crew_pending_push_alerts enable row level security;
revoke all on public.crew_pending_push_alerts from anon,authenticated;

create or replace function public.crew_notify_super_admin_pending_signup()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,net
as $$
begin
 if new.approval_status='pending' then
  perform net.http_post(
   url:='https://lkdfjiweqxshbbcadfna.supabase.co/functions/v1/notify-super-admin-pending',
   headers:=jsonb_build_object('Content-Type','application/json','apikey','sb_publishable_8-7_og12Zot7nA-W_tz-rw_yDS1I9cp'),
   body:=jsonb_build_object('auth_id',new.auth_id),
   timeout_milliseconds:=5000
  );
 end if;
 return new;
end;
$$;
revoke all on function public.crew_notify_super_admin_pending_signup() from public,anon,authenticated;
drop trigger if exists crew_pending_signup_push_alert on public.crew_profiles;
create trigger crew_pending_signup_push_alert after insert on public.crew_profiles
for each row when (new.approval_status='pending')
execute function public.crew_notify_super_admin_pending_signup();
