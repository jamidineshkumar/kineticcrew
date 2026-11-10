CREATE OR REPLACE FUNCTION public.crew_features(p_action text, p_feature text DEFAULT NULL::text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
AS $function$
declare
  v_uid text; v_role text; v_feature text; v_action text; v_title text; v_body text;
  v_id uuid; v_item public.crew_feature_items%rowtype; v_status text;
  v_data jsonb; v_rows jsonb; v_votes jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  v_uid:=auth.uid()::text;
  select role into v_role from public.crew_profiles where auth_id=v_uid;
  if v_role is null then raise exception 'Crew profile not found.'; end if;
  v_action:=lower(trim(coalesce(p_action,'')));
  v_feature:=lower(trim(coalesce(p_feature,p_payload->>'feature','')));
  v_feature:=case v_feature
    when 'leave request' then 'leave'
    when 'leave requests' then 'leave'
    when 'kc memories' then 'memories'
    when 'audition portal' then 'auditions'
    when 'polls & voting' then 'polls'
    when 'crew chat' then 'chat'
    when 'crew expenses' then 'expenses'
    when 'crew achievements' then 'achievements'
    when 'crew rehearsals' then 'rehearsals'
    else v_feature
  end;
  if v_action<>'leaderboard' and v_feature not in ('rehearsals','leave','expenses','memories','auditions','polls','chat','achievements') then
    raise exception 'Unknown Kinetic Crew feature (feature=%; action=%).',v_feature,v_action;
  end if;

  if v_action='list' then
    if v_feature in ('expenses','auditions') and v_role='member' then
      -- Members may view published records, not private administrative data.
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',i.id,'feature',i.feature,'title',i.title,'body',i.body,'data',i.data,
        'status',i.status,'author_id',i.author_id,'created_at',i.created_at,
        'author_name',p.name,'vote_count',(select count(*)::int from public.crew_feature_votes v where v.item_id=i.id)
      ) order by i.created_at desc),'[]'::jsonb) into v_rows
      from public.crew_feature_items i join public.crew_profiles p on p.auth_id=i.author_id
      where i.feature=v_feature and (i.status in ('open','selected','closed') or i.author_id=v_uid);
    elsif v_feature in ('leave','auditions') and v_role='member' then
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',i.id,'feature',i.feature,'title',i.title,'body',i.body,'data',i.data,
        'status',i.status,'author_id',i.author_id,'created_at',i.created_at,
        'author_name',p.name
      ) order by i.created_at desc),'[]'::jsonb) into v_rows
      from public.crew_feature_items i join public.crew_profiles p on p.auth_id=i.author_id
      where i.feature=v_feature and i.author_id=v_uid;
    else
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',i.id,'feature',i.feature,'title',i.title,'body',i.body,'data',i.data,
        'status',i.status,'author_id',i.author_id,'created_at',i.created_at,
        'author_name',p.name,'vote_count',(select count(*)::int from public.crew_feature_votes v where v.item_id=i.id)
      ) order by i.created_at desc),'[]'::jsonb) into v_rows
      from public.crew_feature_items i join public.crew_profiles p on p.auth_id=i.author_id
      where i.feature=v_feature and (v_role<>'member' or i.feature not in ('chat') or i.created_at>now()-interval '90 days');
    end if;
    return v_rows;
  end if;

  if v_action='leaderboard' then
    select coalesce(jsonb_agg(jsonb_build_object('name',p.name,'role',p.role,'event_count',(select count(*)::int from public.crew_registrations r where r.member_id=p.auth_id),'attendance_count',(select count(*)::int from public.crew_attendance a where a.member_id=p.auth_id)) order by (select count(*) from public.crew_attendance a where a.member_id=p.auth_id) desc,(select count(*) from public.crew_registrations r where r.member_id=p.auth_id) desc,p.name),'[]'::jsonb)
    into v_rows from public.crew_profiles p;
    return v_rows;
  end if;

  if v_action='create' then
    if v_feature in ('expenses','achievements') and v_role='member' then
      raise exception 'Admin access required for this action.';
    end if;
    v_title:=left(trim(coalesce(p_payload->>'title','')),160);
    v_body:=left(trim(coalesce(p_payload->>'body','')),5000);
    v_data:=coalesce(p_payload->'data','{}'::jsonb);
    if v_title='' then raise exception 'A title is required.'; end if;
    if v_feature='leave' then
      insert into public.crew_feature_items(feature,title,body,data,status,author_id)
      values(v_feature,v_title,v_body,v_data,'pending',v_uid) returning * into v_item;
    elsif v_feature='auditions' then
      insert into public.crew_feature_items(feature,title,body,data,status,author_id)
      values(v_feature,v_title,v_body,v_data,'open',v_uid) returning * into v_item;
    else
      insert into public.crew_feature_items(feature,title,body,data,status,author_id)
      values(v_feature,v_title,v_body,v_data,'open',v_uid) returning * into v_item;
    end if;
    return jsonb_build_object('id',v_item.id,'message','Saved successfully.');
  end if;

  if v_action='vote' then
    if v_feature<>'polls' then raise exception 'Voting is only available for polls.'; end if;
    v_id:=(p_payload->>'id')::uuid;
    v_title:=left(trim(coalesce(p_payload->>'choice','')),120);
    if v_title='' then raise exception 'Choose an option.'; end if;
    if not exists(select 1 from public.crew_feature_items where id=v_id and feature='polls' and status='open') then
      raise exception 'This poll is no longer open.';
    end if;
    insert into public.crew_feature_votes(item_id,voter_id,choice) values(v_id,v_uid,v_title)
    on conflict(item_id,voter_id) do update set choice=excluded.choice,created_at=now();
    return jsonb_build_object('message','Your vote has been recorded.');
  end if;

  if v_action='moderate' then
    if v_role not in ('admin','super_admin') then raise exception 'Admin access required.'; end if;
    v_id:=(p_payload->>'id')::uuid;
    v_status:=coalesce(p_payload->>'status','');
    if v_status not in ('approved','rejected','closed','selected','open') then raise exception 'Invalid status.'; end if;
    update public.crew_feature_items set status=v_status,updated_at=now()
    where id=v_id and feature=v_feature returning * into v_item;
    if not found then raise exception 'Item not found.'; end if;
    return jsonb_build_object('message','Status updated.');
  end if;

  if v_action='delete' then
    v_id:=(p_payload->>'id')::uuid;
    delete from public.crew_feature_items
    where id=v_id and feature=v_feature
      and (author_id=v_uid or v_role in ('admin','super_admin'));
    if not found then raise exception 'Item not found or you do not have permission.'; end if;
    return jsonb_build_object('message','Deleted successfully.');
  end if;

  if v_action='vote-results' then
    if v_feature<>'polls' then raise exception 'Invalid feature.'; end if;
    v_id:=(p_payload->>'id')::uuid;
    select coalesce(jsonb_agg(jsonb_build_object('choice',q.choice,'votes',q.n) order by q.n desc),'[]'::jsonb)
    into v_votes from (
      select choice,count(*)::int n from public.crew_feature_votes where item_id=v_id group by choice
    ) q;
    return v_votes;
  end if;
  raise exception 'Unsupported feature action.';
end;
$function$;
revoke all on function public.crew_features(text,text,jsonb) from public,anon;
grant execute on function public.crew_features(text,text,jsonb) to authenticated;
notify pgrst,'reload schema';