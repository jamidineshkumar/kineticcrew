-- Restrict app release publishing and crew announcements to the Super Admin.
-- Admins retain permission to manage the intro soundtrack, but cannot publish versions.

create or replace function public.crew_set_app_setting(p_key text,p_value jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_uid text; v_role text;
begin
 if auth.uid() is null then raise exception 'Sign in required.'; end if;
 v_uid:=auth.uid()::text;
 select role into v_role from public.crew_profiles where auth_id=v_uid;
 if p_key='latest_version' and coalesce(v_role,'')<>'super_admin' then
   raise exception 'Only the Super Admin can publish app releases.';
 end if;
 if p_key='intro_audio_url' and coalesce(v_role,'') not in ('admin','super_admin') then
   raise exception 'Admin access required.';
 end if;
 if p_key not in ('intro_audio_url','latest_version') then raise exception 'Unsupported app setting.'; end if;
 if p_key='intro_audio_url' and length(coalesce(p_value#>>'{}',''))>2048 then raise exception 'Audio URL is too long.'; end if;
 insert into public.crew_app_settings(setting_key,setting_value,updated_at,updated_by)
 values(p_key,p_value,now(),v_uid)
 on conflict(setting_key) do update set setting_value=excluded.setting_value,updated_at=now(),updated_by=v_uid;
 return jsonb_build_object('message','App setting saved.','key',p_key);
end $$;
revoke all on function public.crew_set_app_setting(text,jsonb) from public,anon;
grant execute on function public.crew_set_app_setting(text,jsonb) to authenticated;

create or replace function public.crew_guard_announcement_publisher()
returns trigger
language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare v_role text;
begin
 if auth.uid() is null then raise exception 'Sign in required.'; end if;
 select role into v_role from public.crew_profiles where auth_id=auth.uid()::text;
 if coalesce(v_role,'')<>'super_admin' then
   raise exception 'Only the Super Admin can publish crew updates.';
 end if;
 new.author_id:=auth.uid()::text;
 return new;
end $$;
drop trigger if exists crew_announcement_super_admin_only on public.crew_announcements;
create trigger crew_announcement_super_admin_only
before insert on public.crew_announcements
for each row execute function public.crew_guard_announcement_publisher();

notify pgrst,'reload schema';
