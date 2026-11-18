-- KC Connect compact referral codes and authoritative voucher inventory.
-- Old long invite URLs remain valid through a private alias table.
create table if not exists public.crew_referral_code_aliases (
  alias_code text primary key,
  user_id text not null references public.crew_profiles(auth_id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists crew_referral_code_aliases_user_idx on public.crew_referral_code_aliases(user_id);
alter table public.crew_referral_code_aliases enable row level security;
revoke all on public.crew_referral_code_aliases from public, anon, authenticated;

do $$
declare r record; v_new text; v_attempt integer;
begin
  for r in select user_id, code from public.crew_referral_codes order by user_id loop
    if r.code ~ '^KC-[A-F0-9]{16}$' then
      insert into public.crew_referral_code_aliases(alias_code,user_id)
      values(r.code,r.user_id) on conflict(alias_code) do nothing;
    end if;
    v_attempt:=0;
    loop
      v_attempt:=v_attempt+1;
      if v_attempt>30 then raise exception 'Could not allocate a compact referral code.'; end if;
      v_new:='KC-'||upper(substr(encode(extensions.gen_random_bytes(4),'hex'),1,8));
      exit when not exists(select 1 from public.crew_referral_codes where code=v_new)
        and not exists(select 1 from public.crew_referral_code_aliases where alias_code=v_new);
    end loop;
    update public.crew_referrals set referral_code=v_new where referral_code=r.code;
    update public.crew_referral_codes set code=v_new where user_id=r.user_id;
  end loop;
  for r in
    select p.auth_id from public.crew_profiles p
    left join public.crew_referral_codes c on c.user_id=p.auth_id
    where p.approval_status='approved' and p.role in ('member','admin','super_admin') and c.user_id is null
  loop
    v_attempt:=0;
    loop
      v_attempt:=v_attempt+1;
      if v_attempt>30 then raise exception 'Could not allocate a compact referral code.'; end if;
      v_new:='KC-'||upper(substr(encode(extensions.gen_random_bytes(4),'hex'),1,8));
      begin
        insert into public.crew_referral_codes(user_id,code) values(r.auth_id,v_new);
        exit;
      exception when unique_violation then
        if exists(select 1 from public.crew_referral_codes where user_id=r.auth_id) then exit; end if;
      end;
    end loop;
  end loop;
end $$;

create or replace function public.crew_referral_get_dashboard()
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth,extensions as $$
declare
  u text:=auth.uid()::text; r text; c text; attempt integer:=0;
  total integer; approved integer; points integer;
  badges jsonb:='[]'::jsonb; refs jsonb:='[]'::jsonb;
begin
  if u is null then raise exception 'Sign in required.'; end if;
  select role into r from public.crew_profiles where auth_id=u and approval_status='approved';
  if not found then raise exception 'Approved Kinetic Crew membership required.'; end if;
  select code into c from public.crew_referral_codes where user_id=u;
  if c is null then
    loop
      attempt:=attempt+1;
      if attempt>12 then raise exception 'Could not generate a unique referral code. Please retry.'; end if;
      c:='KC-'||upper(substr(encode(extensions.gen_random_bytes(4),'hex'),1,8));
      begin
        insert into public.crew_referral_codes(user_id,code) values(u,c);
        exit;
      exception when unique_violation then
        select code into c from public.crew_referral_codes where user_id=u;
        if c is not null then exit; end if;
      end;
    end loop;
  end if;
  select count(*),count(*) filter(where status='approved')
  into total,approved from public.crew_referrals where referrer_id=u;
  points:=public.crew_reward_points_balance(u);
  if approved>=1 then badges:=badges||jsonb_build_array(jsonb_build_object('id','connector','label','KC Connector','threshold',1)); end if;
  if approved>=3 then badges:=badges||jsonb_build_array(jsonb_build_object('id','influencer','label','KC Influencer','threshold',3)); end if;
  if approved>=5 then badges:=badges||jsonb_build_array(jsonb_build_object('id','ambassador','label','KC Ambassador','threshold',5)); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',x.id,'name',x.referred_name,'status',x.status,'created_at',x.created_at,'approved_at',x.approved_at
  ) order by x.created_at desc),'[]'::jsonb)
  into refs from (select * from public.crew_referrals where referrer_id=u order by created_at desc limit 30) x;
  return jsonb_build_object('ok',true,'code',c,'total_referrals',total,'approved_referrals',approved,'points',points,'badges',badges,'referrals',refs);
