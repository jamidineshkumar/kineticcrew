-- KC Connect: standardize the referral credit at 50 points.
-- Existing referral credits are adjusted as well so the dashboard and ledger agree.
update public.crew_referral_reward_ledger
set points = 50
where reason = 'approved_referral' and points <> 50;

alter table public.crew_referral_reward_ledger
  alter column points set default 50;

create or replace function public.crew_referral_credit_approved_member()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,auth as $$
declare v_referral record;
begin
  if new.approval_status is distinct from 'approved' then return new; end if;
  for v_referral in
    update public.crew_referrals
    set status='approved', approved_at=coalesce(approved_at,now())
    where lower(referred_email)=lower(new.email)
      and referrer_id<>new.auth_id
      and status='pending'
    returning id,referrer_id
  loop
    insert into public.crew_referral_reward_ledger(referral_id,user_id,points,reason)
    values(v_referral.id,v_referral.referrer_id,50,'approved_referral')
    on conflict (referral_id) do nothing;
  end loop;
  return new;
end;
$$;

revoke all on function public.crew_referral_credit_approved_member() from public,anon,authenticated;
notify pgrst,'reload schema';
