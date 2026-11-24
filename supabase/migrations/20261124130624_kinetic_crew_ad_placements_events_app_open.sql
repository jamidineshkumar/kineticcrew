alter table public.crew_ad_campaigns
  add column if not exists placements text[] not null default '{}';

alter table public.crew_ad_campaigns
  drop constraint if exists crew_ad_campaigns_placement_check;
alter table public.crew_ad_campaigns
  add constraint crew_ad_campaigns_placement_check
  check (placement = any (array['home','more','events','app_open']::text[]));

update public.crew_ad_campaigns
set placements = case when placement='more' then array['more']::text[] else '{}'::text[] end
where cardinality(placements)=0;

alter table public.crew_more_ads_settings
  add column if not exists show_on_events boolean not null default false,
  add column if not exists show_on_app_open boolean not null default false;

update public.crew_more_ads_settings
set show_on_home=false
where singleton=true;

create or replace function public.crew_ads_admin_save_v2(
 p_id uuid,p_advertiser_type text,p_advertiser_name text,p_advertiser_email text,
 p_title text,p_caption text,p_media_type text,p_media_url text,p_destination_url text,
 p_ad_format text,p_placements text[],p_starts_at timestamptz,p_ends_at timestamptz,
 p_rotation_seconds integer,p_frequency_cap integer
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_uid text:=auth.uid()::text; v_role text; v_id uuid; v_placements text[]; v_legacy_placement text;
begin
 perform public.crew_assert_not_blocked();
 select role into v_role from public.crew_profiles where auth_id=v_uid and approval_status='approved';
 if coalesce(v_role,'') not in ('admin','super_admin') then raise exception 'Admin access required.'; end if;
 if p_advertiser_type not in ('internal','external') or p_media_type not in ('image','video') or p_ad_format not in ('native','banner') then raise exception 'Invalid ad configuration.'; end if;
 v_placements:=array(select distinct x from unnest(coalesce(p_placements,'{}'::text[])) x where x in ('more','events','app_open'));
 if cardinality(v_placements)=0 then raise exception 'Select at least one ad placement.'; end if;
 if length(trim(coalesce(p_advertiser_name,''))) not between 2 and 120 or length(trim(coalesce(p_title,''))) not between 2 and 100 then raise exception 'Advertiser and title are required.'; end if;
 if p_media_url is null or p_media_url !~* '^https://[^[:space:]]+$' then raise exception 'Upload an image or video first.'; end if;
 if p_destination_url is not null and trim(p_destination_url)<>'' and p_destination_url !~* '^https://[^[:space:]]+$' then raise exception 'Destination links must use HTTPS.'; end if;
 if p_starts_at is not null and p_ends_at is not null and p_ends_at<=p_starts_at then raise exception 'End date must be after start date.'; end if;
 v_legacy_placement:=v_placements[1];
 if p_id is null then
  insert into public.crew_ad_campaigns(advertiser_type,advertiser_name,advertiser_email,title,caption,media_type,media_url,destination_url,ad_format,placement,placements,starts_at,ends_at,rotation_seconds,frequency_cap,status,created_by)
  values(p_advertiser_type,trim(p_advertiser_name),nullif(trim(coalesce(p_advertiser_email,'')),''),trim(p_title),left(coalesce(p_caption,''),260),p_media_type,p_media_url,nullif(trim(coalesce(p_destination_url,'')),''),p_ad_format,v_legacy_placement,v_placements,p_starts_at,p_ends_at,greatest(5,least(120,coalesce(p_rotation_seconds,12))),greatest(1,least(20,coalesce(p_frequency_cap,3))),'pending',v_uid) returning id into v_id;
 else
  update public.crew_ad_campaigns set advertiser_type=p_advertiser_type,advertiser_name=trim(p_advertiser_name),advertiser_email=nullif(trim(coalesce(p_advertiser_email,'')),''),title=trim(p_title),caption=left(coalesce(p_caption,''),260),media_type=p_media_type,media_url=p_media_url,destination_url=nullif(trim(coalesce(p_destination_url,'')),''),ad_format=p_ad_format,placement=v_legacy_placement,placements=v_placements,starts_at=p_starts_at,ends_at=p_ends_at,rotation_seconds=greatest(5,least(120,coalesce(p_rotation_seconds,12))),frequency_cap=greatest(1,least(20,coalesce(p_frequency_cap,3))),updated_at=now()
  where id=p_id returning id into v_id;
  if v_id is null then raise exception 'Ad campaign not found.'; end if;
 end if;
 return jsonb_build_object('ok',true,'id',v_id,'placements',to_jsonb(v_placements));
end; $$;

create or replace function public.crew_app_ads_settings_save_v2(
 p_ads_enabled boolean,p_show_on_more boolean,p_show_on_events boolean,p_show_on_app_open boolean
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_uid text:=auth.uid()::text; v_role text;
begin
 perform public.crew_assert_not_blocked();
 select role into v_role from public.crew_profiles where auth_id=v_uid and approval_status='approved';
 if coalesce(v_role,'') not in ('admin','super_admin') then raise exception 'Admin access required to manage in-app ads.'; end if;
 insert into public.crew_more_ads_settings(singleton,ads_enabled,show_on_home,show_on_more,show_on_events,show_on_app_open,updated_at,updated_by)
 values(true,coalesce(p_ads_enabled,false),false,coalesce(p_show_on_more,false),coalesce(p_show_on_events,false),coalesce(p_show_on_app_open,false),now(),v_uid)
 on conflict(singleton) do update set ads_enabled=excluded.ads_enabled,show_on_home=false,show_on_more=excluded.show_on_more,show_on_events=excluded.show_on_events,show_on_app_open=excluded.show_on_app_open,updated_at=now(),updated_by=v_uid;
 return jsonb_build_object('ok',true,'ads_enabled',coalesce(p_ads_enabled,false),'show_on_more',coalesce(p_show_on_more,false),'show_on_events',coalesce(p_show_on_events,false),'show_on_app_open',coalesce(p_show_on_app_open,false));
end; $$;

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
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'title',a.title,'caption',a.caption,'media_type',a.media_type,'media_url',a.media_url,'destination_url',a.destination_url,'ad_format',a.ad_format,'placement',a.placement,'placements',a.placements,'rotation_seconds',a.rotation_seconds,'frequency_cap',a.frequency_cap) order by a.created_at desc),'[]'::jsonb)
 into v_items from public.crew_ad_campaigns a
 where coalesce(v_enabled,false)
 and ((p_placement='more' and coalesce(v_more,false)) or (p_placement='events' and coalesce(v_events,false)) or (p_placement='app_open' and coalesce(v_app_open,false)))
 and a.status='approved' and a.placements @> array[p_placement]::text[]
 and (a.starts_at is null or a.starts_at<=now()) and (a.ends_at is null or a.ends_at>now())
 and coalesce((select r.impression_count from public.crew_ad_daily_reach r where r.campaign_id=a.id and r.user_id=v_uid and r.impression_day=current_date),0)<a.frequency_cap;
 return jsonb_build_object('enabled',coalesce(v_enabled,false),'items',v_items);
