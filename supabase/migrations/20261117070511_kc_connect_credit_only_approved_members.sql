create index if not exists crew_referrals_referral_code_idx on public.crew_referrals(referral_code);
create or replace function public.crew_referral_credit_approved_member()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare v_referral record;
begin
  if new.approval_status is distinct from 'approved' or new.role is distinct from 'member' then return new; end if;
  for v_referral in
    update public.crew_referrals
    set status='approved',approved_at=coalesce(approved_at,now())
    where lower(referred_email)=lower(new.email)
      and referrer_id<>new.auth_id
      and status='pending'
    returning id,referrer_id
  loop
    insert into public.crew_referral_reward_ledger(referral_id,user_id,points,reason)
    values(v_referral.id,v_referral.referrer_id,100,'approved_referral')
    on conflict (referral_id) do nothing;
  end loop;
  return new;
end;
$$;
drop trigger if exists crew_referral_credit_approved_member on public.crew_profiles;
create trigger crew_referral_credit_approved_member
after insert or update of approval_status,email,role on public.crew_profiles
for each row execute function public.crew_referral_credit_approved_member();