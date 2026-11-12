create or replace function public.crew_event_save(
  p_event_id uuid,p_title text,p_description text,p_location text,p_starts_at timestamptz,
  p_capacity integer,p_category text,p_cover_url text,p_featured boolean
)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare
  v_uid text;v_role text;v_event public.crew_events%rowtype;
  v_title text:=left(trim(coalesce(p_title,'')),120);
  v_category text:=left(trim(coalesce(p_category,'Community')),40);
  v_capacity integer:=greatest(1,least(10000,coalesce(p_capacity,40)));
  v_cover text:=nullif(trim(coalesce(p_cover_url,'')),'');
begin
  if auth.uid() is null then raise exception 'Sign in required.';end if;
  v_uid:=auth.uid()::text;
  select role into v_role from public.crew_profiles where auth_id=v_uid;
  if coalesce(v_role,'') not in ('admin','super_admin') then raise exception 'Admin access required to manage events.';end if;
  if v_title='' or p_starts_at is null then raise exception 'Event title and date are required.';end if;
  if v_category not in ('Auditions','Performances','Workshops','Community','Rehearsals','Other') then raise exception 'Choose a valid event category.';end if;
  if v_cover is not null and v_cover !~ '^https://[^[:space:]]+$' then raise exception 'Poster URL must use HTTPS.';end if;
  if p_event_id is null then
    insert into public.crew_events(title,description,location,starts_at,capacity,created_by,category,cover_url,is_featured)
    values(v_title,left(coalesce(p_description,''),2500),left(coalesce(p_location,''),160),p_starts_at,v_capacity,v_uid,v_category,v_cover,coalesce(p_featured,false))
    returning * into v_event;
    return jsonb_build_object('id',v_event.id,'message','Event published.','updated_at',v_event.updated_at,'created',true);
  end if;
  update public.crew_events set title=v_title,description=left(coalesce(p_description,''),2500),
    location=left(coalesce(p_location,''),160),starts_at=p_starts_at,capacity=v_capacity,
    category=v_category,cover_url=v_cover,is_featured=coalesce(p_featured,false)
  where id=p_event_id returning * into v_event;
  if not found then raise exception 'Event not found.';end if;
  return jsonb_build_object('id',v_event.id,'message','Event updated.','updated_at',v_event.updated_at,'created',false);
end;
$$;
revoke all on function public.crew_event_save(uuid,text,text,text,timestamptz,integer,text,text,boolean) from public,anon;
grant execute on function public.crew_event_save(uuid,text,text,text,timestamptz,integer,text,text,boolean) to authenticated;