end; $$;

create or replace function public.crew_more_ads_admin_get()
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_uid text:=auth.uid()::text; v_role text; v_items jsonb; v_settings record;
begin
 perform public.crew_assert_not_blocked();
 if v_uid is null then raise exception 'Sign in required.'; end if;
 select role into v_role from public.crew_profiles where auth_id=v_uid and approval_status='approved';
 if coalesce(v_role,'') not in ('admin','super_admin') then raise exception 'Admin access required.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'caption',caption,'media_type',media_type,'media_url',media_url,'storage_path',storage_path,'display_order',display_order,'is_active',is_active,'starts_at',starts_at,'ends_at',ends_at,'created_at',created_at) order by display_order,created_at desc),'[]'::jsonb) into v_items from public.crew_more_ads;
 select show_upcoming_events,show_promotions,ads_enabled,show_on_home,show_on_more,show_on_events,show_on_app_open into v_settings from public.crew_more_ads_settings where singleton=true;
 return jsonb_build_object('ok',true,'items',v_items,'settings',jsonb_build_object('show_upcoming_events',coalesce(v_settings.show_upcoming_events,true),'show_promotions',coalesce(v_settings.show_promotions,true),'ads_enabled',coalesce(v_settings.ads_enabled,false),'show_on_home',false,'show_on_more',coalesce(v_settings.show_on_more,false),'show_on_events',coalesce(v_settings.show_on_events,false),'show_on_app_open',coalesce(v_settings.show_on_app_open,false)));
end; $$;

revoke all on function public.crew_ads_admin_save_v2(uuid,text,text,text,text,text,text,text,text,text,text[],timestamptz,timestamptz,integer,integer) from public,anon;
revoke all on function public.crew_app_ads_settings_save_v2(boolean,boolean,boolean,boolean) from public,anon;
grant execute on function public.crew_ads_admin_save_v2(uuid,text,text,text,text,text,text,text,text,text,text[],timestamptz,timestamptz,integer,integer) to authenticated;
grant execute on function public.crew_app_ads_settings_save_v2(boolean,boolean,boolean,boolean) to authenticated;

revoke all on function public.crew_ads_public_get(text) from public,anon;
grant execute on function public.crew_ads_public_get(text) to authenticated;
revoke all on function public.crew_more_ads_admin_get() from public,anon;
grant execute on function public.crew_more_ads_admin_get() to authenticated;
