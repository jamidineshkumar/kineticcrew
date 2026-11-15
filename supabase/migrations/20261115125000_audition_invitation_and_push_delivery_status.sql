
create index if not exists crew_audition_review_history_application_id_idx
on public.crew_audition_review_history(application_id);

create or replace function public.crew_audition_list_applications()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','auth'
as $function$
declare
  v_role text;
  v_rows jsonb;
begin
  perform public.crew_assert_not_blocked();
  if auth.uid() is null then raise exception 'Sign in required.'; end if;

  select role into v_role
  from public.crew_profiles
  where auth_id=auth.uid()::text and approval_status='approved';

  if coalesce(v_role,'') not in ('admin','super_admin') then
    raise exception 'Admin access required.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,
    'name',a.name,
    'email',a.email,
    'video_url',a.video_url,
    'video_storage_path',a.video_storage_path,
    'application_data',a.application_data,
    'application_status',a.application_status,
    'auth_id',a.auth_id,
    'username',a.username,
    'credentials_sent_at',a.credentials_sent_at,
    'admin_decision',a.admin_decision,
    'admin_reviewed_at',a.admin_reviewed_at,
    'president_decision',a.president_decision,
    'president_reviewed_at',a.president_reviewed_at,
    'audition_admin_decision',a.audition_admin_decision,
    'audition_admin_reviewed_at',a.audition_admin_reviewed_at,
    'audition_president_decision',a.audition_president_decision,
    'audition_president_reviewed_at',a.audition_president_reviewed_at,
    'push_notification_status',pe.status,
    'push_notification_sent_count',coalesce(pe.sent_count,0),
    'push_notification_failed_count',coalesce(pe.failed_count,0),
    'push_notification_error',pe.last_error,
    'invitation_email_status',il.status,
    'invitation_email_sent_at',il.sent_at,
    'created_at',a.created_at,
    'updated_at',a.updated_at
  ) order by a.created_at desc),'[]'::jsonb)
  into v_rows
  from public.crew_audition_applications a
  left join public.crew_audition_push_events pe on pe.application_id=a.id
  left join lateral (
    select l.status,l.sent_at
    from public.crew_email_delivery_log l
    where l.idempotency_key='audition-invitation:'||a.id::text
      and lower(l.recipient_email)=lower(a.email)
    order by l.created_at desc
    limit 1
  ) il on true;

  return v_rows;
end;
$function$;

grant execute on function public.crew_audition_list_applications() to authenticated;
