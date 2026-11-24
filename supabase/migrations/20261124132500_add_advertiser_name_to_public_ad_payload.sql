create or replace function public.crew_ads_public_get(p_placement text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_uid text:=auth.uid()::text; v_role text; v_enabled boolean; v_more boolean; v_events boolean; v_app_open boolean; v_items jsonb;
begin
 perform public.crew_assert_not_blocked();
 select role into v_role from public.crew_profiles where auth_id=v_uid and approval_status='approved';
 if coalesce(v_role,'') not in ('member','admin','super_admin') then raise exception 'Approved crew access required.'; end if;
 if p_placement not in ('more','events','app_open') then raise exception 'Invalid placement.'; end if;
 select coalesce(ads_enabled,false),coalesce(show_on_more,false),coalesce(show_on_events,false),coalesce(show_on_app_open,false)
 into v_enabled,v_more,v_events,v_app_open from public.crew_more_ads_settings where singleton=true;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'title',a.title,'caption',a.caption,'advertiser_name',a.advertiser_name,'media_type',a.media_type,'media_url',a.media_url,'destination_url',a.destination_url,'ad_format',a.ad_format,'placement',a.placement,'placements',a.placements,'rotation_seconds',a.rotation_seconds,'frequency_cap',a.frequency_cap) order by a.created_at desc),'[]'::jsonb)
 into v_items from public.crew_ad_campaigns a
 where coalesce(v_enabled,false)
 and ((p_placement='more' and coalesce(v_more,false)) or (p_placement='events' and coalesce(v_events,false)) or (p_placement='app_open' and coalesce(v_app_open,false)))
 and a.status='approved' and a.placements @> array[p_placement]::text[]
 and (a.starts_at is null or a.starts_at<=now()) and (a.ends_at is null or a.ends_at>now())
 and coalesce((select r.impression_count from public.crew_ad_daily_reach r where r.campaign_id=a.id and r.user_id=v_uid and r.impression_day=current_date),0)<a.frequency_cap;
 return jsonb_build_object('enabled',coalesce(v_enabled,false),'items',v_items);
end; $$;