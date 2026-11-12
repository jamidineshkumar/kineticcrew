-- Member action ring: favorites, direct messages and account-level blocks.
create table if not exists public.crew_member_favorites (
  owner_auth_id text not null references public.crew_profiles(auth_id) on delete cascade,
  favorite_auth_id text not null references public.crew_profiles(auth_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_auth_id, favorite_auth_id),
  constraint crew_member_favorites_not_self check (owner_auth_id <> favorite_auth_id)
);
create index if not exists crew_member_favorites_owner_idx on public.crew_member_favorites(owner_auth_id, created_at desc);

create table if not exists public.crew_direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id text not null references public.crew_profiles(auth_id) on delete cascade,
  recipient_id text not null references public.crew_profiles(auth_id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint crew_direct_messages_not_self check (sender_id <> recipient_id)
);
create index if not exists crew_direct_messages_thread_idx on public.crew_direct_messages(sender_id, recipient_id, created_at desc);
create index if not exists crew_direct_messages_recipient_idx on public.crew_direct_messages(recipient_id, created_at desc);

create table if not exists public.crew_member_blocks (
  blocked_auth_id text primary key references public.crew_profiles(auth_id) on delete cascade,
  blocked_by text not null references public.crew_profiles(auth_id) on delete restrict,
  created_at timestamptz not null default now(),
  reason text not null default ''
);
create index if not exists crew_member_blocks_actor_idx on public.crew_member_blocks(blocked_by);

alter table public.crew_member_favorites enable row level security;
alter table public.crew_direct_messages enable row level security;
alter table public.crew_member_blocks enable row level security;

drop policy if exists "Members manage own favorites" on public.crew_member_favorites;
create policy "Members manage own favorites" on public.crew_member_favorites
 for all to authenticated
 using (owner_auth_id = (select auth.uid())::text)
 with check (owner_auth_id = (select auth.uid())::text);

drop policy if exists "Participants read direct messages" on public.crew_direct_messages;
create policy "Participants read direct messages" on public.crew_direct_messages
 for select to authenticated
 using (sender_id = (select auth.uid())::text or recipient_id = (select auth.uid())::text);

create or replace function public.crew_can_message(p_recipient_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $
  select auth.uid() is not null
    and p_recipient_id is not null
    and p_recipient_id <> auth.uid()::text
    and not exists (
      select 1 from public.crew_member_blocks b
      where b.blocked_auth_id in (auth.uid()::text, p_recipient_id)
    );
$;
revoke all on function public.crew_can_message(text) from public, anon;
grant execute on function public.crew_can_message(text) to authenticated;

drop policy if exists "Sender creates direct messages" on public.crew_direct_messages;
create policy "Sender creates direct messages" on public.crew_direct_messages
 for insert to authenticated
 with check (
   sender_id = (select auth.uid())::text
   and (select public.crew_can_message(recipient_id))
 );

-- Blocks are deliberately not directly readable or writable by app clients.
revoke all on public.crew_member_blocks from anon, authenticated;
grant select, insert, update, delete on public.crew_member_favorites to authenticated;
grant select, insert on public.crew_direct_messages to authenticated;

create or replace function public.crew_assert_not_blocked()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  if exists(select 1 from public.crew_member_blocks where blocked_auth_id=auth.uid()::text) then
    raise exception 'This Kinetic Crew account is blocked. Contact an administrator to restore access.';
  end if;
  return true;
end;
$$;
revoke all on function public.crew_assert_not_blocked() from public, anon;
grant execute on function public.crew_assert_not_blocked() to authenticated;
