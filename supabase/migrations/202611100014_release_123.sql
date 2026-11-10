insert into public.crew_app_settings(setting_key,setting_value,updated_at)
values('latest_version','"1.2.3"'::jsonb,now())
on conflict(setting_key) do update set setting_value=excluded.setting_value,updated_at=now();
notify pgrst,'reload schema';