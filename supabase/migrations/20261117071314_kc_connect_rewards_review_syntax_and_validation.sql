create or replace function public.crew_reward_review_redemption(p_redemption_id uuid,p_decision text,p_admin_note text default '')
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare u text:=auth.uid()::text;r text;d public.crew_reward_redemptions%rowtype;x public.crew_reward_catalog%rowtype;bal integer;c text;
begin
 select role into r from public.crew_profiles where auth_id=u and approval_status='approved';
 if coalesce(r,'')<>'super_admin' then raise exception 'Only the Super Admin can review reward redemptions.';end if;
 select * into d from public.crew_reward_redemptions where id=p_redemption_id for update;if not found then raise exception 'Redemption request not found.';end if;
 if p_decision='rejected' then
  if d.status<>'pending' then raise exception 'Only pending requests can be rejected.';end if;
  update public.crew_reward_redemptions set status='rejected',admin_note=left(coalesce(p_admin_note,''),500),reviewed_at=now(),reviewed_by=u where id=d.id;return jsonb_build_object('ok',true,'status','rejected');
 elsif p_decision='fulfilled' then
  if d.status<>'approved' then raise exception 'Only approved gift redemptions can be marked fulfilled.';end if;
  update public.crew_reward_redemptions set status='fulfilled',admin_note=left(coalesce(p_admin_note,''),500),fulfilled_at=now() where id=d.id;return jsonb_build_object('ok',true,'status','fulfilled');
 elsif p_decision='approved' then
  if d.status<>'pending' then raise exception 'This redemption request has already been reviewed.';end if;
  select * into x from public.crew_reward_catalog where id=d.reward_id for update;if not found or not x.is_active then raise exception 'Reward is no longer active.';end if;
  bal:=public.crew_reward_points_balance(d.user_id);if bal<d.points_cost then raise exception 'Member no longer has enough points.';end if;
  if x.reward_type='gift' then
   if x.quantity_available<=0 then raise exception 'Gift is out of stock.';end if;
   update public.crew_reward_catalog set quantity_available=quantity_available-1,updated_at=now() where id=x.id;
  else
   select voucher_code into c from public.crew_reward_voucher_inventory where reward_id=x.id and status='available' order by created_at limit 1 for update skip locked;
   if c is null then raise exception 'No voucher codes remain for this reward.';end if;
   update public.crew_reward_voucher_inventory set status='issued',redemption_id=d.id where reward_id=x.id and voucher_code=c;
  end if;
  insert into public.crew_reward_points_transactions(user_id,points_delta,transaction_type,redemption_id,reason,actor_id) values(d.user_id,-d.points_cost,'redemption',d.id,'Redeemed: '||x.title,u);
  update public.crew_reward_redemptions set status=case when x.reward_type='voucher' then 'fulfilled' else 'approved' end,voucher_code=c,admin_note=left(coalesce(p_admin_note,''),500),reviewed_at=now(),reviewed_by=u,fulfilled_at=case when x.reward_type='voucher' then now() else null end where id=d.id;
  return jsonb_build_object('ok',true,'status',case when x.reward_type='voucher' then 'fulfilled' else 'approved' end,'voucher_code',c);
 else raise exception 'Choose approve, reject or fulfilled.';end if;
end $$;
create or replace function public.crew_rewards_admin_upsert(p_reward_id uuid,p_title text,p_description text,p_reward_type text,p_points_cost integer,p_image_url text,p_quantity integer,p_is_active boolean,p_voucher_codes text[])
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare u text:=auth.uid()::text;r text;rid uuid;c text;
begin
 select role into r from public.crew_profiles where auth_id=u and approval_status='approved';
 if coalesce(r,'')<>'super_admin' then raise exception 'Only the Super Admin can configure rewards.';end if;
 if length(trim(coalesce(p_title,''))) not between 2 and 90 then raise exception 'Reward title must contain 2–90 characters.';end if;
 if coalesce(p_reward_type,'') not in('gift','voucher') then raise exception 'Choose a valid reward type.';end if;
 if coalesce(p_points_cost,0)<1 or coalesce(p_quantity,-1)<0 then raise exception 'Enter a valid point price and quantity.';end if;
 if p_reward_type='voucher' and coalesce(array_length(p_voucher_codes,1),0)=0 and p_reward_id is null then raise exception 'Add at least one voucher code before creating a voucher reward.';end if;
 if p_reward_id is null then
  insert into public.crew_reward_catalog(title,description,reward_type,points_cost,image_url,quantity_available,is_active,created_by) values(trim(p_title),coalesce(p_description,''),p_reward_type,p_points_cost,nullif(trim(coalesce(p_image_url,'')),''),p_quantity,coalesce(p_is_active,true),u) returning id into rid;
 else
  update public.crew_reward_catalog set title=trim(p_title),description=coalesce(p_description,''),reward_type=p_reward_type,points_cost=p_points_cost,image_url=nullif(trim(coalesce(p_image_url,'')),''),quantity_available=p_quantity,is_active=coalesce(p_is_active,true),updated_at=now() where id=p_reward_id returning id into rid;
  if rid is null then raise exception 'Reward not found.';end if;
 end if;
 if p_reward_type='voucher' then foreach c in array coalesce(p_voucher_codes,array[]::text[]) loop c:=trim(c);if c<>'' then insert into public.crew_reward_voucher_inventory(reward_id,voucher_code) values(rid,c) on conflict(reward_id,voucher_code) do nothing;end if;end loop;end if;
 return jsonb_build_object('ok',true,'reward_id',rid);
end $$;