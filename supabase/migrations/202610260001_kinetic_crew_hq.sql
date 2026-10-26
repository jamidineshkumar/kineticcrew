-- Kinetic Crew HQ: Supabase-compatible schema and role-checked API.
-- All objects are prefixed crew_ and do not modify KhetMitra tables. New accounts start as Members; the project owner must promote the intended owner account manually.
create extension if not exists pgcrypto;
create table if not exists public.crew_profiles (
  auth_id text primary key, email text not null unique, name text not null,
  role text not null default 'member' check (role in ('super_admin','admin','member')),
  created_at timestamptz not null default now()
);
create table if not exists public.crew_events (
  id uuid primary key default gen_random_uuid(), title text not null, description text not null default '',
  location text not null default '', starts_at timestamptz not null,
  capacity integer not null default 100 check (capacity > 0), created_by text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.crew_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.crew_events(id) on delete cascade,
  member_id text not null references public.crew_profiles(auth_id) on delete cascade,
  registered_at timestamptz not null default now(), unique(event_id, member_id)
);
create table if not exists public.crew_otps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.crew_events(id) on delete cascade,
  member_id text not null references public.crew_profiles(auth_id) on delete cascade,
  code_hash text not null, expires_at timestamptz not null,
  used boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists public.crew_attendance (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.crew_events(id) on delete cascade,
  member_id text not null references public.crew_profiles(auth_id) on delete cascade,
  marked_by text not null, marked_at timestamptz not null default now(),
  unique(event_id, member_id)
);
create table if not exists public.crew_announcements (
  id uuid primary key default gen_random_uuid(), title text not null, body text not null,
  audience text not null default 'all' check (audience in ('all','member','admin','super_admin')),
  author_id text not null, created_at timestamptz not null default now()
);

alter table public.crew_profiles enable row level security;
alter table public.crew_events enable row level security;
alter table public.crew_registrations enable row level security;
alter table public.crew_otps enable row level security;
alter table public.crew_attendance enable row level security;
alter table public.crew_announcements enable row level security;
revoke all on public.crew_profiles, public.crew_events, public.crew_registrations,
  public.crew_otps, public.crew_attendance, public.crew_announcements from anon, authenticated;

insert into public.crew_events(title,description,location,starts_at,capacity,created_by)
select 'Kinetic Crew Orientation',
       'Your first crew moment. Admins can publish additional events from Crew HQ.',
       'Location to be confirmed', now()+interval '7 days', 40, 'system'
where not exists(select 1 from public.crew_events);

