alter table public.crew_profiles drop constraint if exists crew_profiles_role_check;
alter table public.crew_profiles add constraint crew_profiles_role_check
 check(role = any(array['super_admin'::text,'admin'::text,'member'::text,'audition_participant'::text]));
