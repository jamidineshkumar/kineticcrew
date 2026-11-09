-- Kinetic Crew feature suite: rehearsals, leave, expenses, memories, auditions,
-- polls, chat, achievements, calendar metadata and crew activity.
create table if not exists public.crew_feature_items (
  id uuid primary key default gen_random_uuid(),
  feature text not null check (feature in ('rehearsals','leave','expenses','memories','auditions','polls','chat','achievements')),
  title text not null check (char_length(title) between 1 and 160),
  body text not null default '',
  data jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open','approved','rejected','closed','selected','pending')),
  author_id text not null references public.crew_profiles(auth_id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crew_feature_items_feature_created_idx
  on public.crew_feature_items(feature,created_at desc);
create index if not exists crew_feature_items_author_idx
  on public.crew_feature_items(author_id,feature);
alter table public.crew_feature_items enable row level security;
revoke all on public.crew_feature_items from anon, authenticated;

create table if not exists public.crew_feature_votes (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.crew_feature_items(id) on delete cascade,
  voter_id text not null references public.crew_profiles(auth_id) on delete cascade,
  choice text not null check (char_length(choice) between 1 and 120),
  created_at timestamptz not null default now(),
  unique(item_id,voter_id)
);
alter table public.crew_feature_votes enable row level security;
revoke all on public.crew_feature_votes from anon, authenticated;

create or replace function public.crew_features(
  p_action text,
  p_feature text default null,
  p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer
set search_path=pg_catalog,public,auth,extensions
as $$
declare
  v_uid text; v_role text; v_feature text; v_title text; v_body text;
  v_id uuid; v_item public.crew_feature_items%rowtype; v_status text;
  v_data jsonb; v_rows jsonb; v_votes jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  v_uid:=auth.uid()::text;
  select role into v_role from public.crew_profiles where auth_id=v_uid;
  if v_role is null then raise exception 'Crew profile not found.'; end if;
  v_feature:=coalesce(p_feature,p_payload->>'feature','');
  if v_feature not in ('rehearsals','leave','expenses','memories','auditions','polls','chat','achievements') then
    raise exception 'Unknown Kinetic Crew feature.';
  end if;

  if p_action='list' then
    if v_feature in ('expenses','auditions') and v_role='member' then
      -- Members may view published records, not private administrative data.
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',i.id,'feature',i.feature,'title',i.title,'body',i.body,'data',i.data,
        'status',i.status,'author_id',i.author_id,'created_at',i.created_at,
        'author_name',p.name,'vote_count',(select count(*)::int from public.crew_feature_votes v where v.item_id=i.id)
      ) order by i.created_at desc),'[]'::jsonb) into v_rows
      from public.crew_feature_items i join public.crew_profiles p on p.auth_id=i.author_id
      where i.feature=v_feature and (i.status in ('open','selected','closed') or i.author_id=v_uid);
    elsif v_feature='leave' and v_role='member' then
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

  if p_action='create' then
    if v_feature in ('expenses','auditions','achievements') and v_role='member' then
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

  if p_action='vote' then
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

  if p_action='moderate' then
    if v_role not in ('admin','super_admin') then raise exception 'Admin access required.'; end if;
    v_id:=(p_payload->>'id')::uuid;
    v_status:=coalesce(p_payload->>'status','');
    if v_status not in ('approved','rejected','closed','selected','open') then raise exception 'Invalid status.'; end if;
    update public.crew_feature_items set status=v_status,updated_at=now()
    where id=v_id and feature=v_feature returning * into v_item;
    if not found then raise exception 'Item not found.'; end if;
    return jsonb_build_object('message','Status updated.');
  end if;

  if p_action='delete' then
    v_id:=(p_payload->>'id')::uuid;
    delete from public.crew_feature_items
    where id=v_id and feature=v_feature
      and (author_id=v_uid or v_role in ('admin','super_admin'));
    if not found then raise exception 'Item not found or you do not have permission.'; end if;
    return jsonb_build_object('message','Deleted successfully.');
  end if;

  if p_action='vote-results' then
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
$$;
revoke all on function public.crew_features(text,text,jsonb) from public,anon;
grant execute on function public.crew_features(text,text,jsonb) to authenticated;
notify pgrst,'reload schema';
