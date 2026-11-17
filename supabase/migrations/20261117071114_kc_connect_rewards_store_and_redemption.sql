create table if not exists public.crew_reward_catalog(id uuid primary key default gen_random_uuid(),title text not null,description text not null default '',reward_type text not null check(reward_type in('gift','voucher')),points_cost integer not null check(points_cost>0),image_url text,quantity_available integer not null default 0 check(quantity_available>=0),is_active boolean not null default true,created_by text references public.crew_profiles(auth_id),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.crew_reward_voucher_inventory(id uuid primary key default gen_random_uuid(),reward_id uuid not null references public.crew_reward_catalog(id) on delete cascade,voucher_code text not null,status text not null default 'available' check(status in('available','issued')),redemption_id uuid,created_at timestamptz not null default now(),unique(reward_id,voucher_code));
create table if not exists public.crew_reward_redemptions(id uuid primary key default gen_random_uuid(),user_id text not null references public.crew_profiles(auth_id) on delete cascade,reward_id uuid not null references public.crew_reward_catalog(id),points_cost integer not null check(points_cost>0),status text not null default 'pending' check(status in('pending','approved','rejected','fulfilled')),delivery_details text not null default '',admin_note text not null default '',voucher_code text,requested_at timestamptz not null default now(),reviewed_at timestamptz,reviewed_by text references public.crew_profiles(auth_id),fulfilled_at timestamptz);
create table if not exists public.crew_reward_points_transactions(id uuid primary key default gen_random_uuid(),user_id text not null references public.crew_profiles(auth_id) on delete cascade,points_delta integer not null check(points_delta<>0),transaction_type text not null check(transaction_type in('admin_adjustment','redemption')),redemption_id uuid unique references public.crew_reward_redemptions(id),reason text not null,actor_id text references public.crew_profiles(auth_id),created_at timestamptz not null default now());
create index if not exists crew_reward_catalog_active_idx on public.crew_reward_catalog(is_active,created_at desc);
create index if not exists crew_reward_redemptions_user_idx on public.crew_reward_redemptions(user_id,requested_at desc);
create index if not exists crew_reward_redemptions_status_idx on public.crew_reward_redemptions(status,requested_at desc);
create index if not exists crew_reward_voucher_available_idx on public.crew_reward_voucher_inventory(reward_id,status);
create index if not exists crew_reward_points_user_idx on public.crew_reward_points_transactions(user_id,created_at desc);
alter table public.crew_reward_catalog enable row level security;
alter table public.crew_reward_voucher_inventory enable row level security;
alter table public.crew_reward_redemptions enable row level security;
alter table public.crew_reward_points_transactions enable row level security;
revoke all on public.crew_reward_catalog,public.crew_reward_voucher_inventory,public.crew_reward_redemptions,public.crew_reward_points_transactions from anon,authenticated;
grant all on public.crew_reward_catalog,public.crew_reward_voucher_inventory,public.crew_reward_redemptions,public.crew_reward_points_transactions to service_role;

create or replace function public.crew_reward_points_balance(p_user_id text) returns integer language sql stable security definer set search_path=pg_catalog,public as $$
select coalesce((select sum(points) from public.crew_referral_reward_ledger where user_id=p_user_id),0)::integer+coalesce((select sum(points_delta) from public.crew_reward_points_transactions where user_id=p_user_id),0)::integer;
$$;
revoke all on function public.crew_reward_points_balance(text) from public,anon,authenticated;

create or replace function public.crew_rewards_member_get() returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare u text:=auth.uid()::text; r text; items jsonb; reds jsonb; bal integer;
begin
 if u is null then raise exception 'Sign in required.'; end if;
 select role into r from public.crew_profiles where auth_id=u and approval_status='approved';
 if not found then raise exception 'Approved Kinetic Crew membership required.'; end if;
 bal:=public.crew_reward_points_balance(u);
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'title',x.title,'description',x.description,'reward_type',x.reward_type,'points_cost',x.points_cost,'image_url',x.image_url,'available_quantity',case when x.reward_type='voucher' then (select count(*) from public.crew_reward_voucher_inventory v where v.reward_id=x.id and v.status='available') else x.quantity_available end) order by x.created_at desc),'[]'::jsonb) into items from public.crew_reward_catalog x where x.is_active;
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'reward_title',x.title,'reward_type',x.reward_type,'points_cost',d.points_cost,'status',d.status,'admin_note',d.admin_note,'voucher_code',d.voucher_code,'requested_at',d.requested_at,'reviewed_at',d.reviewed_at,'fulfilled_at',d.fulfilled_at) order by d.requested_at desc),'[]'::jsonb) into reds from public.crew_reward_redemptions d join public.crew_reward_catalog x on x.id=d.reward_id where d.user_id=u;
 return jsonb_build_object('ok',true,'points_balance',bal,'catalog',items,'redemptions',reds);
