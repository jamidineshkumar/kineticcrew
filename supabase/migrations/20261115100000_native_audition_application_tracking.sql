alter table public.crew_audition_applications
  add column if not exists tracking_token_sha256 text;

create unique index if not exists crew_audition_applications_tracking_token_uidx
  on public.crew_audition_applications(tracking_token_sha256)
  where tracking_token_sha256 is not null;

create or replace function public.crew_audition_submit(
  p_name text,
  p_email text,
  p_video_url text,
  p_details jsonb default '{}'::jsonb,
  p_video_storage_path text default null
)
returns jsonb language plpgsql security definer
set search_path to 'pg_catalog','public','extensions'
as $function$
declare
  v_name text := left(trim(coalesce(p_name,'')),100);
  v_email text := lower(trim(coalesce(p_email,'')));
  v_video text := trim(coalesce(p_video_url,''));
  v_token text := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  v_id uuid;
begin
  if char_length(v_name)<2 then raise exception 'Enter your full name.'; end if;
  if v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then raise exception 'Enter a valid personal email address.'; end if;
  if v_video !~* '^https://[^[:space:]]+$' or char_length(v_video)>2048 then raise exception 'Submit a valid HTTPS audition video link.'; end if;
  if coalesce(pg_column_size(coalesce(p_details,'{}'::jsonb)),0)>12000 or jsonb_typeof(coalesce(p_details,'{}'::jsonb))<>'object' then raise exception 'Application details are invalid or too large.'; end if;
  if exists(select 1 from public.crew_audition_applications where lower(email)=v_email and application_status in ('submitted','credentials_sent','under_review','review_disagreement','selected')) then
    raise exception 'An application for this email address is already being processed.';
  end if;
  insert into public.crew_audition_applications(name,email,video_url,video_storage_path,application_data,tracking_token_sha256)
  values(v_name,v_email,v_video,nullif(trim(coalesce(p_video_storage_path,'')),''),coalesce(p_details,'{}'::jsonb),encode(extensions.digest(v_token,'sha256'),'hex'))
  returning id into v_id;
  return jsonb_build_object('ok',true,'application_id',v_id,'tracking_token',v_token,'message','Application submitted successfully.');
end;
$function$;

create or replace function public.crew_audition_track_status(p_token text)
returns jsonb language plpgsql security definer
set search_path to 'pg_catalog','public','extensions'
as $function$
declare v_row public.crew_audition_applications%rowtype; v_hash text;
begin
  if length(coalesce(p_token,''))<32 or length(coalesce(p_token,''))>128 then return jsonb_build_object('ok',false,'message','This tracking link is invalid.'); end if;
  v_hash:=encode(extensions.digest(trim(p_token),'sha256'),'hex');
  select * into v_row from public.crew_audition_applications where tracking_token_sha256=v_hash limit 1;
  if not found then return jsonb_build_object('ok',false,'message','This tracking link is invalid or no longer available.'); end if;
  return jsonb_build_object('ok',true,'application',jsonb_build_object(
    'id',v_row.id,'name',v_row.name,'email',v_row.email,'video_url',v_row.video_url,
    'application_data',v_row.application_data,'application_status',v_row.application_status,
    'admin_decision',v_row.admin_decision,'president_decision',v_row.president_decision,
    'created_at',v_row.created_at,'updated_at',v_row.updated_at,'credentials_sent_at',v_row.credentials_sent_at
  ));
end;
$function$;

