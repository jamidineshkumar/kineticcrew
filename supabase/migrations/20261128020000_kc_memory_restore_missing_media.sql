-- Restore media on legacy KC Memories that were saved without a photo.
create or replace function public.crew_memory_attach_photo(
  p_memory_id uuid,
  p_storage_path text,
  p_mime text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_uid text;
  v_item public.crew_feature_items%rowtype;
  v_path text;
  v_mime text;
begin
  perform public.crew_assert_not_blocked();
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  v_uid := auth.uid()::text;
  select * into v_item
  from public.crew_feature_items
  where id = p_memory_id and feature = 'memories'
  for update;
  if not found then raise exception 'Memory not found.'; end if;
  if v_item.author_id <> v_uid then
    raise exception 'Only the person who shared this memory can add its photo.';
  end if;
  v_path := trim(coalesce(p_storage_path, ''));
  v_mime := lower(trim(coalesce(p_mime, '')));
  if v_path = '' or split_part(v_path, '/', 1) <> v_uid then
    raise exception 'Invalid memory photo path.';
  end if;
  if v_mime not in ('image/jpeg','image/png','image/webp','image/gif') then
    raise exception 'Choose a JPG, PNG, WEBP or GIF photo.';
  end if;
  update public.crew_feature_items
  set data = (coalesce(data, '{}'::jsonb) - 'media_url' - 'image_url' - 'photo_url' - 'image' - 'photo')
      || jsonb_build_object('storage_path', v_path, 'media_type', v_mime),
      updated_at = now()
  where id = p_memory_id;
  return jsonb_build_object('message', 'Memory photo restored.');
end;
$$;

revoke all on function public.crew_memory_attach_photo(uuid, text, text) from public, anon;
grant execute on function public.crew_memory_attach_photo(uuid, text, text) to authenticated;

-- This RPC authenticates internally and should never be executable by anonymous clients.
revoke all on function public.crew_memory_social(text, uuid, text) from public, anon;
grant execute on function public.crew_memory_social(text, uuid, text) to authenticated;

notify pgrst, 'reload schema';
