-- Allow approved crew members to view poll respondents and their selected options.
create or replace function public.crew_poll_respondents(p_poll_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_uid text;
  v_approval text;
  v_rows jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  v_uid := auth.uid()::text;
  select approval_status into v_approval from public.crew_profiles where auth_id = v_uid;
  if v_approval is distinct from 'approved' then
    raise exception 'Approved crew membership is required to view poll respondents.';
  end if;
  if not exists (select 1 from public.crew_feature_items where id = p_poll_id and feature = 'polls') then
    raise exception 'Poll not found.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'name', p.name,
    'choice', case when left(trim(v.choice), 1) = '['
      then (select string_agg(x.value, ' · ') from jsonb_array_elements_text(v.choice::jsonb) x)
      else v.choice end,
    'created_at', v.created_at
  ) order by v.created_at desc), '[]'::jsonb)
  into v_rows
  from public.crew_feature_votes v
  join public.crew_profiles p on p.auth_id = v.voter_id
  where v.item_id = p_poll_id;
  return v_rows;
end;
$$;
revoke all on function public.crew_poll_respondents(uuid) from public, anon;
grant execute on function public.crew_poll_respondents(uuid) to authenticated;

-- Remove a direct/group chat from the current member's inbox without deleting it for other members.
-- Transfer group ownership to the longest-standing remaining member when the owner leaves.
create or replace function public.kg_delete_conversation_for_self(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_uid text;
  v_kind text;
  v_role text;
  v_next_owner text;
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  v_uid := auth.uid()::text;
  select kind into v_kind from public.kg_conversations where id = p_conversation_id for update;
  if v_kind is null then raise exception 'Conversation not found.'; end if;
  if v_kind not in ('direct', 'group') then raise exception 'This conversation type cannot be deleted from the inbox.'; end if;
  select role into v_role from public.kg_conversation_members
    where conversation_id = p_conversation_id and user_id = v_uid for update;
  if v_role is null then raise exception 'You are no longer a member of this conversation.'; end if;
  if v_kind = 'group' and v_role = 'owner' then
    select user_id into v_next_owner from public.kg_conversation_members
      where conversation_id = p_conversation_id and user_id <> v_uid
      order by joined_at asc, user_id asc limit 1 for update;
    if v_next_owner is not null then
      update public.kg_conversation_members set role = 'owner'
      where conversation_id = p_conversation_id and user_id = v_next_owner;
    end if;
  end if;
  delete from public.kg_conversation_members where conversation_id = p_conversation_id and user_id = v_uid;
  if not exists (select 1 from public.kg_conversation_members where conversation_id = p_conversation_id) then
    delete from public.kg_conversations where id = p_conversation_id;
  end if;
  return jsonb_build_object('message', 'Conversation removed from your chats.');
end;
$$;
revoke all on function public.kg_delete_conversation_for_self(uuid) from public, anon;
grant execute on function public.kg_delete_conversation_for_self(uuid) to authenticated;

revoke all on function public.kg_create_group_chat(text, text, text[]) from public, anon;
grant execute on function public.kg_create_group_chat(text, text, text[]) to authenticated;
