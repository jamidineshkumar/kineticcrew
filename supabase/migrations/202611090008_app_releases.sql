-- Kinetic Crew release notes and per-member in-app update notifications.
create table if not exists public.crew_app_releases (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  title text not null,
  summary text not null,
  features jsonb not null default '[]'::jsonb,
  fixes jsonb not null default '[]'::jsonb,
  published_by text not null references public.crew_profiles(auth_id),
  published_at timestamptz not null default now()
);
create table if not exists public.crew_release_notifications (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.crew_app_releases(id) on delete cascade,
  user_id text not null references public.crew_profiles(auth_id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique(release_id,user_id)
);
create index if not exists crew_release_notifications_user_idx
  on public.crew_release_notifications(user_id,created_at desc);
alter table public.crew_app_releases enable row level security;
alter table public.crew_release_notifications enable row level security;
revoke all on public.crew_app_releases,public.crew_release_notifications from anon,authenticated;

create or replace function public.crew_release_publish(
 p_version text,p_title text,p_summary text,p_features jsonb default '[]'::jsonb,p_fixes jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare v_uid text;v_role text;v_id uuid;v_count integer;
begin
 if auth.uid() is null then raise exception 'Sign in required.'; end if;
 v_uid:=auth.uid()::text;
 select role into v_role from public.crew_profiles where auth_id=v_uid;
 if v_role<>'super_admin' then raise exception 'Only the Super Admin can publish app releases.'; end if;
 if trim(coalesce(p_version,''))='' or trim(coalesce(p_title,''))='' or trim(coalesce(p_summary,''))='' then
  raise exception 'Version, title and summary are required.';
 end if;
 if jsonb_typeof(coalesce(p_features,'[]'::jsonb))<>'array' or jsonb_typeof(coalesce(p_fixes,'[]'::jsonb))<>'array' then
  raise exception 'Features and fixes must be lists.';
 end if;
 insert into public.crew_app_releases(version,title,summary,features,fixes,published_by)
 values(left(trim(p_version),32),left(trim(p_title),140),left(trim(p_summary),2000),
        coalesce(p_features,'[]'::jsonb),coalesce(p_fixes,'[]'::jsonb),v_uid)
 returning id into v_id;
 insert into public.crew_release_notifications(release_id,user_id)
 select v_id,auth_id from public.crew_profiles
 on conflict(release_id,user_id) do nothing;
 get diagnostics v_count=row_count;
 return jsonb_build_object('id',v_id,'notified_users',v_count,'message','App update published to every crew account.');
end $$;
create or replace function public.crew_release_feed()
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare v_uid text;v_releases jsonb;v_unread jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required.'; end if;
 v_uid:=auth.uid()::text;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',r.id,'version',r.version,'title',r.title,'summary',r.summary,'features',r.features,'fixes',r.fixes,
  'published_at',r.published_at,'published_by_name',p.name,
  'notification_id',n.id,'read_at',n.read_at
 ) order by r.published_at desc),'[]'::jsonb)
 into v_releases
 from public.crew_release_notifications n
 join public.crew_app_releases r on r.id=n.release_id
 join public.crew_profiles p on p.auth_id=r.published_by
 where n.user_id=v_uid;
 select coalesce(jsonb_agg(n.id),'[]'::jsonb) into v_unread
 from public.crew_release_notifications n where n.user_id=v_uid and n.read_at is null;
 return jsonb_build_object('releases',v_releases,'unread_ids',v_unread);
end $$;
create or replace function public.crew_release_mark_read(p_notification_id uuid default null)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare v_uid text;v_count integer;
begin
 if auth.uid() is null then raise exception 'Sign in required.'; end if;
 v_uid:=auth.uid()::text;
 update public.crew_release_notifications set read_at=now()
 where user_id=v_uid and read_at is null and (p_notification_id is null or id=p_notification_id);
 get diagnostics v_count=row_count;
 return jsonb_build_object('marked_read',v_count);
end $$;
revoke all on function public.crew_release_publish(text,text,text,jsonb,jsonb) from public,anon;
revoke all on function public.crew_release_feed() from public,anon;
revoke all on function public.crew_release_mark_read(uuid) from public,anon;
grant execute on function public.crew_release_publish(text,text,text,jsonb,jsonb) to authenticated;
grant execute on function public.crew_release_feed() to authenticated;
grant execute on function public.crew_release_mark_read(uuid) to authenticated;
notify pgrst,'reload schema';