create or replace function public.crew_api(
  p_action text, p_method text default 'GET', p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, extensions, auth, pg_temp
as $$
declare
  v_uid text; v_email text; v_name text; v_role text; v_random bytea;
  v_profile public.crew_profiles%rowtype;
  v_event public.crew_events%rowtype;
  v_member public.crew_profiles%rowtype;
  v_otp public.crew_otps%rowtype;
  v_action text := lower(coalesce(p_action,''));
  v_method text := upper(coalesce(p_method,'GET'));
  v_event_id uuid; v_title text; v_description text; v_location text;
  v_starts_at timestamptz; v_capacity integer; v_audience text; v_code text; v_hash text;
  v_events jsonb := '[]'::jsonb; v_announcements jsonb := '[]'::jsonb;
  v_members jsonb := '[]'::jsonb; v_roster jsonb := '[]'::jsonb; v_attendance jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'Please sign in to use Kinetic Crew HQ.'; end if;
  v_uid := auth.uid()::text;
  v_email := lower(trim(coalesce(auth.jwt()->>'email','')));
  v_name := left(trim(coalesce(auth.jwt()->'user_metadata'->>'full_name',
                               auth.jwt()->'user_metadata'->>'name',
                               split_part(v_email,'@',1),'Crew member')),100);
  if v_email='' then raise exception 'Your sign-in account must have an email address.'; end if;

  select * into v_profile from public.crew_profiles where auth_id=v_uid;
  if not found then
    perform pg_advisory_xact_lock(724193816);
    select * into v_profile from public.crew_profiles where auth_id=v_uid;
    if not found then
      v_role := 'member'; -- Owner explicitly promotes the intended account after sign-in.
      insert into public.crew_profiles(auth_id,email,name,role) values(v_uid,v_email,v_name,v_role)
      on conflict(auth_id) do update set email=excluded.email returning * into v_profile;
    end if;
  else
    update public.crew_profiles set email=v_email where auth_id=v_uid and email<>v_email returning * into v_profile;
    if not found then select * into v_profile from public.crew_profiles where auth_id=v_uid; end if;
  end if;

  if v_action in ('bootstrap','events') and v_method='GET' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',e.id,'title',e.title,'description',e.description,'location',e.location,
      'starts_at',e.starts_at,'capacity',e.capacity,'created_at',e.created_at,
      'registration_count',(select count(*)::int from public.crew_registrations r where r.event_id=e.id),
      'registered',exists(select 1 from public.crew_registrations r where r.event_id=e.id and r.member_id=v_uid),
      'attended',exists(select 1 from public.crew_attendance a where a.event_id=e.id and a.member_id=v_uid)
    ) order by e.starts_at asc),'[]'::jsonb) into v_events from public.crew_events e;
    if v_action='events' then return v_events; end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',a.id,'title',a.title,'body',a.body,'audience',a.audience,'created_at',a.created_at,'author_name',p.name
    ) order by a.created_at desc),'[]'::jsonb) into v_announcements
    from public.crew_announcements a join public.crew_profiles p on p.auth_id=a.author_id
    where a.audience='all' or a.audience=v_profile.role;
    if v_profile.role in ('admin','super_admin') then
      select coalesce(jsonb_agg(jsonb_build_object(
        'auth_id',p.auth_id,'email',p.email,'name',p.name,'role',p.role,'created_at',p.created_at,
        'event_count',(select count(*)::int from public.crew_registrations r where r.member_id=p.auth_id)
      ) order by p.created_at desc),'[]'::jsonb) into v_members from public.crew_profiles p;
    end if;
    return jsonb_build_object('user',jsonb_build_object('auth_id',v_profile.auth_id,'email',v_profile.email,
      'name',v_profile.name,'role',v_profile.role,'created_at',v_profile.created_at),
      'events',v_events,'announcements',v_announcements,'members',v_members);
  end if;

  if v_action='announcements' and v_method='GET' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',a.id,'title',a.title,'body',a.body,'audience',a.audience,'created_at',a.created_at,'author_name',p.name
    ) order by a.created_at desc),'[]'::jsonb) into v_announcements
    from public.crew_announcements a join public.crew_profiles p on p.auth_id=a.author_id
    where a.audience='all' or a.audience=v_profile.role;
    return v_announcements;
  end if;

  if v_action='events' and v_method='POST' then
    if v_profile.role not in ('admin','super_admin') then raise exception 'Admin access required to publish events.'; end if;
    v_title:=trim(coalesce(p_payload->>'title',''));
    v_description:=left(trim(coalesce(p_payload->>'description','')),2500);
    v_location:=left(trim(coalesce(p_payload->>'location','')),160);
    if v_title='' or coalesce(p_payload->>'starts_at','')='' then raise exception 'Event title and date are required.'; end if;
    v_starts_at:=(p_payload->>'starts_at')::timestamptz;
    v_capacity:=greatest(1,least(10000,coalesce((p_payload->>'capacity')::integer,100)));
    insert into public.crew_events(title,description,location,starts_at,capacity,created_by)
    values(left(v_title,120),v_description,v_location,v_starts_at,v_capacity,v_uid) returning * into v_event;
    return jsonb_build_object('id',v_event.id,'message','Event published');
  end if;

  if v_action='register' and v_method='POST' then
    v_event_id:=(p_payload->>'eventId')::uuid;
    select * into v_event from public.crew_events where id=v_event_id for update;
    if not found then raise exception 'Event not found.'; end if;
    if exists(select 1 from public.crew_registrations where event_id=v_event_id and member_id=v_uid) then
      return jsonb_build_object('message','You''re already registered.');
    end if;
    if (select count(*) from public.crew_registrations where event_id=v_event_id)>=v_event.capacity then raise exception 'This event is full.'; end if;
    insert into public.crew_registrations(event_id,member_id) values(v_event_id,v_uid) on conflict(event_id,member_id) do nothing;
    return jsonb_build_object('message','Registration confirmed.');
  end if;

  if v_action='otp' and v_method='POST' then
    v_event_id:=(p_payload->>'eventId')::uuid;
    if not exists(select 1 from public.crew_registrations where event_id=v_event_id and member_id=v_uid) then
      raise exception 'Register for this event before requesting an attendance OTP.';
    end if;
    if exists(select 1 from public.crew_attendance where event_id=v_event_id and member_id=v_uid) then raise exception 'Attendance is already marked.'; end if;
    update public.crew_otps set used=true where event_id=v_event_id and member_id=v_uid and used=false;
    v_random:=gen_random_bytes(4);
    v_code:=lpad(((get_byte(v_random,0)::bigint*16777216+get_byte(v_random,1)::bigint*65536+get_byte(v_random,2)::bigint*256+get_byte(v_random,3)::bigint)%1000000)::text,6,'0');
    v_hash:=encode(digest(v_code,'sha256'),'hex');
    insert into public.crew_otps(event_id,member_id,code_hash,expires_at)
    values(v_event_id,v_uid,v_hash,now()+interval '5 minutes') returning * into v_otp;
    return jsonb_build_object('code',v_code,'expiresAt',v_otp.expires_at,
      'message','Show this code to an authorized admin. It expires in five minutes.');
  end if;

  if v_action='verify' and v_method='POST' then
    if v_profile.role not in ('admin','super_admin') then raise exception 'Admin access required to verify attendance.'; end if;
    v_event_id:=(p_payload->>'eventId')::uuid;
    if coalesce(p_payload->>'memberEmail','')='' or coalesce(p_payload->>'code','') !~ '^[0-9]{6}$' then
      raise exception 'Event, member email and six-digit OTP are required.';
    end if;
    select * into v_member from public.crew_profiles where lower(email)=lower(trim(p_payload->>'memberEmail'));
    if not found then raise exception 'Member account not found.'; end if;
    if not exists(select 1 from public.crew_registrations where event_id=v_event_id and member_id=v_member.auth_id) then
      raise exception 'Member is not registered for this event.';
    end if;
    if exists(select 1 from public.crew_attendance where event_id=v_event_id and member_id=v_member.auth_id) then raise exception 'Attendance already marked.'; end if;
    select * into v_otp from public.crew_otps where event_id=v_event_id and member_id=v_member.auth_id and used=false
    order by created_at desc limit 1 for update;
    if not found or v_otp.expires_at<now() then raise exception 'No active OTP. Ask the member to generate a new one.'; end if;
    v_hash:=encode(digest(p_payload->>'code','sha256'),'hex');
    if v_hash<>v_otp.code_hash then raise exception 'Incorrect OTP.'; end if;
    update public.crew_otps set used=true where id=v_otp.id and used=false;
    insert into public.crew_attendance(event_id,member_id,marked_by) values(v_event_id,v_member.auth_id,v_uid)
    on conflict(event_id,member_id) do nothing;
    return jsonb_build_object('message','Attendance marked for '||v_member.name);
  end if;

  if v_action='attendance' and v_method='GET' then
    if v_profile.role not in ('admin','super_admin') then raise exception 'Admin access required to view the attendance desk.'; end if;
    if coalesce(p_payload->>'eventId','')='' then raise exception 'Select an event.'; end if;
    v_event_id:=(p_payload->>'eventId')::uuid;
    select coalesce(jsonb_agg(jsonb_build_object('name',p.name,'email',p.email,'registered_at',r.registered_at,
      'attended',exists(select 1 from public.crew_attendance a where a.event_id=r.event_id and a.member_id=r.member_id)
    ) order by p.name),'[]'::jsonb) into v_roster
    from public.crew_registrations r join public.crew_profiles p on p.auth_id=r.member_id where r.event_id=v_event_id;
    select coalesce(jsonb_agg(jsonb_build_object('name',p.name,'email',p.email,'marked_at',a.marked_at,'marked_by',m.name)
      order by a.marked_at desc),'[]'::jsonb) into v_attendance
    from public.crew_attendance a join public.crew_profiles p on p.auth_id=a.member_id
    join public.crew_profiles m on m.auth_id=a.marked_by where a.event_id=v_event_id;
    return jsonb_build_object('roster',v_roster,'attendance',v_attendance);
  end if;

  if v_action='announcements' and v_method='POST' then
    if v_profile.role not in ('admin','super_admin') then raise exception 'Admin access required to post announcements.'; end if;
    v_title:=left(trim(coalesce(p_payload->>'title','')),140);
    v_description:=left(trim(coalesce(p_payload->>'body','')),5000);
    v_audience:=coalesce(p_payload->>'audience','all');
    if v_title='' or v_description='' then raise exception 'Headline and message are required.'; end if;
    if v_audience not in ('all','member','admin','super_admin') then raise exception 'Invalid audience.'; end if;
    insert into public.crew_announcements(title,body,audience,author_id) values(v_title,v_description,v_audience,v_uid)
    returning id into v_event_id;
    return jsonb_build_object('id',v_event_id,'message','Crew update published.');
  end if;

  if v_action='members' and v_method='GET' then
    if v_profile.role not in ('admin','super_admin') then raise exception 'Admin access required to view the crew directory.'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('auth_id',p.auth_id,'email',p.email,'name',p.name,'role',p.role,
      'created_at',p.created_at,'event_count',(select count(*)::int from public.crew_registrations r where r.member_id=p.auth_id)
    ) order by p.created_at desc),'[]'::jsonb) into v_members from public.crew_profiles p;
    return v_members;
  end if;

  if v_action='role' and v_method='PATCH' then
    if v_profile.role<>'super_admin' then raise exception 'Super Admin access required to change roles.'; end if;
    if coalesce(p_payload->>'authId','')='' or coalesce(p_payload->>'role','') not in ('admin','member') then raise exception 'Choose Member or Admin.'; end if;
    if p_payload->>'authId'=v_uid then raise exception 'You cannot change your own role.'; end if;
    update public.crew_profiles set role=p_payload->>'role' where auth_id=p_payload->>'authId';
    if not found then raise exception 'Crew account not found.'; end if;
    return jsonb_build_object('message','Role updated.');
  end if;
  raise exception 'Unknown crew route or unsupported method.';
end;
$$;
revoke all on function public.crew_api(text,text,jsonb) from public, anon;
grant execute on function public.crew_api(text,text,jsonb) to authenticated;
comment on function public.crew_api(text,text,jsonb) is 'Kinetic Crew HQ API. Requires Supabase Auth and performs server-side role checks.';
