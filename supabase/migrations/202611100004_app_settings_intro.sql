-- Kinetic Crew app settings and admin-managed intro soundtrack.
create table if not exists public.crew_app_settings (
  setting_key text primary key,
  setting_value jsonb not null default 'null'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text references public.crew_profiles(auth_id)
);
alter table public.crew_app_settings enable row level security;
revoke all on public.crew_app_settings from public, anon, authenticated;
insert into public.crew_app_settings(setting_key,setting_value) values
 ('developer','"Kinetic Crew Development Team"'::jsonb),
 ('latest_version','"1.1.0"'::jsonb)
on conflict(setting_key) do nothing;
create or replace function public.crew_get_app_settings() returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_uid text; v_result jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required.'; end if;
 v_uid:=auth.uid()::text;
 if not exists(select 1 from public.crew_profiles where auth_id=v_uid) then raise exception 'Crew profile not found.'; end if;
 select coalesce(jsonb_object_agg(setting_key,setting_value),'{}'::jsonb) into v_result from public.crew_app_settings;
 return v_result;
end $$;
revoke all on function public.crew_get_app_settings() from public,anon;
grant execute on function public.crew_get_app_settings() to authenticated;
create or replace function public.crew_set_app_setting(p_key text,p_value jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_uid text; v_role text;
begin
 if auth.uid() is null then raise exception 'Sign in required.'; end if;
 v_uid:=auth.uid()::text;
 select role into v_role from public.crew_profiles where auth_id=v_uid;
 if coalesce(v_role,'') not in ('admin','super_admin') then raise exception 'Admin access required.'; end if;
 if p_key not in ('intro_audio_url','latest_version') then raise exception 'Unsupported app setting.'; end if;
 if p_key='intro_audio_url' and length(coalesce(p_value#>>'{}',''))>2048 then raise exception 'Audio URL is too long.'; end if;
 insert into public.crew_app_settings(setting_key,setting_value,updated_at,updated_by)
 values(p_key,p_value,now(),v_uid)
 on conflict(setting_key) do update set setting_value=excluded.setting_value,updated_at=now(),updated_by=v_uid;
 return jsonb_build_object('message','App setting saved.','key',p_key);
end $$;
revoke all on function public.crew_set_app_setting(text,jsonb) from public,anon;
grant execute on function public.crew_set_app_setting(text,jsonb) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('crew-intro-audio','crew-intro-audio',true,15728640,array['audio/mpeg','audio/mp3','audio/wav','audio/ogg','audio/mp4','audio/aac'])
on conflict(id) do update set public=true,file_size_limit=15728640,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "Kinetic intro audio is public" on storage.objects;
create policy "Kinetic intro audio is public" on storage.objects for select using(bucket_id='crew-intro-audio');
drop policy if exists "Crew admins upload intro audio" on storage.objects;
create policy "Crew admins upload intro audio" on storage.objects for insert to authenticated
with check(bucket_id='crew-intro-audio' and (storage.foldername(name))[1]='admin' and exists(select 1 from public.crew_profiles p where p.auth_id=auth.uid()::text and p.role in ('admin','super_admin')));
drop policy if exists "Crew admins update intro audio" on storage.objects;
create policy "Crew admins update intro audio" on storage.objects for update to authenticated
using(bucket_id='crew-intro-audio' and (storage.foldername(name))[1]='admin' and exists(select 1 from public.crew_profiles p where p.auth_id=auth.uid()::text and p.role in ('admin','super_admin')))
with check(bucket_id='crew-intro-audio' and (storage.foldername(name))[1]='admin' and exists(select 1 from public.crew_profiles p where p.auth_id=auth.uid()::text and p.role in ('admin','super_admin')));
notify pgrst,'reload schema';
