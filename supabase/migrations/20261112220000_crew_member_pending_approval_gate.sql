-- New verified signups remain pending until an Admin or Super Admin approves them.
alter table public.crew_profiles
  add column if not exists approval_status text not null default 'approved'
    check (approval_status in ('pending','approved','rejected')),
  add column if not exists approval_requested_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by text,
  add column if not exists rejection_reason text;

update public.crew_profiles
set approval_requested_at=coalesce(approval_requested_at,created_at),
    approved_at=coalesce(approved_at,created_at)
where approval_status='approved';

create or replace function public.crew_is_approved()
returns boolean language sql stable security definer
set search_path=pg_catalog,public,auth
as $$
 select auth.uid() is not null
 and exists(select 1 from public.crew_profiles p where p.auth_id=auth.uid()::text and p.approval_status='approved')
 and not exists(select 1 from public.crew_member_blocks b where b.blocked_auth_id=auth.uid()::text);
$$;

create or replace function public.crew_assert_not_blocked()
returns boolean language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare v_status text;
begin
 if auth.uid() is null then raise exception 'Please sign in first.'; end if;
 if exists(select 1 from public.crew_member_blocks where blocked_auth_id=auth.uid()::text) then
  raise exception 'This Kinetic Crew account is blocked. Contact an administrator to restore access.';
 end if;
 select approval_status into v_status from public.crew_profiles where auth_id=auth.uid()::text;
 if v_status is null then raise exception 'Your Kinetic Crew membership request could not be found. Please contact an administrator.';
 elsif v_status='pending' then raise exception 'Your membership request is pending Admin or Super Admin approval. Please check back in about 1 hour. This is an estimated wait, not automatic approval.';
 elsif v_status='rejected' then raise exception 'Your Kinetic Crew membership request was not approved. Please contact an administrator if you need help.';
 end if;
 return true;
end;
$$;

create or replace function public.crew_access_status()
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare v public.crew_profiles%rowtype;
begin
 if auth.uid() is null then raise exception 'Please sign in first.'; end if;
 select * into v from public.crew_profiles where auth_id=auth.uid()::text;
 if not found then return jsonb_build_object('status','missing','message','Your membership request could not be found.'); end if;
 if exists(select 1 from public.crew_member_blocks b where b.blocked_auth_id=v.auth_id) then
  return jsonb_build_object('status','blocked','message','This Kinetic Crew account is blocked.');
 end if;
 return jsonb_build_object('status',v.approval_status,'role',v.role,'requested_at',v.approval_requested_at,'approved_at',v.approved_at,'rejection_reason',v.rejection_reason);
end;
$$;

create or replace function public.crew_pending_members()
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare v_role text; v_rows jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required.'; end if;
 select role into v_role from public.crew_profiles where auth_id=auth.uid()::text and approval_status='approved';
 if coalesce(v_role,'') not in ('admin','super_admin') then raise exception 'Admin access required.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('auth_id',auth_id,'name',name,'email',email,'username',username,'requested_at',approval_requested_at) order by approval_requested_at asc),'[]'::jsonb)
 into v_rows from public.crew_profiles where approval_status='pending';
 return v_rows;
end;
$$;

create or replace function public.crew_review_member(p_auth_id text,p_decision text,p_reason text default null)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare v_actor_role text; v_target_role text;
begin
 if auth.uid() is null then raise exception 'Sign in required.'; end if;
 select role into v_actor_role from public.crew_profiles where auth_id=auth.uid()::text and approval_status='approved';
 if coalesce(v_actor_role,'') not in ('admin','super_admin') then raise exception 'Admin access required.'; end if;
 if coalesce(p_decision,'') not in ('approve','reject') then raise exception 'Choose approve or reject.'; end if;
 select role into v_target_role from public.crew_profiles where auth_id=p_auth_id and approval_status='pending' for update;
 if not found then raise exception 'This pending membership request no longer exists.'; end if;
 if coalesce(v_target_role,'')<>'member' then raise exception 'Only pending member accounts can be reviewed.'; end if;
 update public.crew_profiles set
  approval_status=case when p_decision='approve' then 'approved' else 'rejected' end,
  approved_at=case when p_decision='approve' then now() else null end,
  approved_by=auth.uid()::text,
  rejection_reason=case when p_decision='reject' then left(coalesce(p_reason,'Not approved by crew administration.'),500) else null end
 where auth_id=p_auth_id;
 return jsonb_build_object('ok',true,'status',case when p_decision='approve' then 'approved' else 'rejected' end);
end;
$$;

