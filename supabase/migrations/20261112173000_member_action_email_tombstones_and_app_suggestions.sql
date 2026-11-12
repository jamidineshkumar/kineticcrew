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
