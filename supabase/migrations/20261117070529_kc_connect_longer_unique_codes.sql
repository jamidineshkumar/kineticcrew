create or replace function public.crew_referral_get_dashboard()
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth,extensions
as $$
declare v_uid text:=auth.uid()::text; v_role text; v_code text; v_attempt integer:=0; v_total integer; v_approved integer; v_points integer; v_badges jsonb:='[]'::jsonb; v_referrals jsonb:='[]'::jsonb;
begin
 if v_uid is null then raise exception 'Sign in required.'; end if;
 select role into v_role from public.crew_profiles where auth_id=v_uid and approval_status='approved';
 if not found then raise exception 'Approved Kinetic Crew membership required.'; end if;
 select code into v_code from public.crew_referral_codes where user_id=v_uid;
 if v_code is null then
  loop
   v_attempt:=v_attempt+1;
   if v_attempt>8 then raise exception 'Could not generate a unique referral code. Please retry.'; end if;
   v_code:='KC-'||upper(substr(encode(extensions.gen_random_bytes(12),'hex'),1,16));
   begin insert into public.crew_referral_codes(user_id,code) values(v_uid,v_code); exit;
   exception when unique_violation then select code into v_code from public.crew_referral_codes where user_id=v_uid; if v_code is not null then exit; end if;
   end;
  end loop;
 end if;
 select count(*),count(*) filter(where status='approved') into v_total,v_approved from public.crew_referrals where referrer_id=v_uid;
 select coalesce(sum(points),0)::integer into v_points from public.crew_referral_reward_ledger where user_id=v_uid;
 if v_approved>=1 then v_badges:=v_badges||jsonb_build_array(jsonb_build_object('id','connector','label','KC Connector','threshold',1)); end if;
 if v_approved>=3 then v_badges:=v_badges||jsonb_build_array(jsonb_build_object('id','influencer','label','KC Influencer','threshold',3)); end if;
 if v_approved>=5 then v_badges:=v_badges||jsonb_build_array(jsonb_build_object('id','ambassador','label','KC Ambassador','threshold',5)); end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'name',r.referred_name,'status',r.status,'created_at',r.created_at,'approved_at',r.approved_at) order by r.created_at desc),'[]'::jsonb) into v_referrals from (select * from public.crew_referrals where referrer_id=v_uid order by created_at desc limit 30) r;
 return jsonb_build_object('ok',true,'code',v_code,'total_referrals',v_total,'approved_referrals',v_approved,'points',v_points,'badges',v_badges,'referrals',v_referrals);
end;
$$;
create or replace function public.crew_referral_resolve_code(p_code text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_name text; v_code text;
begin
 v_code:=upper(trim(coalesce(p_code,'')));
 if v_code !~ '^KC-[A-F0-9]{16}$' then return jsonb_build_object('ok',false,'message','This referral link is invalid.'); end if;
 select p.name into v_name from public.crew_referral_codes c join public.crew_profiles p on p.auth_id=c.user_id where c.code=v_code and p.approval_status='approved';
 if v_name is null then return jsonb_build_object('ok',false,'message','This referral link is no longer active.'); end if;
 return jsonb_build_object('ok',true,'code',v_code,'referrer_name',v_name);
end;
$$;
revoke all on function public.crew_referral_get_dashboard() from public,anon;
grant execute on function public.crew_referral_get_dashboard() to authenticated;
revoke all on function public.crew_referral_resolve_code(text) from public;
grant execute on function public.crew_referral_resolve_code(text) to anon,authenticated;