end $$;

create or replace function public.crew_rewards_admin_get() returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare u text:=auth.uid()::text; r text; items jsonb; reds jsonb;
begin
 select role into r from public.crew_profiles where auth_id=u and approval_status='approved';
 if coalesce(r,'')<>'super_admin' then raise exception 'Only the Super Admin can manage KC Rewards.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'title',x.title,'description',x.description,'reward_type',x.reward_type,'points_cost',x.points_cost,'image_url',x.image_url,'quantity_available',x.quantity_available,'available_vouchers',(select count(*) from public.crew_reward_voucher_inventory v where v.reward_id=x.id and v.status='available'),'is_active',x.is_active,'created_at',x.created_at) order by x.created_at desc),'[]'::jsonb) into items from public.crew_reward_catalog x;
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'user_id',d.user_id,'member_name',p.name,'member_username',p.username,'member_email',p.email,'reward_id',d.reward_id,'reward_title',x.title,'reward_type',x.reward_type,'points_cost',d.points_cost,'status',d.status,'delivery_details',d.delivery_details,'admin_note',d.admin_note,'voucher_code',d.voucher_code,'requested_at',d.requested_at,'reviewed_at',d.reviewed_at,'fulfilled_at',d.fulfilled_at) order by d.requested_at desc),'[]'::jsonb) into reds from public.crew_reward_redemptions d join public.crew_profiles p on p.auth_id=d.user_id join public.crew_reward_catalog x on x.id=d.reward_id;
 return jsonb_build_object('ok',true,'catalog',items,'redemptions',reds);
end $$;

create or replace function public.crew_rewards_admin_upsert(p_reward_id uuid,p_title text,p_description text,p_reward_type text,p_points_cost integer,p_image_url text,p_quantity integer,p_is_active boolean,p_voucher_codes text[]) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare u text:=auth.uid()::text; r text; rid uuid; c text;
begin
 select role into r from public.crew_profiles where auth_id=u and approval_status='approved';
 if coalesce(r,'')<>'super_admin' then raise exception 'Only the Super Admin can configure rewards.'; end if;
 if length(trim(coalesce(p_title,''))) not between 2 and 90 then raise exception 'Reward title must contain 2–90 characters.'; end if;
 if coalesce(p_reward_type,'') not in('gift','voucher') then raise exception 'Choose a valid reward type.'; end if;
 if coalesce(p_points_cost,0)<1 or coalesce(p_quantity,-1)<0 then raise exception 'Enter a valid point price and quantity.'; end if;
 if p_reward_type='voucher' and coalesce(array_length(p_voucher_codes,1),0)=0 and p_reward_id is null then raise exception 'Add at least one voucher code before creating a voucher reward.'; end if;
 if p_reward_id is null then
  insert into public.crew_reward_catalog(title,description,reward_type,points_cost,image_url,quantity_available,is_active,created_by) values(trim(p_title),coalesce(p_description,''),p_reward_type,p_points_cost,nullif(trim(coalesce(p_image_url,'')),''),p_quantity,coalesce(p_is_active,true),u) returning id into rid;
 else
  update public.crew_reward_catalog set title=trim(p_title),description=coalesce(p_description,''),reward_type=p_reward_type,points_cost=p_points_cost,image_url=nullif(trim(coalesce(p_image_url,'')),''),quantity_available=p_quantity,is_active=coalesce(p_is_active,true),updated_at=now() where id=p_reward_id returning id into rid;
  if rid is null then raise exception 'Reward not found.'; end if;
 end if;
 if p_reward_type='voucher' then foreach c in array coalesce(p_voucher_codes,array[]::text[]) loop c:=trim(c);if c<>'' then insert into public.crew_reward_voucher_inventory(reward_id,voucher_code) values(rid,c) on conflict(reward_id,voucher_code) do nothing;end if;end loop;end if;
 return jsonb_build_object('ok',true,'reward_id',rid);
