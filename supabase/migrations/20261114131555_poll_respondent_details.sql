create or replace function public.crew_poll_respondents(p_poll_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_uid text;
  v_role text;
  v_author text;
  v_rows jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  v_uid := auth.uid()::text;
  select role into v_role from public.crew_profiles where auth_id = v_uid;
  select author_id into v_author from public.crew_feature_items where id = p_poll_id and feature = 'polls';
  if v_author is null then raise exception 'Poll not found.'; end if;
  if v_role not in ('admin', 'super_admin') and v_author <> v_uid then
    raise exception 'Only the poll creator or a crew admin can view respondent details.';
  end if;
  select coalesce(
    jsonb_agg(jsonb_build_object('name', p.name, 'choice', v.choice, 'created_at', v.created_at) order by v.created_at desc),
    '[]'::jsonb
  ) into v_rows
  from public.crew_feature_votes v
  join public.crew_profiles p on p.auth_id = v.voter_id
  where v.item_id = p_poll_id;
  return v_rows;
end;
$$;
revoke all on function public.crew_poll_respondents(uuid) from public, anon;
grant execute on function public.crew_poll_respondents(uuid) to authenticated;
