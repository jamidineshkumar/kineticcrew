-- Kinetic Crew username identity and account profile bootstrap.
-- Apply the original 202610260001 migration first in this NEW project.
alter table public.crew_profiles add column if not exists username text;
create unique index if not exists crew_profiles_username_lower_uq
  on public.crew_profiles (lower(username)) where username is not null;
create or replace function public.crew_handle_new_auth_user()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_username text; v_name text;
begin
  v_username := lower(trim(coalesce(new.raw_user_meta_data->>'username','')));
  v_name := left(trim(coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name',split_part(new.email,'@',1))),100);
  if v_username !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'Username must be 3–24 characters using letters, numbers or underscores.';
  end if;
  insert into public.crew_profiles(auth_id,email,name,username,role)
  values(new.id::text,lower(new.email),coalesce(nullif(v_name,''),'Crew member'),v_username,'member')
  on conflict(auth_id) do update set email=excluded.email,name=excluded.name,username=excluded.username;
  return new;
end;
$$;
drop trigger if exists crew_on_auth_user_created on auth.users;
create trigger crew_on_auth_user_created
  after insert on auth.users
  for each row execute function public.crew_handle_new_auth_user();
revoke all on function public.crew_handle_new_auth_user() from public, anon, authenticated;
comment on column public.crew_profiles.username is 'Unique public login handle; never used as an authorization role.';
notify pgrst, 'reload schema';
