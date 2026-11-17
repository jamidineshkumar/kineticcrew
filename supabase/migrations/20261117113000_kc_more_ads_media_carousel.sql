create table if not exists public.crew_more_ads (
 id uuid primary key default gen_random_uuid(), title text not null default '', caption text not null default '',
 media_type text not null check (media_type in ('image','video')),
 media_url text not null check (media_url ~* '^https://[^[:space:]]+$'), storage_path text,
 display_order integer not null default 0, is_active boolean not null default true,
 starts_at timestamptz, ends_at timestamptz, created_by text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint crew_more_ads_schedule_valid check (starts_at is null or ends_at is null or ends_at > starts_at)
);
create index if not exists crew_more_ads_active_order_idx on public.crew_more_ads(is_active,display_order,created_at);
alter table public.crew_more_ads enable row level security;
revoke all on public.crew_more_ads from anon,authenticated;
grant all on public.crew_more_ads to service_role;

create or replace function public.crew_more_ads_public_get()
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_uid text:=auth.uid()::text; v_role text; v_items jsonb;
begin
 if v_uid is null then raise exception 'Sign in required.'; end if;
 select role into v_role from public.crew_profiles where auth_id=v_uid and approval_status='approved';
 if coalesce(v_role,'') not in ('member','admin','super_admin') then raise exception 'Approved crew access required.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'caption',caption,'media_type',media_type,'media_url',media_url,'display_order',display_order,'starts_at',starts_at,'ends_at',ends_at) order by display_order,created_at),'[]'::jsonb)
 into v_items from public.crew_more_ads where is_active and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>now());
 return jsonb_build_object('ok',true,'items',v_items);
end; $$;

create or replace function public.crew_more_ads_admin_get()
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_uid text:=auth.uid()::text; v_role text; v_items jsonb;
begin
 if v_uid is null then raise exception 'Sign in required.'; end if;
 select role into v_role from public.crew_profiles where auth_id=v_uid and approval_status='approved';
 if coalesce(v_role,'')<>'super_admin' then raise exception 'Only the Super Admin can manage the More banner.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'caption',caption,'media_type',media_type,'media_url',media_url,'storage_path',storage_path,'display_order',display_order,'is_active',is_active,'starts_at',starts_at,'ends_at',ends_at,'created_at',created_at) order by display_order,created_at desc),'[]'::jsonb)
 into v_items from public.crew_more_ads;
 return jsonb_build_object('ok',true,'items',v_items);
end; $$;

create or replace function public.crew_more_ads_save(
 p_id uuid,p_title text,p_caption text,p_media_type text,p_media_url text,p_storage_path text,
 p_display_order integer,p_is_active boolean,p_starts_at timestamptz,p_ends_at timestamptz
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_uid text:=auth.uid()::text; v_role text; v_id uuid;
begin
 if v_uid is null then raise exception 'Sign in required.'; end if;
 select role into v_role from public.crew_profiles where auth_id=v_uid and approval_status='approved';
 if coalesce(v_role,'')<>'super_admin' then raise exception 'Only the Super Admin can manage the More banner.'; end if;
 if coalesce(trim(p_title),'')='' then raise exception 'Add a title for this slide.'; end if;
 if p_media_type not in ('image','video') then raise exception 'Choose an image or video.'; end if;
 if p_media_url is null or p_media_url !~* '^https://[^[:space:]]+$' then raise exception 'Upload a media file before saving.'; end if;
 if p_starts_at is not null and p_ends_at is not null and p_ends_at<=p_starts_at then raise exception 'End time must be after start time.'; end if;
 if p_id is null then
  insert into public.crew_more_ads(title,caption,media_type,media_url,storage_path,display_order,is_active,starts_at,ends_at,created_by)
  values(left(trim(p_title),100),left(coalesce(p_caption,''),260),p_media_type,p_media_url,p_storage_path,coalesce(p_display_order,0),coalesce(p_is_active,true),p_starts_at,p_ends_at,v_uid) returning id into v_id;
 else
  update public.crew_more_ads set title=left(trim(p_title),100),caption=left(coalesce(p_caption,''),260),media_type=p_media_type,media_url=p_media_url,storage_path=p_storage_path,display_order=coalesce(p_display_order,0),is_active=coalesce(p_is_active,true),starts_at=p_starts_at,ends_at=p_ends_at,updated_at=now() where id=p_id returning id into v_id;
  if v_id is null then raise exception 'Banner slide not found.'; end if;
 end if;
 return jsonb_build_object('ok',true,'id',v_id);
end; $$;

create or replace function public.crew_more_ads_delete(p_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_uid text:=auth.uid()::text; v_role text;
begin
 if v_uid is null then raise exception 'Sign in required.'; end if;
 select role into v_role from public.crew_profiles where auth_id=v_uid and approval_status='approved';
 if coalesce(v_role,'')<>'super_admin' then raise exception 'Only the Super Admin can manage the More banner.'; end if;
 delete from public.crew_more_ads where id=p_id;
 return jsonb_build_object('ok',true);
end; $$;

revoke all on function public.crew_more_ads_public_get() from public,anon;
revoke all on function public.crew_more_ads_admin_get() from public,anon;
revoke all on function public.crew_more_ads_save(uuid,text,text,text,text,text,integer,boolean,timestamptz,timestamptz) from public,anon;
revoke all on function public.crew_more_ads_delete(uuid) from public,anon;
grant execute on function public.crew_more_ads_public_get() to authenticated;
grant execute on function public.crew_more_ads_admin_get() to authenticated;
grant execute on function public.crew_more_ads_save(uuid,text,text,text,text,text,integer,boolean,timestamptz,timestamptz) to authenticated;
grant execute on function public.crew_more_ads_delete(uuid) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('kc-more-ads','kc-more-ads',true,104857600,array['image/jpeg','image/png','image/webp','image/gif','image/avif','video/mp4','video/webm','video/quicktime'])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "KC More ads public media read" on storage.objects;
create policy "KC More ads public media read" on storage.objects for select to public using(bucket_id='kc-more-ads');
drop policy if exists "KC More ads superadmin upload" on storage.objects;
create policy "KC More ads superadmin upload" on storage.objects for insert to authenticated with check(bucket_id='kc-more-ads' and exists(select 1 from public.crew_profiles p where p.auth_id=auth.uid()::text and p.role='super_admin' and p.approval_status='approved'));
drop policy if exists "KC More ads superadmin update" on storage.objects;
create policy "KC More ads superadmin update" on storage.objects for update to authenticated using(bucket_id='kc-more-ads' and exists(select 1 from public.crew_profiles p where p.auth_id=auth.uid()::text and p.role='super_admin' and p.approval_status='approved')) with check(bucket_id='kc-more-ads' and exists(select 1 from public.crew_profiles p where p.auth_id=auth.uid()::text and p.role='super_admin' and p.approval_status='approved'));
drop policy if exists "KC More ads superadmin delete" on storage.objects;
create policy "KC More ads superadmin delete" on storage.objects for delete to authenticated using(bucket_id='kc-more-ads' and exists(select 1 from public.crew_profiles p where p.auth_id=auth.uid()::text and p.role='super_admin' and p.approval_status='approved'));
