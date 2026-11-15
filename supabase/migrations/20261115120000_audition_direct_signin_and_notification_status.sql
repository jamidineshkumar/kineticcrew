create unique index if not exists crew_audition_registration_number_uidx
on public.crew_audition_applications (upper(btrim(application_data->>'registrationNumber')))
where nullif(btrim(application_data->>'registrationNumber'),'') is not null;

create or replace function public.crew_handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public','extensions'
as $function$
declare
  v_username text;
  v_name text;
  v_email_hash text;
  v_is_audition boolean := false;
begin
  v_email_hash := encode(extensions.digest(lower(trim(coalesce(new.email,''))), 'sha256'), 'hex');
  if exists(select 1 from public.crew_permanent_email_blocks where email_sha256=v_email_hash) then
    raise exception 'This email address is permanently ineligible to create a Kinetic Crew account. Contact the Super Admin if you believe this is an error.';
  end if;

  v_username := lower(trim(coalesce(new.raw_user_meta_data->>'username','')));
  v_name := left(trim(coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name',split_part(new.email,'@',1))),100);
  if v_username !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'Username must be 3–24 characters using letters, numbers or underscores.';
  end if;

  select exists(
    select 1
    from public.crew_audition_applications a
    where lower(a.email)=lower(new.email)
      and lower(coalesce(a.username,''))=v_username
      and a.application_status='audition_invited'
      and a.auth_id is null
  ) into v_is_audition;

  insert into public.crew_profiles(
    auth_id,email,name,username,role,approval_status,approval_requested_at,approved_at,must_change_password
  )
  values(
    new.id::text,
    lower(new.email),
    coalesce(nullif(v_name,''),'Crew member'),
    v_username,
    case when v_is_audition then 'audition_participant' else 'member' end,
    case when v_is_audition then 'approved' else 'pending' end,
    case when v_is_audition then null else now() end,
    case when v_is_audition then now() else null end,
    false
  )
  on conflict(auth_id) do update
    set email=excluded.email,name=excluded.name,username=excluded.username;

  return new;
end;
$function$;

create or replace function public.crew_audition_attach_account(
  p_application_id uuid,
  p_auth_id text,
  p_username text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','auth'
as $function$
declare
  v_actor_role text;
  v_app public.crew_audition_applications%rowtype;
  v_email text;
  v_profile_username text;
  v_username text:=lower(trim(coalesce(p_username,'')));
begin
  perform public.crew_assert_not_blocked();
  if auth.uid() is null then raise exception 'Sign in required.'; end if;

  select role into v_actor_role
  from public.crew_profiles
  where auth_id=auth.uid()::text and approval_status='approved';

  if coalesce(v_actor_role,'') not in ('admin','super_admin') then
    raise exception 'Admin access required.';
  end if;

  if v_username !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'Generated audition username is invalid.';
  end if;

  select * into v_app
  from public.crew_audition_applications
  where id=p_application_id
  for update;

  if not found then raise exception 'Audition application not found.'; end if;
  if v_app.application_status not in ('audition_invited','credentials_sent') then
    raise exception 'The application must be accepted before an audition account can be attached.';
  end if;
  if v_app.auth_id is not null and v_app.auth_id<>p_auth_id then
    raise exception 'A different account is already attached to this application.';
  end if;

  select email,username into v_email,v_profile_username
  from public.crew_profiles
  where auth_id=p_auth_id
  for update;

  if not found or lower(v_email)<>lower(v_app.email) then
    raise exception 'The sign-in account email does not match the audition application.';
  end if;
  if lower(coalesce(v_profile_username,''))<>v_username then
    raise exception 'The sign-in account username does not match the invitation.';
  end if;
  if exists(
    select 1 from public.crew_profiles
    where username=v_username and auth_id<>p_auth_id
  ) then
    raise exception 'Generated username is already in use. Try again.';
  end if;

  update public.crew_profiles
  set name=v_app.name,
      username=v_username,
      role='audition_participant',
      approval_status='approved',
      approval_requested_at=null,
      approved_at=coalesce(approved_at,now()),
      approved_by=auth.uid()::text,
      must_change_password=false,
      password_change_required_since=null
  where auth_id=p_auth_id;

  update public.crew_audition_applications
  set auth_id=p_auth_id,
      username=v_username,
      application_status='audition_invited',
      credential_stage='audition',
      temporary_password_sha256=null,
      credential_attempts=0,
      credential_locked_until=null,
      credential_verified_at=null,
      credentials_sent_at=coalesce(credentials_sent_at,now()),
      updated_at=now()
  where id=p_application_id;

  return jsonb_build_object(
    'ok',true,
    'username',v_username,
    'message','Audition Portal account is ready. The applicant can sign in directly.'
  );
end;
$function$;

grant execute on function public.crew_audition_attach_account(uuid,text,text) to authenticated;

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
    'created_at',a.created_at,
    'updated_at',a.updated_at
  ) order by a.created_at desc),'[]'::jsonb)
  into v_rows
  from public.crew_audition_applications a
  left join public.crew_audition_push_events pe on pe.application_id=a.id;

  return v_rows;
end;
$function$;

grant execute on function public.crew_audition_list_applications() to authenticated;
