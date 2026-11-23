create or replace function public.crew_audition_admin_delete_application(p_application_id uuid)
returns jsonb language plpgsql security definer
set search_path to 'pg_catalog','public','auth'
as $function$
declare
  v_role text;
  v_app public.crew_audition_applications%rowtype;
  v_profile_role text;
  v_profile_status text;
  v_target_auth_id text;
  v_email_hash text;
begin
  perform public.crew_assert_not_blocked();
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  select role into v_role from public.crew_profiles where auth_id=auth.uid()::text and approval_status='approved';
  if coalesce(v_role,'') not in ('admin','super_admin') then raise exception 'Admin access required.'; end if;
  select * into v_app from public.crew_audition_applications where id=p_application_id for update;
  if not found then raise exception 'Application not found.'; end if;

  v_email_hash:=encode(extensions.digest(lower(trim(coalesce(v_app.email,''))),'sha256'),'hex');
  v_target_auth_id:=nullif(v_app.auth_id,'');
  if v_target_auth_id is null and nullif(trim(v_app.email),'') is not null then
    select auth_id,role,approval_status into v_target_auth_id,v_profile_role,v_profile_status
    from public.crew_profiles
    where lower(trim(email))=lower(trim(v_app.email)) and approval_status='rejected' and role='member'
    order by created_at desc limit 1 for update;
  elsif v_target_auth_id is not null then
    select role,approval_status into v_profile_role,v_profile_status
    from public.crew_profiles where auth_id=v_target_auth_id for update;
  end if;

  if nullif(v_target_auth_id,'') is not null then
    if v_profile_role in ('admin','super_admin') then raise exception 'Cannot delete an Admin or Super Admin account from audition management.'; end if;
    update public.crew_app_releases set published_by=null where published_by=v_target_auth_id;
    update public.crew_app_settings set updated_by=null where updated_by=v_target_auth_id;
    delete from public.crew_attendance_audit where changed_by=v_target_auth_id or member_id=v_target_auth_id;
    update public.crew_event_finalizations set finalized_by=null where finalized_by=v_target_auth_id;
    update public.crew_reward_catalog set created_by=null where created_by=v_target_auth_id;
    delete from public.crew_reward_points_transactions where user_id=v_target_auth_id;
    update public.crew_reward_points_transactions set actor_id=null where actor_id=v_target_auth_id;
    delete from public.crew_reward_redemptions where user_id=v_target_auth_id;
    update public.crew_reward_redemptions set reviewed_by=null where reviewed_by=v_target_auth_id;
    delete from public.crew_profile_login_days where auth_id=v_target_auth_id;
    delete from public.crew_push_tokens where auth_id=v_target_auth_id;
    delete from public.crew_pending_push_alerts where auth_id=v_target_auth_id;
    delete from public.crew_intro_seen where auth_id=v_target_auth_id;
    delete from public.crew_profile_documents where auth_id=v_target_auth_id::uuid;
    delete from public.crew_profile_reminders where recipient_auth_id=v_target_auth_id or created_by=v_target_auth_id;
    delete from public.crew_profile_follows where follower_id=v_target_auth_id or followed_id=v_target_auth_id;
    delete from public.crew_member_favorites where owner_auth_id=v_target_auth_id or favorite_auth_id=v_target_auth_id;
    delete from public.crew_member_blocks where blocked_auth_id=v_target_auth_id or blocked_by=v_target_auth_id;
    delete from public.crew_direct_messages where sender_id=v_target_auth_id or recipient_id=v_target_auth_id;
    delete from public.kg_messages where sender_id=v_target_auth_id;
    delete from public.crew_social_posts where author_id=v_target_auth_id;
    delete from public.crew_social_stories where author_id=v_target_auth_id;
    delete from public.crew_app_suggestions where author_id=v_target_auth_id;
    delete from public.crew_feature_items where author_id=v_target_auth_id;
    delete from public.crew_announcements where author_id=v_target_auth_id;
    delete from public.crew_registrations where member_id=v_target_auth_id;
    delete from public.crew_rehearsal_registrations where member_id=v_target_auth_id;
    delete from public.crew_attendance where member_id=v_target_auth_id;
    delete from public.crew_otps where member_id=v_target_auth_id;
    delete from public.crew_wardrobe_items where created_by=v_target_auth_id;
    delete from public.crew_more_ads where created_by=v_target_auth_id;
    delete from public.crew_ad_campaigns where created_by=v_target_auth_id;
    delete from public.kg_communities where created_by=v_target_auth_id;
    delete from public.kg_conversations where created_by=v_target_auth_id;
    delete from public.crew_profiles where auth_id=v_target_auth_id;
  end if;

  delete from public.crew_audition_push_events where application_id=v_app.id;
  delete from public.crew_audition_review_history where application_id=v_app.id;
  delete from public.crew_referrals where referred_application_id=v_app.id;
  delete from public.crew_email_delivery_log
    where lower(recipient_email)=lower(trim(coalesce(v_app.email,'')))
      and (idempotency_key like 'audition-%' or idempotency_key like '%'||v_app.id::text||'%');
  delete from public.crew_audition_rejection_tombstones
    where (v_target_auth_id is not null and auth_id=v_target_auth_id) or email_sha256=v_email_hash;
  delete from public.crew_audition_applications where id=p_application_id;

  return jsonb_build_object('ok',true,'application_id',v_app.id,'auth_id',v_target_auth_id,
    'video_storage_path',v_app.video_storage_path,'account_deleted',v_target_auth_id is not null,
    'message','Application, account-owned records, audition email history, and review history deleted.');
end;
$function$;
revoke all on function public.crew_audition_admin_delete_application(uuid) from public;
grant execute on function public.crew_audition_admin_delete_application(uuid) to authenticated;
