-- Preserve shared crew records while removing the member's personal account data.
alter table public.crew_app_releases alter column published_by drop not null;
alter table public.crew_attendance_audit alter column changed_by drop not null;
alter table public.crew_event_finalizations alter column finalized_by drop not null;
alter table public.crew_events alter column created_by drop not null;

create or replace function public.crew_admin_delete_member(p_auth_id text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_actor text;
  v_actor_role text;
  v_target_role text;
  v_target_name text;
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  v_actor := auth.uid()::text;
  if nullif(trim(p_auth_id),'') is null then raise exception 'Choose a crew member.'; end if;
  if p_auth_id = v_actor then raise exception 'You cannot delete your own account from Crew Management.'; end if;

  select role into v_actor_role from public.crew_profiles where auth_id=v_actor;
  if coalesce(v_actor_role,'') not in ('admin','super_admin') then
    raise exception 'Admin access required.';
  end if;

  select role,name into v_target_role,v_target_name
  from public.crew_profiles where auth_id=p_auth_id for update;
  if not found then raise exception 'Crew member not found.'; end if;
  if v_target_role='super_admin' then raise exception 'A Super Admin account cannot be deleted here.'; end if;
  if v_actor_role='admin' and v_target_role<>'member' then
    raise exception 'Admins can remove members only. A Super Admin must remove another Admin.';
  end if;
  if v_actor_role='super_admin' and v_target_role not in ('member','admin') then
    raise exception 'This account cannot be removed.';
  end if;

  -- Keep shared events, releases and audit history; remove personal attribution where required.
  update public.crew_app_settings set updated_by=null where updated_by=p_auth_id;
  update public.crew_app_releases set published_by=null where published_by=p_auth_id;
  update public.crew_attendance_audit set changed_by=null where changed_by=p_auth_id;
  update public.crew_event_finalizations set finalized_by=null where finalized_by=p_auth_id;
  update public.crew_events set created_by=null where created_by=p_auth_id;

  -- Remove content owned by the departing account.
  delete from public.crew_announcements where author_id=p_auth_id;
  delete from public.crew_wardrobe_items where created_by=p_auth_id;

  -- Profile-linked records (follows, posts/comments/likes, registrations, attendance,
  -- feature submissions/votes, login streaks, documents metadata, push tokens, etc.)
  -- are removed by their foreign-key cascades.
  delete from public.crew_profiles where auth_id=p_auth_id;
  if not found then raise exception 'Member removal did not complete.'; end if;

  return jsonb_build_object('ok',true,'removed_name',v_target_name,'removed_auth_id',p_auth_id);
end;
$$;

revoke all on function public.crew_admin_delete_member(text) from public, anon, authenticated;
grant execute on function public.crew_admin_delete_member(text) to authenticated;
notify pgrst, 'reload schema';