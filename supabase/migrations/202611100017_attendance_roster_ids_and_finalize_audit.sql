-- Expose member IDs to the authorized attendance desk and audit finalization.
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
  'member_id',p.auth_id,'name',p.name,'email',p.email,'registered_at',r.registered_at,
  'attended',coalesce(a.status='present',false),
  'status',coalesce(a.status,case when v_finalized then 'absent' else 'pending' end),
  'marked_at',a.marked_at
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
 insert into public.crew_attendance_audit(event_id,member_id,changed_by,previous_status,new_status,action)
 select p_event_id,r.member_id,v_uid,'pending','absent','status_changed'
 from public.crew_registrations r
 where r.event_id=p_event_id and exists(
   select 1 from public.crew_attendance a where a.event_id=r.event_id and a.member_id=r.member_id
     and a.status='absent' and a.marked_by=v_uid and a.marked_at>=now()-interval '2 minutes'
 );
 insert into public.crew_attendance_audit(event_id,member_id,changed_by,previous_status,new_status,action)
 values(p_event_id,null,v_uid,'open','finalized','finalized');
 return jsonb_build_object('message','Attendance finalized. Remaining registered members marked absent.','absent_count',v_absent);
end $$;
revoke all on function public.crew_attendance_roster(uuid) from public,anon;
grant execute on function public.crew_attendance_roster(uuid) to authenticated;
revoke all on function public.crew_finalize_attendance(uuid) from public,anon;
grant execute on function public.crew_finalize_attendance(uuid) to authenticated;
notify pgrst,'reload schema';