end $$;

create or replace function public.crew_referral_resolve_code(p_code text)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth as $$
declare v_input text:=upper(trim(coalesce(p_code,''))); v_code text; v_name text;
begin
  if v_input !~ '^KC-(?:[A-F0-9]{8}|[A-F0-9]{16})$' then
    return jsonb_build_object('ok',false,'message','This referral link is invalid.');
  end if;
  select c.code,p.name into v_code,v_name
  from public.crew_referral_codes c
  join public.crew_profiles p on p.auth_id=c.user_id
  left join public.crew_referral_code_aliases a on a.user_id=c.user_id and a.alias_code=v_input
  where (c.code=v_input or a.alias_code is not null) and p.approval_status='approved'
  limit 1;
  if v_code is null then return jsonb_build_object('ok',false,'message','This referral link is no longer active.'); end if;
  return jsonb_build_object('ok',true,'code',v_code,'referrer_name',v_name);
end $$;

create or replace function public.crew_referral_capture_application()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,auth as $$
declare v_input text; v_referrer text; v_code text;
begin
  v_input:=upper(trim(coalesce(new.application_data->>'referralCode','')));
  if v_input='' then return new; end if;
  select c.user_id,c.code into v_referrer,v_code
  from public.crew_referral_codes c
  join public.crew_profiles p on p.auth_id=c.user_id
  left join public.crew_referral_code_aliases a on a.user_id=c.user_id and a.alias_code=v_input
  where (c.code=v_input or a.alias_code is not null)
    and p.approval_status='approved'
    and lower(p.email)<>lower(new.email)
    and not exists(select 1 from public.crew_profiles existing where lower(existing.email)=lower(new.email) and existing.auth_id<>c.user_id)
  limit 1;
  if v_referrer is null then return new; end if;
  insert into public.crew_referrals(referrer_id,referral_code,referred_application_id,referred_email,referred_name)
  values(v_referrer,v_code,new.id,lower(new.email),new.name) on conflict do nothing;
  return new;
end $$;

create or replace function public.crew_rewards_admin_get()
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth as $$
declare v_uid text:=auth.uid()::text; v_role text; v_items jsonb; v_redemptions jsonb;
begin
  if v_uid is null then raise exception 'Sign in required.'; end if;
  select role into v_role from public.crew_profiles where auth_id=v_uid and approval_status='approved';
  if coalesce(v_role,'')<>'super_admin' then raise exception 'Only the Super Admin can manage KC Rewards.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'title',r.title,'description',r.description,'reward_type',r.reward_type,
    'points_cost',r.points_cost,'image_url',r.image_url,'quantity_available',r.quantity_available,
    'available_vouchers',(select count(*) from public.crew_reward_voucher_inventory vi where vi.reward_id=r.id and vi.status='available'),
    'available_voucher_codes',(select coalesce(jsonb_agg(vi.voucher_code order by vi.created_at),'[]'::jsonb) from public.crew_reward_voucher_inventory vi where vi.reward_id=r.id and vi.status='available'),
    'is_active',r.is_active,'created_at',r.created_at
  ) order by r.created_at desc),'[]'::jsonb) into v_items from public.crew_reward_catalog r;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',d.id,'user_id',d.user_id,'member_name',p.name,'member_username',p.username,'member_email',p.email,
    'reward_id',d.reward_id,'reward_title',r.title,'reward_type',r.reward_type,'points_cost',d.points_cost,
    'status',d.status,'delivery_details',d.delivery_details,'admin_note',d.admin_note,'voucher_code',d.voucher_code,
    'requested_at',d.requested_at,'reviewed_at',d.reviewed_at,'fulfilled_at',d.fulfilled_at
  ) order by d.requested_at desc),'[]'::jsonb)
  into v_redemptions from public.crew_reward_redemptions d
  join public.crew_profiles p on p.auth_id=d.user_id
  join public.crew_reward_catalog r on r.id=d.reward_id;
  return jsonb_build_object('ok',true,'catalog',v_items,'redemptions',v_redemptions);
