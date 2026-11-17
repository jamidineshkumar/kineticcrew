create table if not exists public.crew_referral_codes (
  user_id text primary key references public.crew_profiles(auth_id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);
create table if not exists public.crew_referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id text not null references public.crew_profiles(auth_id) on delete cascade,
  referral_code text not null references public.crew_referral_codes(code),
  referred_application_id uuid not null unique references public.crew_audition_applications(id) on delete cascade,
  referred_email text not null,
  referred_name text not null default '',
  status text not null default 'pending' check (status in ('pending','approved')),
  created_at timestamptz not null default now(),
  approved_at timestamptz
);
create index if not exists crew_referrals_referrer_created_idx on public.crew_referrals(referrer_id,created_at desc);
create index if not exists crew_referrals_email_idx on public.crew_referrals(lower(referred_email));
create table if not exists public.crew_referral_reward_ledger (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null unique references public.crew_referrals(id) on delete cascade,
  user_id text not null references public.crew_profiles(auth_id) on delete cascade,
  points integer not null default 100 check (points > 0),
  reason text not null default 'approved_referral',
  created_at timestamptz not null default now()
);
create index if not exists crew_referral_reward_user_idx on public.crew_referral_reward_ledger(user_id,created_at desc);
alter table public.crew_referral_codes enable row level security;
alter table public.crew_referrals enable row level security;
alter table public.crew_referral_reward_ledger enable row level security;
revoke all on public.crew_referral_codes,public.crew_referrals,public.crew_referral_reward_ledger from anon,authenticated;
grant all on public.crew_referral_codes,public.crew_referrals,public.crew_referral_reward_ledger to service_role;
create or replace function public.crew_referral_capture_application()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_code text; v_referrer text;
begin
  v_code:=upper(trim(coalesce(new.application_data->>'referralCode','')));
  if v_code='' then return new; end if;
  select c.user_id into v_referrer from public.crew_referral_codes c
  join public.crew_profiles p on p.auth_id=c.user_id
  where c.code=v_code and p.approval_status='approved' and lower(p.email)<>lower(new.email) limit 1;
  if v_referrer is null then return new; end if;
  insert into public.crew_referrals(referrer_id,referral_code,referred_application_id,referred_email,referred_name)
  values(v_referrer,v_code,new.id,lower(new.email),new.name)
  on conflict (referred_application_id) do nothing;
  return new;
end;
$$;
drop trigger if exists crew_referral_capture_application on public.crew_audition_applications;
create trigger crew_referral_capture_application after insert on public.crew_audition_applications
for each row execute function public.crew_referral_capture_application();
create or replace function public.crew_referral_credit_approved_member()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_referral record;
begin
  if new.approval_status is distinct from 'approved' then return new; end if;
  for v_referral in
    update public.crew_referrals set status='approved',approved_at=coalesce(approved_at,now())
    where lower(referred_email)=lower(new.email) and referrer_id<>new.auth_id and status='pending'
    returning id,referrer_id
  loop
    insert into public.crew_referral_reward_ledger(referral_id,user_id,points,reason)
    values(v_referral.id,v_referral.referrer_id,100,'approved_referral') on conflict (referral_id) do nothing;
  end loop;
  return new;
end;
$$;
drop trigger if exists crew_referral_credit_approved_member on public.crew_profiles;
create trigger crew_referral_credit_approved_member after insert or update of approval_status,email on public.crew_profiles
for each row execute function public.crew_referral_credit_approved_member();
create or replace function public.crew_referral_get_dashboard()
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth,extensions as $$
declare v_uid text:=auth.uid()::text; v_role text; v_code text; v_attempt integer:=0;
v_total integer; v_approved integer; v_points integer; v_badges jsonb:='[]'::jsonb; v_referrals jsonb:='[]'::jsonb;
begin
  if v_uid is null then raise exception 'Sign in required.'; end if;
  select role into v_role from public.crew_profiles where auth_id=v_uid and approval_status='approved';
  if not found then raise exception 'Approved Kinetic Crew membership required.'; end if;
  select code into v_code from public.crew_referral_codes where user_id=v_uid;
  if v_code is null then
    loop
      v_attempt:=v_attempt+1;
      if v_attempt>8 then raise exception 'Could not generate a unique referral code. Please retry.'; end if;
      v_code:='KC-'||upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,10));
      begin
        insert into public.crew_referral_codes(user_id,code) values(v_uid,v_code); exit;
      exception when unique_violation then
        select code into v_code from public.crew_referral_codes where user_id=v_uid;
        if v_code is not null then exit; end if;
      end;
    end loop;
  end if;
  select count(*),count(*) filter(where status='approved') into v_total,v_approved
    from public.crew_referrals where referrer_id=v_uid;
  select coalesce(sum(points),0)::integer into v_points from public.crew_referral_reward_ledger where user_id=v_uid;
  if v_approved>=1 then v_badges:=v_badges||jsonb_build_array(jsonb_build_object('id','connector','label','KC Connector','threshold',1)); end if;
  if v_approved>=3 then v_badges:=v_badges||jsonb_build_array(jsonb_build_object('id','influencer','label','KC Influencer','threshold',3)); end if;
  if v_approved>=5 then v_badges:=v_badges||jsonb_build_array(jsonb_build_object('id','ambassador','label','KC Ambassador','threshold',5)); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'name',r.referred_name,'status',r.status,'created_at',r.created_at,'approved_at',r.approved_at) order by r.created_at desc),'[]'::jsonb)
    into v_referrals from (select * from public.crew_referrals where referrer_id=v_uid order by created_at desc limit 30) r;
  return jsonb_build_object('ok',true,'code',v_code,'total_referrals',v_total,'approved_referrals',v_approved,'points',v_points,'badges',v_badges,'referrals',v_referrals);
end;
$$;
create or replace function public.crew_referral_resolve_code(p_code text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_name text; v_code text;
begin
  v_code:=upper(trim(coalesce(p_code,'')));
  if v_code !~ '^KC-[A-F0-9]{10}$' then return jsonb_build_object('ok',false,'message','This referral link is invalid.'); end if;
  select p.name into v_name from public.crew_referral_codes c join public.crew_profiles p on p.auth_id=c.user_id
  where c.code=v_code and p.approval_status='approved';
  if v_name is null then return jsonb_build_object('ok',false,'message','This referral link is no longer active.'); end if;
  return jsonb_build_object('ok',true,'code',v_code,'referrer_name',v_name);
end;
$$;
revoke all on function public.crew_referral_capture_application() from public,anon,authenticated;
revoke all on function public.crew_referral_credit_approved_member() from public,anon,authenticated;
revoke all on function public.crew_referral_get_dashboard() from public,anon;
revoke all on function public.crew_referral_resolve_code(text) from public;
grant execute on function public.crew_referral_get_dashboard() to authenticated;
grant execute on function public.crew_referral_resolve_code(text) to anon,authenticated;
notify pgrst,'reload schema';