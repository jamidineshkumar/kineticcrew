-- Attendance status controls, immutable audit history, and Super Admin reopening.
alter table public.crew_attendance drop constraint if exists crew_attendance_status_check;
alter table public.crew_attendance add constraint crew_attendance_status_check
  check (status in ('present','absent','not_attending'));

create table if not exists public.crew_attendance_audit (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.crew_events(id) on delete cascade,
  member_id text references public.crew_profiles(auth_id) on delete set null,
  changed_by text not null references public.crew_profiles(auth_id),
  previous_status text,
  new_status text not null,
  action text not null check (action in ('status_changed','finalized','reopened')),
  changed_at timestamptz not null default now()
);
create index if not exists crew_attendance_audit_event_time_idx
  on public.crew_attendance_audit(event_id, changed_at desc);
alter table public.crew_attendance_audit enable row level security;
revoke all on public.crew_attendance_audit from anon, authenticated;

create or replace function public.crew_set_attendance_status(
  p_event_id uuid, p_member_id text, p_status text
) returns jsonb
language plpgsql security definer
set search_path=pg_catalog,public,auth,extensions
as $$
declare v_uid text; v_role text; v_old text;
begin
 if auth.uid() is null then raise exception 'Sign in required.'; end if;
 v_uid:=auth.uid()::text;
 select role into v_role from public.crew_profiles where auth_id=v_uid;
 if v_role not in ('admin','super_admin') then raise exception 'Admin access required.'; end if;
 if p_status not in ('present','absent','not_attending','pending') then raise exception 'Invalid attendance status.'; end if;
 if exists(select 1 from public.crew_event_finalizations where event_id=p_event_id) then
   raise exception 'Attendance is locked. Ask the Super Admin to reopen it.';
 end if;
 if not exists(select 1 from public.crew_registrations where event_id=p_event_id and member_id=p_member_id) then
   raise exception 'This member is not registered for the selected event.';
 end if;
 select status into v_old from public.crew_attendance where event_id=p_event_id and member_id=p_member_id;
 if p_status='pending' then
   delete from public.crew_attendance where event_id=p_event_id and member_id=p_member_id;
 else
   insert into public.crew_attendance(event_id,member_id,marked_by,status)
   values(p_event_id,p_member_id,v_uid,p_status)
   on conflict(event_id,member_id) do update
     set status=excluded.status,marked_by=v_uid,marked_at=now();
 end if;
 insert into public.crew_attendance_audit(event_id,member_id,changed_by,previous_status,new_status,action)
 values(p_event_id,p_member_id,v_uid,coalesce(v_old,'pending'),p_status,'status_changed');
 return jsonb_build_object('message','Attendance updated: '||replace(p_status,'_',' ')||'.');
end $$;

create or replace function public.crew_reopen_attendance(p_event_id uuid)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare v_uid text; v_role text;
begin
 if auth.uid() is null then raise exception 'Sign in required.'; end if;
 v_uid:=auth.uid()::text;
 select role into v_role from public.crew_profiles where auth_id=v_uid;
 if v_role<>'super_admin' then raise exception 'Only the Super Admin can reopen finalized attendance.'; end if;
 delete from public.crew_event_finalizations where event_id=p_event_id;
 if not found then raise exception 'This event is not finalized.'; end if;
 insert into public.crew_attendance_audit(event_id,member_id,changed_by,previous_status,new_status,action)
 values(p_event_id,null,v_uid,'finalized','open','reopened');
 return jsonb_build_object('message','Attendance reopened. Admins can edit statuses again.');
end $$;

create or replace function public.crew_attendance_audit(p_event_id uuid)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare v_uid text; v_role text; v_rows jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required.'; end if;
 v_uid:=auth.uid()::text;
 select role into v_role from public.crew_profiles where auth_id=v_uid;
 if v_role not in ('admin','super_admin') then raise exception 'Admin access required.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',a.id,'member_name',coalesce(p.name,'Event'),'actor_name',actor.name,
   'previous_status',a.previous_status,'new_status',a.new_status,
   'action',a.action,'changed_at',a.changed_at
 ) order by a.changed_at desc),'[]'::jsonb)
 into v_rows
 from public.crew_attendance_audit a
 left join public.crew_profiles p on p.auth_id=a.member_id
 join public.crew_profiles actor on actor.auth_id=a.changed_by
 where a.event_id=p_event_id;
 return v_rows;
end $$;

revoke all on function public.crew_set_attendance_status(uuid,text,text) from public,anon;
revoke all on function public.crew_reopen_attendance(uuid) from public,anon;
revoke all on function public.crew_attendance_audit(uuid) from public,anon;
grant execute on function public.crew_set_attendance_status(uuid,text,text) to authenticated;
grant execute on function public.crew_reopen_attendance(uuid) to authenticated;
grant execute on function public.crew_attendance_audit(uuid) to authenticated;
notify pgrst,'reload schema';
