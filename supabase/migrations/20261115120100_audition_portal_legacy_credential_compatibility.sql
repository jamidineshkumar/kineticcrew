update public.crew_profiles
set must_change_password=false,password_change_required_since=null
where role='audition_participant' and approval_status='approved';

create or replace function public.crew_audition_submit_video(p_video_url text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','auth'
as $function$
declare
  v_app public.crew_audition_applications%rowtype;
  v_role text;
  v_video text:=trim(coalesce(p_video_url,''));
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;

  select role into v_role
  from public.crew_profiles
  where auth_id=auth.uid()::text and approval_status='approved';

  if v_role<>'audition_participant' then
    raise exception 'Only audition participants can submit an audition video.';
  end if;
  if v_video !~* '^https://[^[:space:]]+$' or char_length(v_video)>2048 then
    raise exception 'Enter a valid HTTPS audition video link.';
  end if;

  select * into v_app
  from public.crew_audition_applications
  where auth_id=auth.uid()::text
  for update;

  if not found or v_app.application_status not in ('audition_invited','credentials_sent','audition_video_submitted') then
    raise exception 'Your audition video submission is not currently open.';
  end if;
  if v_app.audition_admin_decision is not null or v_app.audition_president_decision is not null then
    raise exception 'Your audition video is already under review and can no longer be changed.';
  end if;

  update public.crew_audition_applications
  set video_url=v_video,application_status='audition_video_submitted',updated_at=now()
  where id=v_app.id;

  return jsonb_build_object('ok',true,'message','Your audition video has been submitted successfully.');
end;
$function$;

grant execute on function public.crew_audition_submit_video(text) to authenticated;