create or replace function public.crew_handle_new_auth_user()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,extensions
as $$
declare v_username text; v_name text; v_email_hash text;
begin
 v_email_hash:=encode(extensions.digest(lower(trim(coalesce(new.email,''))),'sha256'),'hex');
 if exists(select 1 from public.crew_permanent_email_blocks where email_sha256=v_email_hash) then
  raise exception 'This email address is permanently ineligible to create a Kinetic Crew account. Contact the Super Admin if you believe this is an error.';
 end if;
 v_username:=lower(trim(coalesce(new.raw_user_meta_data->>'username','')));
 v_name:=left(trim(coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name',split_part(new.email,'@',1))),100);
 if v_username !~ '^[a-z0-9_]{3,24}$' then raise exception 'Username must be 3–24 characters using letters, numbers or underscores.'; end if;
 insert into public.crew_profiles(auth_id,email,name,username,role,approval_status,approval_requested_at)
 values(new.id::text,lower(new.email),coalesce(nullif(v_name,''),'Crew member'),v_username,'member','pending',now())
 on conflict(auth_id) do update set email=excluded.email,name=excluded.name,username=excluded.username;
 return new;
end;
$$;

-- Enforce approval inside every app-facing SECURITY DEFINER PL/pgSQL RPC.
do $$
declare r record; v_def text;
begin
 for r in select p.oid,p.proname,pg_get_functiondef(p.oid) definition
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prosecdef
 and p.prolang=(select oid from pg_language where lanname='plpgsql')
 and p.proname not in ('crew_assert_not_blocked','crew_access_status','crew_pending_members','crew_review_member','crew_check_username','crew_handle_new_auth_user','crew_events_touch_updated_at','crew_guard_announcement_publisher')
 loop
  v_def:=regexp_replace(r.definition,'(\mBEGIN\M)',E'BEGIN\n PERFORM public.crew_assert_not_blocked();','i');
  if v_def<>r.definition then execute v_def; end if;
 end loop;
end;
$$;

create or replace function public.crew_can_message(p_recipient_id text)
returns boolean language sql stable security definer
set search_path=pg_catalog,public,auth
as $$
 select public.crew_is_approved() and auth.uid() is not null
 and p_recipient_id is not null and p_recipient_id<>auth.uid()::text
 and exists(select 1 from public.crew_profiles p where p.auth_id=p_recipient_id and p.approval_status='approved')
 and not exists(select 1 from public.crew_member_blocks b where b.blocked_auth_id in (auth.uid()::text,p_recipient_id));
$$;

create or replace function public.crew_wardrobe_is_admin()
returns boolean language sql stable security definer
set search_path=pg_catalog,public,auth
as $$ select public.crew_is_approved() and exists(select 1 from public.crew_profiles p where p.auth_id=auth.uid()::text and p.role in ('admin','super_admin')); $$;

create or replace function public.crew_wardrobe_is_member()
returns boolean language sql stable security definer
set search_path=pg_catalog,public,auth
as $$ select public.crew_is_approved(); $$;

-- Restrict all existing direct-table policies as well, including social and profile tables.
do $$
declare r record; v_using text; v_check text; v_roles text; v_mode text; v_stmt text;
begin
 for r in select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname='public'
 loop
  v_roles:=array_to_string(r.roles,', ');
  v_mode:=case when r.permissive='PERMISSIVE' then 'PERMISSIVE' else 'RESTRICTIVE' end;
  v_using:=case when r.qual is null then null else '('||r.qual||') AND public.crew_is_approved()' end;
  v_check:=case when r.with_check is null then null else '('||r.with_check||') AND public.crew_is_approved()' end;
  execute format('drop policy %I on %I.%I',r.policyname,r.schemaname,r.tablename);
  v_stmt:=format('create policy %I on %I.%I as %s for %s to %s',r.policyname,r.schemaname,r.tablename,v_mode,r.cmd,v_roles);
  if v_using is not null then v_stmt:=v_stmt||' using ('||v_using||')'; end if;
  if v_check is not null then v_stmt:=v_stmt||' with check ('||v_check||')'; end if;
  execute v_stmt;
 end loop;
end;
$$;

do $$
declare v_def text;
begin
 select pg_get_functiondef('public.crew_api(text,text,jsonb)'::regprocedure) into v_def;
 v_def:=replace(v_def,'from public.crew_profiles p;','from public.crew_profiles p where p.approval_status=''approved'';');
 execute v_def;
 select pg_get_functiondef('public.crew_profile_directory()'::regprocedure) into v_def;
 v_def:=replace(v_def,'into v_people from public.crew_profiles p;','into v_people from public.crew_profiles p where p.approval_status=''approved'';');
 execute v_def;
end;
$$;

revoke all on function public.crew_access_status() from public;
revoke all on function public.crew_pending_members() from public;
revoke all on function public.crew_review_member(text,text,text) from public;
grant execute on function public.crew_access_status() to authenticated;
grant execute on function public.crew_pending_members() to authenticated;
grant execute on function public.crew_review_member(text,text,text) to authenticated;
