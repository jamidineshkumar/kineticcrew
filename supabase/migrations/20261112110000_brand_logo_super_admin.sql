-- Super Admin-controlled global Kinetic Crew logo.
-- The existing public crew-brand-assets bucket is reused.
create or replace function public.crew_set_app_setting(p_key text,p_value jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_uid text; v_role text; v_text text;
begin
 if auth.uid() is null then raise exception 'Sign in required.'; end if;
 v_uid:=auth.uid()::text;
 select role into v_role from public.crew_profiles where auth_id=v_uid;
 if p_key='brand_logo_url' then
   if coalesce(v_role,'')<>'super_admin' then raise exception 'Only the Super Admin can change the Kinetic Crew logo.'; end if;
   v_text:=p_value #>> '{}';
   if coalesce(length(v_text),0)>2048 or v_text not like 'https://lkdfjiweqxshbbcadfna.supabase.co/storage/v1/object/public/crew-brand-assets/brand/kinetic-crew-logo.png%' then
     raise exception 'Invalid Kinetic Crew brand logo URL.';
   end if;
 elsif p_key in ('intro_audio_url','latest_version') then
   if coalesce(v_role,'') not in ('admin','super_admin') then raise exception 'Admin access required.'; end if;
   if p_key='intro_audio_url' and length(coalesce(p_value#>>'{}',''))>2048 then raise exception 'Audio URL is too long.'; end if;
 else
   raise exception 'Unsupported app setting.';
 end if;
 insert into public.crew_app_settings(setting_key,setting_value,updated_at,updated_by)
 values(p_key,p_value,now(),v_uid)
 on conflict(setting_key) do update set setting_value=excluded.setting_value,updated_at=now(),updated_by=v_uid;
 return jsonb_build_object('message',case when p_key='brand_logo_url' then 'Kinetic Crew logo updated.' else 'App setting saved.' end,'key',p_key);
end $$;
revoke all on function public.crew_set_app_setting(text,jsonb) from public,anon;
grant execute on function public.crew_set_app_setting(text,jsonb) to authenticated;

create or replace function public.crew_get_brand_logo() returns text
language sql stable security definer set search_path=pg_catalog,public
as $$
 select setting_value #>> '{}'
 from public.crew_app_settings
 where setting_key='brand_logo_url'
 limit 1;
$$;
revoke all on function public.crew_get_brand_logo() from public;
grant execute on function public.crew_get_brand_logo() to anon,authenticated;

-- Public read is required for signed-out pages, favicons and share/connection pages.
drop policy if exists "Kinetic Crew brand logo is public" on storage.objects;
create policy "Kinetic Crew brand logo is public"
 on storage.objects for select to public
 using(bucket_id='crew-brand-assets' and name='brand/kinetic-crew-logo.png');

-- Upload, replace and remove are restricted to the single Super Admin role.
drop policy if exists "Super Admin uploads Kinetic Crew brand logo" on storage.objects;
create policy "Super Admin uploads Kinetic Crew brand logo"
 on storage.objects for insert to authenticated
 with check(
  bucket_id='crew-brand-assets' and name='brand/kinetic-crew-logo.png'
  and exists(select 1 from public.crew_profiles p where p.auth_id=auth.uid()::text and p.role='super_admin')
 );
drop policy if exists "Super Admin replaces Kinetic Crew brand logo" on storage.objects;
create policy "Super Admin replaces Kinetic Crew brand logo"
 on storage.objects for update to authenticated
 using(
  bucket_id='crew-brand-assets' and name='brand/kinetic-crew-logo.png'
  and exists(select 1 from public.crew_profiles p where p.auth_id=auth.uid()::text and p.role='super_admin')
 )
 with check(
  bucket_id='crew-brand-assets' and name='brand/kinetic-crew-logo.png'
  and exists(select 1 from public.crew_profiles p where p.auth_id=auth.uid()::text and p.role='super_admin')
 );
drop policy if exists "Super Admin removes Kinetic Crew brand logo" on storage.objects;
create policy "Super Admin removes Kinetic Crew brand logo"
 on storage.objects for delete to authenticated
 using(
  bucket_id='crew-brand-assets' and name='brand/kinetic-crew-logo.png'
  and exists(select 1 from public.crew_profiles p where p.auth_id=auth.uid()::text and p.role='super_admin')
 );
notify pgrst,'reload schema';
