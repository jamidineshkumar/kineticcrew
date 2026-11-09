-- Kinetic Crew: member chat and profile photos.
alter table public.crew_profiles add column if not exists avatar_url text;
create table if not exists public.crew_chat_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id text not null references public.crew_profiles(auth_id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists crew_chat_messages_created_idx on public.crew_chat_messages(created_at desc);
alter table public.crew_chat_messages enable row level security;
revoke all on public.crew_chat_messages from anon, authenticated;

create or replace function public.crew_chat(p_action text, p_body text default null, p_before timestamptz default null)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare v_uid text; v_role text; v_rows jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required.'; end if;
 v_uid:=auth.uid()::text;
 select role into v_role from public.crew_profiles where auth_id=v_uid;
 if v_role is null then raise exception 'Crew profile not found.'; end if;
 if p_action='list' then
   select coalesce(jsonb_agg(x.row order by x.created_at),'[]'::jsonb) into v_rows
   from (
     select jsonb_build_object('id',m.id,'body',m.body,'created_at',m.created_at,'sender_id',m.sender_id,'sender_name',p.name,'avatar_url',p.avatar_url) as row,m.created_at
     from public.crew_chat_messages m join public.crew_profiles p on p.auth_id=m.sender_id
     where p_before is null or m.created_at<p_before
     order by m.created_at desc limit 80
   ) x;
   return v_rows;
 elsif p_action='send' then
   if length(trim(coalesce(p_body,'')))=0 then raise exception 'Type a message first.'; end if;
   insert into public.crew_chat_messages(sender_id,body) values(v_uid,left(trim(p_body),2000));
   return jsonb_build_object('message','Message sent.');
 elsif p_action='delete' then
   delete from public.crew_chat_messages where id=(p_body)::uuid and (sender_id=v_uid or v_role in ('admin','super_admin'));
   if not found then raise exception 'Message not found or not allowed.'; end if;
   return jsonb_build_object('message','Message deleted.');
 end if;
 raise exception 'Unsupported chat action.';
end $$;
revoke all on function public.crew_chat(text,text,timestamptz) from public,anon;
grant execute on function public.crew_chat(text,text,timestamptz) to authenticated;

create or replace function public.crew_update_avatar(p_avatar_url text)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
begin
 if auth.uid() is null then raise exception 'Sign in required.'; end if;
 if length(coalesce(p_avatar_url,''))>1000 then raise exception 'Invalid image URL.'; end if;
 update public.crew_profiles set avatar_url=nullif(trim(p_avatar_url),'') where auth_id=auth.uid()::text;
 return jsonb_build_object('avatar_url',p_avatar_url);
end $$;
revoke all on function public.crew_update_avatar(text) from public,anon;
grant execute on function public.crew_update_avatar(text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('crew-avatars','crew-avatars',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
drop policy if exists "Crew members upload own avatar" on storage.objects;
create policy "Crew members upload own avatar" on storage.objects for insert to authenticated
with check (bucket_id='crew-avatars' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "Crew avatars are public" on storage.objects;
create policy "Crew avatars are public" on storage.objects for select to public using (bucket_id='crew-avatars');
drop policy if exists "Crew members update own avatar" on storage.objects;
create policy "Crew members update own avatar" on storage.objects for update to authenticated
using (bucket_id='crew-avatars' and (storage.foldername(name))[1]=auth.uid()::text)
with check (bucket_id='crew-avatars' and (storage.foldername(name))[1]=auth.uid()::text);
notify pgrst,'reload schema';
