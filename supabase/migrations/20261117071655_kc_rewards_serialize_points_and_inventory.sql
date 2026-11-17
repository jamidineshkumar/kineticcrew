create or replace function public.crew_reward_review_redemption(p_redemption_id uuid,p_decision text,p_admin_note text default '')
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare u text:=auth.uid()::text;r text;d public.crew_reward_redemptions%rowtype;x public.crew_reward_catalog%rowtype;bal integer;c text;
begin
 select role into r from public.crew_profiles where auth_id=u and approval_status='approved';
 if coalesce(r,'')<>'super_admin' then raise exception 'Only the Super Admin can review reward redemptions.';end if;
 select * into d from public.crew_reward_redemptions where id=p_redemption_id for update;if not found then raise exception 'Redemption request not found.';end if;
 if p_decision='rejected' then if d.status<>'pending' then raise exception 'Only pending requests can be rejected.';end if;update public.crew_reward_redemptions set status='rejected',admin_note=left(coalesce(p_admin_note,''),500),reviewed_at=now(),reviewed_by=u where id=d.id;return jsonb_build_object('ok',true,'status','rejected');
 elsif p_decision='fulfilled' then if d.status<>'approved' then raise exception 'Only approved gift redemptions can be marked fulfilled.';end if;update public.crew_reward_redemptions set status='fulfilled',admin_note=left(coalesce(p_admin_note,''),500),fulfilled_at=now() where id=d.id;return jsonb_build_object('ok',true,'status','fulfilled');
 elsif p_decision='approved' then
  if d.status<>'pending' then raise exception 'This redemption request has already been reviewed.';end if;
  perform 1 from public.crew_profiles where auth_id=d.user_id for update;
  select * into x from public.crew_reward_catalog where id=d.reward_id for update;if not found or not x.is_active then raise exception 'Reward is no longer active.';end if;
  bal:=public.crew_reward_points_balance(d.user_id);if bal<d.points_cost then raise exception 'Member no longer has enough points.';end if;
  if x.reward_type='gift' then if x.quantity_available<=0 then raise exception 'Gift is out of stock.';end if;update public.crew_reward_catalog set quantity_available=quantity_available-1,updated_at=now() where id=x.id;
  else select voucher_code into c from public.crew_reward_voucher_inventory where reward_id=x.id and status='available' order by created_at limit 1 for update skip locked;if c is null then raise exception 'No voucher codes remain for this reward.';end if;update public.crew_reward_voucher_inventory set status='issued',redemption_id=d.id where reward_id=x.id and voucher_code=c;end if;
  insert into public.crew_reward_points_transactions(user_id,points_delta,transaction_type,redemption_id,reason,actor_id) values(d.user_id,-d.points_cost,'redemption',d.id,'Redeemed: '||x.title,u);
  update public.crew_reward_redemptions set status=case when x.reward_type='voucher' then 'fulfilled' else 'approved' end,voucher_code=c,admin_note=left(coalesce(p_admin_note,''),500),reviewed_at=now(),reviewed_by=u,fulfilled_at=case when x.reward_type='voucher' then now() else null end where id=d.id;
  return jsonb_build_object('ok',true,'status',case when x.reward_type='voucher' then 'fulfilled' else 'approved' end,'voucher_code',c);
 else raise exception 'Choose approve, reject or fulfilled.';end if;
end $$;
create or replace function public.crew_reward_points_adjust(p_user_id text,p_points_delta integer,p_reason text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare u text:=auth.uid()::text;r text;bal integer;
begin
 select role into r from public.crew_profiles where auth_id=u and approval_status='approved';
 if coalesce(r,'')<>'super_admin' then raise exception 'Only the Super Admin can adjust KC points.';end if;
 if coalesce(p_points_delta,0)=0 or length(trim(coalesce(p_reason,'')))<3 then raise exception 'Enter a non-zero point adjustment and a reason.';end if;
 perform 1 from public.crew_profiles where auth_id=p_user_id and approval_status='approved' for update;if not found then raise exception 'Approved crew member not found.';end if;
 bal:=public.crew_reward_points_balance(p_user_id);if bal+p_points_delta<0 then raise exception 'This adjustment would make the member point balance negative.';end if;
 insert into public.crew_reward_points_transactions(user_id,points_delta,transaction_type,reason,actor_id) values(p_user_id,p_points_delta,'admin_adjustment',left(trim(p_reason),300),u);
 return jsonb_build_object('ok',true,'points_balance',bal+p_points_delta);
end $$;