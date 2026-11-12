create table if not exists public.crew_profile_login_days (
  auth_id text not null references public.crew_profiles(auth_id) on delete cascade,
  login_day date not null,
  created_at timestamptz not null default now(),
  primary key (auth_id, login_day)
);
alter table public.crew_profile_login_days enable row level security;
revoke all on public.crew_profile_login_days from anon, authenticated;

create or replace function public.crew_profile_login_touch()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_uid text;
  v_day date;
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  v_uid := auth.uid()::text;
  v_day := (now() at time zone 'Asia/Kolkata')::date;
  insert into public.crew_profile_login_days(auth_id, login_day)
  values (v_uid, v_day)
  on conflict (auth_id, login_day) do nothing;
  return jsonb_build_object('recorded', true, 'login_day', v_day);
end;
$$;
revoke all on function public.crew_profile_login_touch() from public, anon;
grant execute on function public.crew_profile_login_touch() to authenticated;

create or replace function public.crew_profile_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_uid text;
  v_today date;
  v_current integer := 0;
  v_longest integer := 0;
  v_latest date;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  v_uid := auth.uid()::text;
  v_today := (now() at time zone 'Asia/Kolkata')::date;

  with days as (
    select login_day
    from public.crew_profile_login_days
    where auth_id = v_uid
  ), ranked as (
    select login_day, row_number() over(order by login_day)::integer as rn
    from days
  ), islands as (
    select login_day, login_day - rn as grp
    from ranked
  ), streak_groups as (
    select grp, count(*)::integer as day_count, max(login_day) as max_day
    from islands
    group by grp
  )
  select coalesce(max(day_count),0),
         coalesce(max(day_count) filter(where max_day = (select max(login_day) from days)),0),
         (select max(login_day) from days)
  into v_longest, v_current, v_latest
  from streak_groups;

  if v_latest is null or v_latest < v_today - 1 then v_current := 0; end if;

  select jsonb_build_object(
    'followers_count', (select count(*)::integer from public.crew_profile_follows where followed_id = v_uid),
    'following_count', (select count(*)::integer from public.crew_profile_follows where follower_id = v_uid),
    'posts_count', (select count(*)::integer from public.crew_social_posts where author_id = v_uid),
    'posts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'caption', p.caption, 'link_url', p.link_url, 'created_at', p.created_at
      ) order by p.created_at desc)
      from (
        select id, caption, link_url, created_at
        from public.crew_social_posts
        where author_id = v_uid
        order by created_at desc
        limit 8
      ) p
    ), '[]'::jsonb),
    'registered_count', (select count(*)::integer from public.crew_registrations where member_id = v_uid),
    'registrations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.event_id, 'title', q.title, 'starts_at', q.starts_at,
        'location', q.location, 'registered_at', q.registered_at
      ) order by q.starts_at desc)
      from (
        select r.event_id, r.registered_at, e.title, e.starts_at, e.location
        from public.crew_registrations r
        join public.crew_events e on e.id = r.event_id
        where r.member_id = v_uid
        order by e.starts_at desc
        limit 8
      ) q
    ), '[]'::jsonb),
    'login_streak', v_current,
    'longest_login_streak', v_longest,
    'last_login_day', v_latest
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.crew_profile_dashboard() from public, anon;
grant execute on function public.crew_profile_dashboard() to authenticated;

notify pgrst, 'reload schema';