end $$;

create or replace function public.crew_reward_request_redemption(p_reward_id uuid,p_delivery_details text default '') returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare u text:=auth.uid()::text; r text; x public.crew_reward_catalog%rowtype; bal integer; rid uuid; available integer;
begin
 select role into r from public.crew_profiles where auth_id=u and approval_status='approved';
 if u is null or not found then raise exception 'Approved Kinetic Crew membership required.'; end if;
 select * into x from public.crew_reward_catalog where id=p_reward_id and is_active for update;
 if not found then raise exception 'This reward is no longer available.'; end if;
 bal:=public.crew_reward_points_balance(u);if bal<x.points_cost then raise exception 'Not enough KC points for this reward.';end if;
 if x.reward_type='voucher' then select count(*) into available from public.crew_reward_voucher_inventory where reward_id=x.id and status='available';else available:=x.quantity_available;end if;
 if available<=0 then raise exception 'This reward is currently out of stock.';end if;
 insert into public.crew_reward_redemptions(user_id,reward_id,points_cost,delivery_details) values(u,x.id,x.points_cost,left(coalesce(p_delivery_details,''),1000)) returning id into rid;
 return jsonb_build_object('ok',true,'redemption_id',rid,'status','pending');
end $$;

create or replace function public.crew_reward_review_redemption(p_redemption_id uuid,p_decision text,p_admin_note text default '') returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare u text:=auth.uid()::text;r text;d public.crew_reward_redemptions%rowtype;x public.crew_reward_catalog%rowtype;bal integer;c text;
begin
 select role into r from public.crew_profiles where auth_id=u and approval_status='approved';
 if coalesce(r,'')<>'super_admin' then raise exception 'Only the Super Admin can review reward redemptions.';end if;
 select * into d from public.crew_reward_redemptions where id=p_redemption_id for update;if not found then raise exception 'Redemption request not found.';end if;
 if p_decision='rejected' then if d.status<>'pending' then raise exception 'Only pending requests can be rejected.';end if;update public.crew_reward_redemptions set status='rejected',admin_note=left(coalesce(p_admin_note,''),500),reviewed_at=now(),reviewed_by=u where id=d.id;return jsonb_build_object('ok',true,'status','rejected');
 elsif p_decision='fulfilled' then if d.status<>'approved' then raise exception 'Only approved gift redemptions can be marked fulfilled.';end if;update public.crew_reward_redemptions set status='fulfilled',admin_note=left(coalesce(p_admin_note,''),500),fulfilled_at=now() where id=d.id;return jsonb_build_object('ok',true,'status','fulfilled');
 elsif p_decision='approved' then
  if d.status<>'pending' then raise exception 'This redemption request has already been reviewed.';end if;
  select * into x from public.crew_reward_catalog where id=d.reward_id for update;if not found or not x.is_active then raise exception 'Reward is no longer active.';end if;
  bal:=public.crew_reward_points_balance(d.user_id);if bal<d.points_cost then raise exception 'Member no longer has enough points.';end if;
  if x.reward_type='gift' then if x.quantity_available<=0 then raise exception 'Gift is out of stock.';end if;update public.crew_reward_catalog set quantity_available=quantity_available-1,updated_at=now() where id=x.id;
  else select voucher_code into c from public.crew_reward_voucher_inventory where reward_id=x.id and status='available' order by created_at limit 1 for update skip locked;if c is null then raise exception 'No voucher codes remain for this reward.';end if;update public.crew_reward_voucher_inventory set status='issued',redemption_id=d.id where reward_id=x.id and voucher_code=c;end if;
  insert into public.crew_reward_points_transactions(user_id,points_delta,transaction_type,redemption_id,reason,actor_id) values(d.user_id,-d.points_cost,'redemption',d.id,'Redeemed: '||x.title,u);
  update public.crew_reward_redemptions set status=case when x.reward_type='voucher' then 'fulfilled' else 'approved' end,voucher_code=c,admin_note=left(coalesce(p_admin_note,''),500),reviewed_at=now(),reviewed_by=u,fulfilled_at=case when x.reward_type='voucher' then now() else null end where id=d.id;
  return jsonb_build_object('ok',true,'status',case when x.reward_type='voucher' then 'fulfilled' else 'approved' end,'voucher_code',c);
 else raise exception 'Choose approve, reject or fulfilled.';end if;
end $$;

