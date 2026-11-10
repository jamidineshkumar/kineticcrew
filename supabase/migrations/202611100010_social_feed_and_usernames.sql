-- Kinetic Crew social feed, like/comment interactions and live username availability checks.

create table if not exists public.crew_social_posts (
  id uuid primary key default gen_random_uuid(),
  author_id text not null references public.crew_profiles(auth_id) on delete cascade,
  link_url text not null check (link_url ~* '^https://[^[:space:]]+$'),
  caption text not null default '' check (char_length(caption) <= 1200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crew_social_posts_created_idx on public.crew_social_posts(created_at desc);
create index if not exists crew_social_posts_author_idx on public.crew_social_posts(author_id,created_at desc);
alter table public.crew_social_posts enable row level security;
revoke all on public.crew_social_posts from public,anon,authenticated;
grant select,insert,update,delete on public.crew_social_posts to authenticated;
drop policy if exists "Crew can view social posts" on public.crew_social_posts;
create policy "Crew can view social posts" on public.crew_social_posts for select to authenticated using ((select auth.uid()) is not null);
drop policy if exists "Members create own social posts" on public.crew_social_posts;
create policy "Members create own social posts" on public.crew_social_posts for insert to authenticated with check (author_id=(select auth.uid())::text);
drop policy if exists "Authors update social posts" on public.crew_social_posts;
create policy "Authors update social posts" on public.crew_social_posts for update to authenticated using (author_id=(select auth.uid())::text) with check (author_id=(select auth.uid())::text);
drop policy if exists "Authors or admins delete social posts" on public.crew_social_posts;
create policy "Authors or admins delete social posts" on public.crew_social_posts for delete to authenticated using (author_id=(select auth.uid())::text or public.crew_wardrobe_is_admin());

create table if not exists public.crew_social_likes (
  post_id uuid not null references public.crew_social_posts(id) on delete cascade,
  user_id text not null references public.crew_profiles(auth_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(post_id,user_id)
);
create index if not exists crew_social_likes_post_idx on public.crew_social_likes(post_id);
alter table public.crew_social_likes enable row level security;
revoke all on public.crew_social_likes from public,anon,authenticated;
grant select,insert,delete on public.crew_social_likes to authenticated;
drop policy if exists "Crew can view social likes" on public.crew_social_likes;
create policy "Crew can view social likes" on public.crew_social_likes for select to authenticated using ((select auth.uid()) is not null);
drop policy if exists "Members like as themselves" on public.crew_social_likes;
create policy "Members like as themselves" on public.crew_social_likes for insert to authenticated with check (user_id=(select auth.uid())::text);
drop policy if exists "Members remove own likes" on public.crew_social_likes;
create policy "Members remove own likes" on public.crew_social_likes for delete to authenticated using (user_id=(select auth.uid())::text);

create table if not exists public.crew_social_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.crew_social_posts(id) on delete cascade,
  user_id text not null references public.crew_profiles(auth_id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 800),
  created_at timestamptz not null default now()
);
create index if not exists crew_social_comments_post_idx on public.crew_social_comments(post_id,created_at);
alter table public.crew_social_comments enable row level security;
revoke all on public.crew_social_comments from public,anon,authenticated;
grant select,insert,delete on public.crew_social_comments to authenticated;
drop policy if exists "Crew can view social comments" on public.crew_social_comments;
create policy "Crew can view social comments" on public.crew_social_comments for select to authenticated using ((select auth.uid()) is not null);
drop policy if exists "Members comment as themselves" on public.crew_social_comments;
create policy "Members comment as themselves" on public.crew_social_comments for insert to authenticated with check (user_id=(select auth.uid())::text);
drop policy if exists "Authors or admins delete social comments" on public.crew_social_comments;
create policy "Authors or admins delete social comments" on public.crew_social_comments for delete to authenticated using (user_id=(select auth.uid())::text or public.crew_wardrobe_is_admin());

create or replace function public.crew_check_username(p_username text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_username text:=lower(trim(coalesce(p_username,''))); v_uid text:=auth.uid()::text; v_taken boolean;
begin
 if v_username !~ '^[a-z0-9_]{3,24}$' then
  return jsonb_build_object('valid',false,'available',false,'message','Username must be 3–24 characters using letters, numbers or underscores.');
 end if;
 select exists(select 1 from public.crew_profiles p where lower(p.username)=v_username and (v_uid is null or p.auth_id<>v_uid)) into v_taken;
 return jsonb_build_object('valid',true,'available',not v_taken,'message',case when v_taken then 'Username already taken.' else 'Username is available.' end);
end;
$$;
revoke all on function public.crew_check_username(text) from public,anon;
grant execute on function public.crew_check_username(text) to anon,authenticated;
notify pgrst,'reload schema';
