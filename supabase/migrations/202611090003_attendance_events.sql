-- Kinetic Crew attendance finalization, QR check-in and event management.
alter table public.crew_attendance
  add column if not exists status text not null default 'present'
  check (status in ('present','absent'));

create table if not exists public.crew_event_finalizations (
  event_id uuid primary key references public.crew_events(id) on delete cascade,
  finalized_by text not null references public.crew_profiles(auth_id),
  finalized_at timestamptz not null default now()
);
alter table public.crew_event_finalizations enable row level security;
revoke all on public.crew_event_finalizations from anon, authenticated;

create or replace function public.crew_mark_qr_attendance(p_event_id uuid,p_member_email text)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth,extensions
as $$
declare v_uid text; v_role text; v_member public.crew_profiles%rowtype;
begin
 if auth.uid() is null then raise exception 'Sign in required.'; end if;
 v_uid:=auth.uid()::text;
 select role into v_role from public.crew_profiles where auth_id=v_uid;
 if v_role not in ('admin','super_admin') then raise exception 'Admin access required.'; end if;
 if exists(select 1 from public.crew_event_finalizations where event_id=p_event_id) then
   raise exception 'Attendance is finalized. Reopen the event before making changes.';
 end if;
 select * into v_member from public.crew_profiles where lower(email)=lower(trim(p_member_email));
 if not found then raise exception 'Member account not found.'; end if;
 if not exists(select 1 from public.crew_registrations where event_id=p_event_id and member_id=v_member.auth_id) then
   raise exception 'This member is not registered for the selected event.';
 end if;
 insert into public.crew_attendance(event_id,member_id,marked_by,status)
 values(p_event_id,v_member.auth_id,v_uid,'present')
 on conflict(event_id,member_id) do update set status='present',marked_by=v_uid,marked_at=now();
 return jsonb_build_object('message','QR verified. Attendance marked for '||v_member.name||'.','member',v_member.name);
end $$;

create or replace function public.crew_finalize_attendance(p_event_id uuid)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare v_uid text; v_role text; v_absent integer;
begin
 if auth.uid() is null then raise exception 'Sign in required.'; end if;
 v_uid:=auth.uid()::text;
 select role into v_role from public.crew_profiles where auth_id=v_uid;
 if v_role not in ('admin','super_admin') then raise exception 'Admin access required.'; end if;
 if not exists(select 1 from public.crew_events where id=p_event_id) then raise exception 'Event not found.'; end if;
 insert into public.crew_event_finalizations(event_id,finalized_by)
 values(p_event_id,v_uid) on conflict(event_id) do nothing;
 insert into public.crew_attendance(event_id,member_id,marked_by,status)
 select r.event_id,r.member_id,v_uid,'absent'
 from public.crew_registrations r
 where r.event_id=p_event_id
   and not exists(select 1 from public.crew_attendance a where a.event_id=r.event_id and a.member_id=r.member_id)
 on conflict(event_id,member_id) do nothing;
 get diagnostics v_absent=row_count;
 return jsonb_build_object('message','Attendance finalized. Remaining registered members marked absent.','absent_count',v_absent);
end $$;

create or replace function public.crew_attendance_roster(p_event_id uuid)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare v_uid text; v_role text; v_roster jsonb; v_attendance jsonb; v_finalized boolean;
begin
 if auth.uid() is null then raise exception 'Sign in required.'; end if;
 v_uid:=auth.uid()::text;
 select role into v_role from public.crew_profiles where auth_id=v_uid;
 if v_role not in ('admin','super_admin') then raise exception 'Admin access required.'; end if;
 select exists(select 1 from public.crew_event_finalizations where event_id=p_event_id) into v_finalized;
 select coalesce(jsonb_agg(jsonb_build_object(
  'name',p.name,'email',p.email,'registered_at',r.registered_at,
  'attended',coalesce(a.status='present',false),
  'status',coalesce(a.status,case when v_finalized then 'absent' else 'pending' end)
 ) order by p.name),'[]'::jsonb) into v_roster
 from public.crew_registrations r join public.crew_profiles p on p.auth_id=r.member_id
 left join public.crew_attendance a on a.event_id=r.event_id and a.member_id=r.member_id
 where r.event_id=p_event_id;
 select coalesce(jsonb_agg(jsonb_build_object('name',p.name,'email',p.email,'status',a.status,'marked_at',a.marked_at,'marked_by',m.name)
 order by a.marked_at desc),'[]'::jsonb) into v_attendance
 from public.crew_attendance a join public.crew_profiles p on p.auth_id=a.member_id
 join public.crew_profiles m on m.auth_id=a.marked_by where a.event_id=p_event_id;
 return jsonb_build_object('roster',v_roster,'attendance',v_attendance,'finalized',v_finalized);
end $$;

create or replace function public.crew_delete_event(p_event_id uuid)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare v_role text;
begin
 if auth.uid() is null then raise exception 'Sign in required.'; end if;
 select role into v_role from public.crew_profiles where auth_id=auth.uid()::text;
 if v_role not in ('admin','super_admin') then raise exception 'Admin access required.'; end if;
 delete from public.crew_events where id=p_event_id;
 if not found then raise exception 'Event not found.'; end if;
 return jsonb_build_object('message','Event and its registrations/attendance records deleted.');
end $$;

revoke all on function public.crew_mark_qr_attendance(uuid,text) from public,anon;
revoke all on function public.crew_finalize_attendance(uuid) from public,anon;
revoke all on function public.crew_attendance_roster(uuid) from public,anon;
revoke all on function public.crew_delete_event(uuid) from public,anon;
grant execute on function public.crew_mark_qr_attendance(uuid,text) to authenticated;
grant execute on function public.crew_finalize_attendance(uuid) to authenticated;
grant execute on function public.crew_attendance_roster(uuid) to authenticated;
grant execute on function public.crew_delete_event(uuid) to authenticated;
notify pgrst,'reload schema';
