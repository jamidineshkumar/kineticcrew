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

-- Permanent email tombstones: only an account that was blocked before deletion
-- receives a permanent ban on registering again with the same email.
create table if not exists public.crew_permanent_email_blocks (
 email_sha256 text primary key check (email_sha256 ~ '^[a-f0-9]{64}$'),
 reason text not null default 'blocked_then_deleted',
 created_at timestamptz not null default now(),
 created_by text
);
alter table public.crew_permanent_email_blocks enable row level security;
revoke all on public.crew_permanent_email_blocks from anon, authenticated;

create or replace function public.crew_handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public','extensions'
as $function$
declare v_username text; v_name text; v_email_hash text;
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
 insert into public.crew_profiles(auth_id,email,name,username,role)
 values(new.id::text,lower(new.email),coalesce(nullif(v_name,''),'Crew member'),v_username,'member')
 on conflict(auth_id) do update set email=excluded.email,name=excluded.name,username=excluded.username;
 return new;
end;
$function$;

create table if not exists public.crew_app_suggestions (
 id uuid primary key default gen_random_uuid(),
 author_id text not null references public.crew_profiles(auth_id) on delete cascade,
 category text not null default 'feature' check(category in ('feature','bug','design','performance','other')),
 title text not null check(char_length(trim(title)) between 3 and 120),
 details text not null check(char_length(trim(details)) between 10 and 3000),
 status text not null default 'new' check(status in ('new','reviewing','planned','implemented','declined')),
 admin_note text not null default '',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists crew_app_suggestions_created_idx on public.crew_app_suggestions(created_at desc);
alter table public.crew_app_suggestions enable row level security;
drop policy if exists "Members submit own app suggestions" on public.crew_app_suggestions;
create policy "Members submit own app suggestions" on public.crew_app_suggestions for insert to authenticated
 with check(author_id=(select auth.uid())::text);
drop policy if exists "Members read own app suggestions" on public.crew_app_suggestions;
create policy "Members read own app suggestions" on public.crew_app_suggestions for select to authenticated
 using(author_id=(select auth.uid())::text);
drop policy if exists "Admins read all app suggestions" on public.crew_app_suggestions;
create policy "Admins read all app suggestions" on public.crew_app_suggestions for select to authenticated
 using(exists(select 1 from public.crew_profiles p where p.auth_id=(select auth.uid())::text and p.role in ('admin','super_admin')));
drop policy if exists "Admins update app suggestions" on public.crew_app_suggestions;
create policy "Admins update app suggestions" on public.crew_app_suggestions for update to authenticated
 using(exists(select 1 from public.crew_profiles p where p.auth_id=(select auth.uid())::text and p.role in ('admin','super_admin')))
 with check(exists(select 1 from public.crew_profiles p where p.auth_id=(select auth.uid())::text and p.role in ('admin','super_admin')));
grant select,insert on public.crew_app_suggestions to authenticated;
grant update(status,admin_note,updated_at) on public.crew_app_suggestions to authenticated;