create or replace function public.crew_reward_points_adjust(p_user_id text,p_points_delta integer,p_reason text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare u text:=auth.uid()::text;r text;bal integer;
begin
 select role into r from public.crew_profiles where auth_id=u and approval_status='approved';
 if coalesce(r,'')<>'super_admin' then raise exception 'Only the Super Admin can adjust KC points.';end if;
 if coalesce(p_points_delta,0)=0 or length(trim(coalesce(p_reason,'')))<3 then raise exception 'Enter a non-zero point adjustment and a reason.';end if;
 if not exists(select 1 from public.crew_profiles where auth_id=p_user_id and approval_status='approved') then raise exception 'Approved crew member not found.';end if;
 bal:=public.crew_reward_points_balance(p_user_id);if bal+p_points_delta<0 then raise exception 'This adjustment would make the member point balance negative.';end if;
 insert into public.crew_reward_points_transactions(user_id,points_delta,transaction_type,reason,actor_id) values(p_user_id,p_points_delta,'admin_adjustment',left(trim(p_reason),300),u);
 return jsonb_build_object('ok',true,'points_balance',bal+p_points_delta);
end $$;

create or replace function public.crew_referral_get_dashboard() returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth,extensions as $$
declare u text:=auth.uid()::text;r text;c text;attempt integer:=0;total integer;approved integer;points integer;badges jsonb:='[]'::jsonb;refs jsonb:='[]'::jsonb;
begin
 if u is null then raise exception 'Sign in required.';end if;
 select role into r from public.crew_profiles where auth_id=u and approval_status='approved';if not found then raise exception 'Approved Kinetic Crew membership required.';end if;
 select code into c from public.crew_referral_codes where user_id=u;
 if c is null then loop attempt:=attempt+1;if attempt>8 then raise exception 'Could not generate a unique referral code. Please retry.';end if;c:='KC-'||upper(substr(encode(extensions.gen_random_bytes(12),'hex'),1,16));begin insert into public.crew_referral_codes(user_id,code) values(u,c);exit;exception when unique_violation then select code into c from public.crew_referral_codes where user_id=u;if c is not null then exit;end if;end;end loop;end if;
 select count(*),count(*) filter(where status='approved') into total,approved from public.crew_referrals where referrer_id=u;
 points:=public.crew_reward_points_balance(u);
 if approved>=1 then badges:=badges||jsonb_build_array(jsonb_build_object('id','connector','label','KC Connector','threshold',1));end if;
 if approved>=3 then badges:=badges||jsonb_build_array(jsonb_build_object('id','influencer','label','KC Influencer','threshold',3));end if;
 if approved>=5 then badges:=badges||jsonb_build_array(jsonb_build_object('id','ambassador','label','KC Ambassador','threshold',5));end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',x.referred_name,'status',x.status,'created_at',x.created_at,'approved_at',x.approved_at) order by x.created_at desc),'[]'::jsonb) into refs from (select * from public.crew_referrals where referrer_id=u order by created_at desc limit 30) x;
 return jsonb_build_object('ok',true,'code',c,'total_referrals',total,'approved_referrals',approved,'points',points,'badges',badges,'referrals',refs);
end $$;

revoke all on function public.crew_rewards_member_get() from public,anon;
revoke all on function public.crew_rewards_admin_get() from public,anon,authenticated;
revoke all on function public.crew_rewards_admin_upsert(uuid,text,text,text,integer,text,integer,boolean,text[]) from public,anon,authenticated;
revoke all on function public.crew_reward_request_redemption(uuid,text) from public,anon;
revoke all on function public.crew_reward_review_redemption(uuid,text,text) from public,anon,authenticated;
revoke all on function public.crew_reward_points_adjust(text,integer,text) from public,anon,authenticated;
grant execute on function public.crew_rewards_member_get() to authenticated;
grant execute on function public.crew_rewards_admin_get() to authenticated;
grant execute on function public.crew_rewards_admin_upsert(uuid,text,text,text,integer,text,integer,boolean,text[]) to authenticated;
grant execute on function public.crew_reward_request_redemption(uuid,text) to authenticated;
grant execute on function public.crew_reward_review_redemption(uuid,text,text) to authenticated;
grant execute on function public.crew_reward_points_adjust(text,integer,text) to authenticated;
grant execute on function public.crew_referral_get_dashboard() to authenticated;
notify pgrst,'reload schema';