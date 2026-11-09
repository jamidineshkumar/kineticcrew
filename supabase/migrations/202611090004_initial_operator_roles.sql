-- Bootstrap the two explicitly designated Kinetic Crew operators.
-- Safe to re-run: this only updates matching existing, verified profile rows.
update public.crew_profiles
set role = 'super_admin'
where lower(email) = lower('jamidinesh77@gmail.com');

update public.crew_profiles
set role = 'admin'
where lower(email) = lower('dinesh.24bce7243@vitapstudent.ac.in')
  and lower(email) <> lower('jamidinesh77@gmail.com');

notify pgrst, 'reload schema';