create or replace function public.crew_audition_review(p_application_id uuid,p_decision text)
returns jsonb language plpgsql security definer
set search_path to 'pg_catalog','public','auth'
as $function$
declare v_role text; v_row public.crew_audition_applications%rowtype; v_admin text; v_president text; v_status text;
begin
  perform public.crew_assert_not_blocked();
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  select role into v_role from public.crew_profiles where auth_id=auth.uid()::text and approval_status='approved';
  if coalesce(v_role,'') not in ('admin','super_admin') then raise exception 'Admin access required.'; end if;
  if lower(trim(coalesce(p_decision,''))) not in ('accept','reject') then raise exception 'Choose Accept or Reject.'; end if;
  select * into v_row from public.crew_audition_applications where id=p_application_id for update;
  if not found then raise exception 'Audition application not found.'; end if;
  if v_row.application_status not in ('submitted','credentials_sent','under_review','review_disagreement') then raise exception 'This application is not awaiting review.'; end if;

  if v_role='admin' then
    insert into public.crew_audition_review_history(application_id,reviewer_auth_id,reviewer_role,previous_decision,new_decision)
    values(v_row.id,auth.uid()::text,'admin',v_row.admin_decision,p_decision);
    update public.crew_audition_applications set admin_decision=p_decision,admin_reviewed_by=auth.uid()::text,admin_reviewed_at=now(),updated_at=now()
    where id=v_row.id returning * into v_row;
  else
    insert into public.crew_audition_review_history(application_id,reviewer_auth_id,reviewer_role,previous_decision,new_decision)
    values(v_row.id,auth.uid()::text,'super_admin',v_row.president_decision,p_decision);
    update public.crew_audition_applications set president_decision=p_decision,president_reviewed_by=auth.uid()::text,president_reviewed_at=now(),updated_at=now()
    where id=v_row.id returning * into v_row;
  end if;

  v_admin:=v_row.admin_decision; v_president:=v_row.president_decision;
  if v_admin='accept' and v_president='accept' then
    v_status:='selected';
    update public.crew_audition_applications set application_status=v_status,updated_at=now() where id=v_row.id;
    if v_row.auth_id is not null then
      update public.crew_profiles set role='member',approval_status='approved',approved_at=now(),approved_by=auth.uid()::text,must_change_password=false where auth_id=v_row.auth_id;
    end if;
  elsif v_admin='reject' and v_president='reject' then
    v_status:='rejected';
    update public.crew_audition_applications set application_status=v_status,updated_at=now() where id=v_row.id;
  elsif v_admin is not null and v_president is not null then
    v_status:='review_disagreement';
    update public.crew_audition_applications set application_status=v_status,updated_at=now() where id=v_row.id;
  else
    v_status:='under_review';
    update public.crew_audition_applications set application_status=v_status,updated_at=now() where id=v_row.id;
  end if;
  return jsonb_build_object('ok',true,'application_status',v_status,'auth_id',v_row.auth_id,'email',v_row.email,'name',v_row.name,'video_storage_path',v_row.video_storage_path,
    'message',case when v_status='selected' then 'Both reviewers approved the audition. Member credentials can now be issued.' when v_status='rejected' then 'Both reviewers rejected the audition. The applicant is not selected.' when v_status='review_disagreement' then 'Reviewers disagree. The application remains under review.' else 'Your independent review has been recorded.' end);
end;
$function$;

create or replace function public.crew_audition_prepare_credentials(p_application_id uuid,p_username text,p_temporary_password text)
returns jsonb language plpgsql security definer
set search_path to 'pg_catalog','public','auth','extensions'
as $function$
declare v_role text; v_app public.crew_audition_applications%rowtype; v_username text:=lower(trim(coalesce(p_username,''))); v_password text:=coalesce(p_temporary_password,'');
begin
  perform public.crew_assert_not_blocked();
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  select role into v_role from public.crew_profiles where auth_id=auth.uid()::text and approval_status='approved';
  if coalesce(v_role,'') not in ('admin','super_admin') then raise exception 'Admin access required.'; end if;
  if v_username !~ '^[a-z0-9_]{3,24}$' then raise exception 'Generated member username is invalid.'; end if;
  if char_length(v_password)<>8 then raise exception 'Temporary password must be exactly 8 characters.'; end if;
  select * into v_app from public.crew_audition_applications where id=p_application_id for update;
  if not found then raise exception 'Audition application not found.'; end if;
  if v_app.application_status<>'selected' then raise exception 'Both reviewers must approve before member credentials can be issued.'; end if;
  if v_app.auth_id is not null then raise exception 'This applicant already has an activated account.'; end if;
  if exists(select 1 from public.crew_profiles where username=v_username) or exists(select 1 from public.crew_audition_applications where username=v_username and id<>p_application_id) then
    raise exception 'Generated username is already in use. Try again.';
  end if;
  update public.crew_audition_applications set username=v_username,temporary_password_sha256=encode(extensions.digest(v_password,'sha256'),'hex'),
    credential_attempts=0,credential_locked_until=null,credential_verified_at=null,credentials_sent_at=now(),updated_at=now() where id=p_application_id;
  return jsonb_build_object('ok',true,'username',v_username,'email',v_app.email,'message','Member credentials prepared for the selected applicant.');
