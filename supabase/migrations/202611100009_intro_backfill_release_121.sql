-- Backfill existing crew members as already introduced; new accounts see it once.
insert into public.crew_intro_seen(auth_id,seen_at)
select auth_id,now() from public.crew_profiles
on conflict(auth_id) do nothing;
update public.crew_app_settings set setting_value='"1.2.1"'::jsonb,updated_at=now()
where setting_key='latest_version';
notify pgrst,'reload schema';