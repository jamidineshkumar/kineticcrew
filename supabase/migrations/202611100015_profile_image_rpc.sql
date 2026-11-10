-- Update only the signed-in member's profile image fields; do not couple uploads to username validation.
create or replace function public.crew_update_profile_images(
 p_avatar_url text default null,
 p_banner_url text default null
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,auth
as $$
declare v_uid text;
begin
 if auth.uid() is null then raise exception 'Please sign in first.'; end if;
 v_uid:=auth.uid()::text;
 if p_avatar_url is null and p_banner_url is null then
   raise exception 'Choose a profile photo or banner first.';
 end if;
 if (p_avatar_url is not null and length(p_avatar_url)>2048)
    or (p_banner_url is not null and length(p_banner_url)>2048) then
   raise exception 'Image URL is too long.';
 end if;
 update public.crew_profiles
 set avatar_url=coalesce(p_avatar_url,avatar_url),
     banner_url=coalesce(p_banner_url,banner_url)
 where auth_id=v_uid;
 if not found then raise exception 'Crew profile not found.'; end if;
 return (select jsonb_build_object(
   'auth_id',auth_id,'name',name,'email',email,'role',role,
   'username',username,'bio',bio,'avatar_url',avatar_url,'banner_url',banner_url
 ) from public.crew_profiles where auth_id=v_uid);
end;
$$;
revoke all on function public.crew_update_profile_images(text,text) from public,anon;
grant execute on function public.crew_update_profile_images(text,text) to authenticated;
notify pgrst,'reload schema';