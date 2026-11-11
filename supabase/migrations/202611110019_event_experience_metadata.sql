alter table public.crew_events
  add column if not exists category text not null default 'Community',
  add column if not exists cover_url text,
  add column if not exists is_featured boolean not null default false;

alter table public.crew_events
  drop constraint if exists crew_events_category_length_check;
alter table public.crew_events
  add constraint crew_events_category_length_check check (char_length(category) between 1 and 40);

alter table public.crew_events
  drop constraint if exists crew_events_cover_url_https_check;
alter table public.crew_events
  add constraint crew_events_cover_url_https_check
  check (cover_url is null or cover_url ~* '^https://[^[:space:]]+$');

create or replace function public.crew_event_metadata()
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare v_rows jsonb;
begin
  if auth.uid() is null then raise exception 'Please sign in to view crew events.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'category',e.category,'cover_url',e.cover_url,'featured',e.is_featured
  ) order by e.starts_at asc),'[]'::jsonb) into v_rows
  from public.crew_events e;
  return v_rows;
end;
$$;

create or replace function public.crew_event_set_metadata(
  p_event_id uuid, p_category text default 'Community',
  p_cover_url text default null, p_featured boolean default false
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare v_role text; v_category text; v_cover text; v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Please sign in to update event details.'; end if;
  select role into v_role from public.crew_profiles where auth_id=auth.uid()::text;
  if v_role not in ('admin','super_admin') then raise exception 'Admin access required to update event details.'; end if;
  v_category := left(trim(coalesce(p_category,'Community')),40);
  if v_category='' then v_category := 'Community'; end if;
  v_cover := nullif(trim(coalesce(p_cover_url,'')),'');
  if v_cover is not null and v_cover !~* '^https://[^[:space:]]+$' then
    raise exception 'Event poster must be a valid HTTPS image URL.';
  end if;
  if p_featured then update public.crew_events set is_featured=false where is_featured=true and id<>p_event_id; end if;
  update public.crew_events set category=v_category,cover_url=v_cover,is_featured=coalesce(p_featured,false) where id=p_event_id;
  if not found then raise exception 'Event not found.'; end if;
  select jsonb_build_object('id',id,'category',category,'cover_url',cover_url,'featured',is_featured)
    into v_result from public.crew_events where id=p_event_id;
  return v_result;
end;
$$;

revoke all on function public.crew_event_metadata() from public;
revoke all on function public.crew_event_set_metadata(uuid,text,text,boolean) from public;
grant execute on function public.crew_event_metadata() to authenticated;
grant execute on function public.crew_event_set_metadata(uuid,text,text,boolean) to authenticated;
