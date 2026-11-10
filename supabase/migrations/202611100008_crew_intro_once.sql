-- Persist first-time crew introduction completion per account across all devices.
create table if not exists public.crew_intro_seen (
  auth_id text primary key references public.crew_profiles(auth_id) on delete cascade,
  seen_at timestamptz not null default now()
);
alter table public.crew_intro_seen enable row level security;
revoke all on public.crew_intro_seen from public,anon,authenticated;
-- Everyone who already had a crew account before this feature has already seen the intro.
insert into public.crew_intro_seen(auth_id,seen_at)
select auth_id,now() from public.crew_profiles
on conflict(auth_id) do nothing;
create or replace function public.crew_intro_should_show()
returns boolean language plpgsql stable security definer set search_path=pg_catalog,public,auth as $$
declare v_uid text;
begin
 if auth.uid() is null then raise exception 'Sign in required.'; end if;
 v_uid:=auth.uid()::text;
 if not exists(select 1 from public.crew_profiles where auth_id=v_uid) then raise exception 'Crew profile not found.'; end if;
 return not exists(select 1 from public.crew_intro_seen where auth_id=v_uid);
end $$;
revoke all on function public.crew_intro_should_show() from public,anon;
grant execute on function public.crew_intro_should_show() to authenticated;
create or replace function public.crew_intro_mark_seen()
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_uid text;
begin
 if auth.uid() is null then raise exception 'Sign in required.'; end if;
 v_uid:=auth.uid()::text;
 insert into public.crew_intro_seen(auth_id,seen_at) values(v_uid,now()) on conflict(auth_id) do nothing;
 return jsonb_build_object('seen',true);
end $$;
revoke all on function public.crew_intro_mark_seen() from public,anon;
grant execute on function public.crew_intro_mark_seen() to authenticated;
update public.crew_app_settings set setting_value='"1.2.1"'::jsonb,updated_at=now() where setting_key='latest_version';
notify pgrst,'reload schema';
