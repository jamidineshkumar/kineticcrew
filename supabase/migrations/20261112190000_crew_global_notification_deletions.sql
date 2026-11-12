create table if not exists public.crew_notification_deletions (
 notice_type text not null check (notice_type in ('announcement','event','post')),
 source_id text not null,
 deleted_by text not null,
 deleted_at timestamptz not null default now(),
 primary key (notice_type,source_id)
);
alter table public.crew_notification_deletions enable row level security;
drop policy if exists "Authenticated users read global notification deletions" on public.crew_notification_deletions;
create policy "Authenticated users read global notification deletions"
 on public.crew_notification_deletions for select to authenticated using (true);
drop policy if exists "Admins globally delete notifications" on public.crew_notification_deletions;
create policy "Admins globally delete notifications"
 on public.crew_notification_deletions for insert to authenticated
 with check (
   deleted_by=(select auth.uid())::text
   and exists(select 1 from public.crew_profiles p where p.auth_id=(select auth.uid())::text and p.role in ('admin','super_admin'))
 );
grant select,insert on public.crew_notification_deletions to authenticated;