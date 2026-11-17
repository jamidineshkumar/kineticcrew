create or replace view public.crew_public_founder_profile with (security_barrier=true) as
select p.name,p.username,p.avatar_url,coalesce(nullif(p.crew_title,''),'Founder & President') as title,p.instagram_username
from public.crew_profiles p
where p.role='super_admin' and p.approval_status='approved'
order by p.created_at asc
limit 1;
grant select on public.crew_public_founder_profile to anon,authenticated;
revoke all on function public.crew_kc_connect_public_info() from public,anon,authenticated;
create index if not exists crew_reward_catalog_created_by_idx on public.crew_reward_catalog(created_by);
create index if not exists crew_reward_redemptions_reward_idx on public.crew_reward_redemptions(reward_id);
create index if not exists crew_reward_redemptions_reviewed_by_idx on public.crew_reward_redemptions(reviewed_by);
create index if not exists crew_reward_points_transactions_actor_idx on public.crew_reward_points_transactions(actor_id);
notify pgrst,'reload schema';