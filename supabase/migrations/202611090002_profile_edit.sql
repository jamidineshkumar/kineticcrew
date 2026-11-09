-- Profile editing for Kinetic Crew. Updates only the signed-in user's display name.
create or replace function public.crew_update_profile(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare v_uid text; v_name text;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  v_uid := auth.uid()::text;
  v_name := left(trim(coalesce(p_name,'')),100);
  if v_name='' then raise exception 'Enter your full name.'; end if;
  update public.crew_profiles set name=v_name where auth_id=v_uid;
  if not found then raise exception 'Crew profile not found. Please sign out and sign in again.'; end if;
  return jsonb_build_object('name',v_name);
end;
$$;
revoke all on function public.crew_update_profile(text) from public, anon;
grant execute on function public.crew_update_profile(text) to authenticated;
notify pgrst, 'reload schema';
