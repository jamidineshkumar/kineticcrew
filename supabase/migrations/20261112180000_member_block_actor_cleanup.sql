alter table public.crew_member_blocks drop constraint if exists crew_member_blocks_blocked_by_fkey;
alter table public.crew_member_blocks
 add constraint crew_member_blocks_blocked_by_fkey
 foreign key (blocked_by) references public.crew_profiles(auth_id) on delete cascade;