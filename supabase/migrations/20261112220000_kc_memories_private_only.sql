-- KC Memories are private to their author and the crew administrators.
-- Remove the old recipient-sharing path for both new and existing memories.
update public.crew_feature_items
set data = data - 'recipient_ids'
where feature = 'memories' and data ? 'recipient_ids';

create or replace function public.crew_can_view_memory_photo(p_path text)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_uid text;
  v_role text;
begin
  if auth.uid() is null or coalesce(p_path,'') = '' then return false; end if;
  v_uid := auth.uid()::text;
  select role into v_role from public.crew_profiles where auth_id = v_uid;
  if v_role is null then return false; end if;
  return exists (
    select 1 from public.crew_feature_items i
    where i.feature = 'memories'
      and i.data->>'storage_path' = p_path
      and (i.author_id = v_uid or v_role in ('admin','super_admin'))
  );
end;
$$;
revoke all on function public.crew_can_view_memory_photo(text) from public, anon;
grant execute on function public.crew_can_view_memory_photo(text) to authenticated;

create or replace function public.crew_memories_create(
  p_title text,
  p_body text default '',
  p_data jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_uid text;
  v_role text;
  v_title text;
  v_data jsonb;
  v_path text;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  v_uid := auth.uid()::text;
  select role into v_role from public.crew_profiles where auth_id = v_uid;
  if v_role is null then raise exception 'Crew profile not found.'; end if;
  v_title := left(trim(coalesce(p_title,'')),160);
  if v_title = '' then raise exception 'Enter a memory title.'; end if;
  v_data := coalesce(p_data,'{}'::jsonb);
  if jsonb_typeof(v_data) <> 'object' then raise exception 'Invalid memory details.'; end if;
  v_data := v_data - 'recipient_ids';
  v_path := nullif(trim(v_data->>'storage_path'),'');
  if v_path is not null and split_part(v_path,'/',1) <> v_uid then
    raise exception 'You can only upload your own memory photo.';
  end if;
  if v_path is null and nullif(trim(v_data->>'media_url'),'') is null then
    raise exception 'Upload a photo or paste a photo URL first.';
  end if;
  insert into public.crew_feature_items(feature,title,body,data,status,author_id)
  values('memories',v_title,left(coalesce(p_body,''),5000),v_data,'open',v_uid)
  returning id into v_id;
  return jsonb_build_object('id',v_id,'message','Memory saved privately.');
end;
$$;
revoke all on function public.crew_memories_create(text,text,jsonb) from public, anon;
grant execute on function public.crew_memories_create(text,text,jsonb) to authenticated;

create or replace function public.crew_memories_list()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_uid text;
  v_role text;
  v_rows jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  v_uid := auth.uid()::text;
  select role into v_role from public.crew_profiles where auth_id = v_uid;
  if v_role is null then raise exception 'Crew profile not found.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',i.id,'feature',i.feature,'title',i.title,'body',i.body,
    'data',i.data - 'recipient_ids','status',i.status,'author_id',i.author_id,
    'created_at',i.created_at,'author_name',p.name
  ) order by i.created_at desc),'[]'::jsonb)
  into v_rows
  from public.crew_feature_items i
  join public.crew_profiles p on p.auth_id = i.author_id
  where i.feature = 'memories'
    and (i.author_id = v_uid or v_role in ('admin','super_admin'));
  return v_rows;
end;
$$;
revoke all on function public.crew_memories_list() from public, anon;
grant execute on function public.crew_memories_list() to authenticated;

drop policy if exists "Crew members view shared memory photos" on storage.objects;
drop policy if exists "Crew members view private memory photos" on storage.objects;
create policy "Crew members view private memory photos"
on storage.objects for select to authenticated
using (bucket_id = 'crew-memories' and public.crew_can_view_memory_photo(name));

notify pgrst, 'reload schema';