end $$;

create or replace function public.crew_rewards_admin_upsert(
 p_reward_id uuid,p_title text,p_description text,p_reward_type text,p_points_cost integer,
 p_image_url text,p_quantity integer,p_is_active boolean,p_voucher_codes text[]
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth as $$
declare u text:=auth.uid()::text; r text; rid uuid; c text; code_count integer;
begin
 select role into r from public.crew_profiles where auth_id=u and approval_status='approved';
 if coalesce(r,'')<>'super_admin' then raise exception 'Only the Super Admin can configure rewards.'; end if;
 if length(trim(coalesce(p_title,''))) not between 2 and 90 then raise exception 'Reward title must contain 2–90 characters.'; end if;
 if coalesce(p_reward_type,'') not in('gift','voucher') then raise exception 'Choose a valid reward type.'; end if;
 if coalesce(p_points_cost,0)<1 or coalesce(p_quantity,-1)<0 then raise exception 'Enter a valid point price and quantity.'; end if;
 select count(*) into code_count from (select distinct btrim(x) code from unnest(coalesce(p_voucher_codes,array[]::text[])) x where btrim(x)<>'') q;
 if p_reward_type='voucher' and p_reward_id is null and code_count=0 then raise exception 'Add at least one voucher code before creating a voucher reward.'; end if;
 if p_reward_id is null then
  insert into public.crew_reward_catalog(title,description,reward_type,points_cost,image_url,quantity_available,is_active,created_by)
  values(trim(p_title),coalesce(p_description,''),p_reward_type,p_points_cost,nullif(trim(coalesce(p_image_url,'')),''),case when p_reward_type='gift' then p_quantity else code_count end,coalesce(p_is_active,true),u)
  returning id into rid;
 else
  select id into rid from public.crew_reward_catalog where id=p_reward_id for update;
  if rid is null then raise exception 'Reward not found.'; end if;
  update public.crew_reward_catalog set title=trim(p_title),description=coalesce(p_description,''),reward_type=p_reward_type,
   points_cost=p_points_cost,image_url=nullif(trim(coalesce(p_image_url,'')),''),
   quantity_available=case when p_reward_type='gift' then p_quantity else code_count end,
   is_active=coalesce(p_is_active,true),updated_at=now() where id=rid;
 end if;
 if p_reward_type='voucher' then
  delete from public.crew_reward_voucher_inventory vi where vi.reward_id=rid and vi.status='available'
   and not exists(select 1 from unnest(coalesce(p_voucher_codes,array[]::text[])) x where btrim(x)=vi.voucher_code and btrim(x)<>'');
  for c in select distinct btrim(x) from unnest(coalesce(p_voucher_codes,array[]::text[])) x where btrim(x)<>''
  loop
   insert into public.crew_reward_voucher_inventory(reward_id,voucher_code) values(rid,c) on conflict(reward_id,voucher_code) do nothing;
  end loop;
 else
  delete from public.crew_reward_voucher_inventory where reward_id=rid and status='available';
 end if;
 return jsonb_build_object('ok',true,'reward_id',rid,'available_vouchers',code_count);
end $$;

revoke all on function public.crew_rewards_admin_get() from public,anon,authenticated;
grant execute on function public.crew_rewards_admin_get() to authenticated;
revoke all on function public.crew_rewards_admin_upsert(uuid,text,text,text,integer,text,integer,boolean,text[]) from public,anon,authenticated;
grant execute on function public.crew_rewards_admin_upsert(uuid,text,text,text,integer,text,integer,boolean,text[]) to authenticated;
grant execute on function public.crew_referral_get_dashboard() to authenticated;
revoke all on function public.crew_referral_resolve_code(text) from public;
grant execute on function public.crew_referral_resolve_code(text) to anon,authenticated;
notify pgrst,'reload schema';
