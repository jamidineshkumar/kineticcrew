create table if not exists public.crew_notification_dismissals (
 user_id text not null,
 notice_type text not null check (notice_type in ('announcement','event','post')),
 source_id text not null,
 dismissed_at timestamptz not null default now(),
 primary key (user_id,notice_type,source_id)
);
alter table public.crew_notification_dismissals enable row level security;
drop policy if exists "Members read own notification dismissals" on public.crew_notification_dismissals;
create policy "Members read own notification dismissals"
 on public.crew_notification_dismissals for select to authenticated
 using (user_id=(select auth.uid())::text);
drop policy if exists "Members dismiss own notifications" on public.crew_notification_dismissals;
create policy "Members dismiss own notifications"
 on public.crew_notification_dismissals for insert to authenticated
 with check (user_id=(select auth.uid())::text);
grant select,insert on public.crew_notification_dismissals to authenticated;