end;
$function$;

create or replace function public.crew_audition_verify_credentials(p_username text,p_email text,p_temporary_password text)
returns jsonb language plpgsql security definer
set search_path to 'pg_catalog','public','auth','extensions'
as $function$
declare v_app public.crew_audition_applications%rowtype; v_username text:=lower(trim(coalesce(p_username,''))); v_email text:=lower(trim(coalesce(p_email,''))); v_hash text;
begin
  if v_username !~ '^[a-z0-9_]{3,24}$' or v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' or char_length(coalesce(p_temporary_password,''))<>8 then
    return jsonb_build_object('ok',false,'message','Username or password is incorrect.');
  end if;
  select * into v_app from public.crew_audition_applications where username=v_username and lower(email)=v_email and application_status='selected' and credentials_sent_at is not null and auth_id is null for update;
  if not found then return jsonb_build_object('ok',false,'message','Username or password is incorrect.'); end if;
  if v_app.credential_locked_until is not null and v_app.credential_locked_until>now() then return jsonb_build_object('ok',false,'message','Too many attempts. Try again in 15 minutes.'); end if;
  v_hash:=encode(extensions.digest(p_temporary_password,'sha256'),'hex');
  if v_hash is distinct from v_app.temporary_password_sha256 then
    update public.crew_audition_applications set credential_attempts=credential_attempts+1,credential_locked_until=case when credential_attempts+1>=5 then now()+interval '15 minutes' else null end where id=v_app.id;
    return jsonb_build_object('ok',false,'message','Username or password is incorrect.');
  end if;
  update public.crew_audition_applications set credential_attempts=0,credential_locked_until=null,credential_verified_at=now() where id=v_app.id;
  return jsonb_build_object('ok',true,'application_id',v_app.id,'name',v_app.name,'email',v_app.email);
end;
$function$;

create or replace function public.crew_audition_claim_credentials(p_application_id uuid)
returns jsonb language plpgsql security definer
set search_path to 'pg_catalog','public','auth'
as $function$
declare v_app public.crew_audition_applications%rowtype; v_profile public.crew_profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in to activate your selected member account.'; end if;
  select * into v_app from public.crew_audition_applications where id=p_application_id and application_status='selected' and auth_id is null and credential_verified_at is not null and credential_verified_at>now()-interval '24 hours' for update;
  if not found then raise exception 'Your selected member credentials could not be verified or have expired. Start again from the selection email.'; end if;
  select * into v_profile from public.crew_profiles where auth_id=auth.uid()::text for update;
  if not found then raise exception 'Your sign-up profile is not ready. Verify your email and try again.'; end if;
  if lower(v_profile.email)<>lower(v_app.email) or lower(coalesce(v_profile.username,''))<>lower(v_app.username) then raise exception 'The sign-up email and username must match the credentials sent to you.'; end if;
  update public.crew_profiles set name=v_app.name,role='member',approval_status='approved',approval_requested_at=now(),approved_at=now(),approved_by=null,must_change_password=true,password_change_required_since=now() where auth_id=auth.uid()::text;
  update public.crew_audition_applications set auth_id=auth.uid()::text,temporary_password_sha256=null,credential_attempts=0,credential_locked_until=null,credential_verified_at=null,updated_at=now() where id=p_application_id;
  return jsonb_build_object('ok',true,'message','Your Kinetic Crew Member account is activated. Change your temporary password to continue.');
end;
$function$;

grant execute on function public.crew_audition_submit(text,text,text,jsonb,text) to anon,authenticated;
grant execute on function public.crew_audition_track_status(text) to anon,authenticated;
grant execute on function public.crew_audition_review(uuid,text) to authenticated;
grant execute on function public.crew_audition_prepare_credentials(uuid,text,text) to authenticated;
grant execute on function public.crew_audition_verify_credentials(text,text,text) to anon,authenticated;
grant execute on function public.crew_audition_claim_credentials(uuid) to authenticated;
