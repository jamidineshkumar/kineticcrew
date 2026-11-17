create or replace function public.crew_kc_connect_public_info() returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v jsonb;
begin
 select jsonb_build_object('name',p.name,'username',p.username,'avatar_url',p.avatar_url,'title',coalesce(nullif(p.crew_title,''),'Founder & President'),'instagram_username',p.instagram_username) into v
 from public.crew_profiles p where p.role='super_admin' and p.approval_status='approved' order by p.created_at asc limit 1;
 return coalesce(v,jsonb_build_object('name','Kinetic Crew Founder','title','Founder & President'));
end $$;
revoke all on function public.crew_kc_connect_public_info() from public;
grant execute on function public.crew_kc_connect_public_info() to anon,authenticated;
notify pgrst,'reload schema';