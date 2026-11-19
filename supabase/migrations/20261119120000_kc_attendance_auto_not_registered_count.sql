-- Calculate event-level "Not registered" from approved crew membership.
-- Only registered members remain in the editable attendance roster.
CREATE OR REPLACE FUNCTION public.crew_attendance_roster(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  v_uid text;
  v_role text;
  v_roster jsonb;
  v_attendance jsonb;
  v_finalized boolean;
  v_eligible_members integer;
  v_event_starts_at timestamptz;
begin
  PERFORM public.crew_assert_not_blocked();
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  v_uid:=auth.uid()::text;
  select role into v_role from public.crew_profiles where auth_id=v_uid;
  if v_role not in ('admin','super_admin') then raise exception 'Admin access required.'; end if;

  select starts_at into v_event_starts_at
  from public.crew_events where id=p_event_id;
  if not found then raise exception 'Event not found.'; end if;

  select exists(select 1 from public.crew_event_finalizations where event_id=p_event_id)
    into v_finalized;

  select count(*)::integer into v_eligible_members
  from public.crew_profiles p
  where p.approval_status='approved'
    and coalesce(p.role,'')<>'audition_participant'
    and coalesce(p.approved_at,p.created_at)<=v_event_starts_at;

  select coalesce(jsonb_agg(jsonb_build_object(
    'member_id',p.auth_id,'name',p.name,'email',p.email,'registered_at',r.registered_at,
    'attended',coalesce(a.status='present',false),
    'status',coalesce(a.status,case when v_finalized then 'absent' else 'pending' end),
    'marked_at',a.marked_at
  ) order by p.name),'[]'::jsonb)
  into v_roster
  from public.crew_registrations r
  join public.crew_profiles p on p.auth_id=r.member_id
  left join public.crew_attendance a on a.event_id=r.event_id and a.member_id=r.member_id
  where r.event_id=p_event_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'name',p.name,'email',p.email,'status',a.status,'marked_at',a.marked_at,'marked_by',m.name
  ) order by a.marked_at desc),'[]'::jsonb)
  into v_attendance
  from public.crew_attendance a
  join public.crew_profiles p on p.auth_id=a.member_id
  join public.crew_profiles m on m.auth_id=a.marked_by
  where a.event_id=p_event_id;

  return jsonb_build_object(
    'roster',v_roster,
    'attendance',v_attendance,
    'finalized',v_finalized,
    'eligible_members',v_eligible_members,
    'not_registered_count',greatest(v_eligible_members-jsonb_array_length(v_roster),0)
  );
end
$function$;
