create table if not exists public.crew_email_delivery_log (
  idempotency_key text not null,
  recipient_email text not null,
  status text not null default 'sending' check (status in ('sending','sent')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  primary key (idempotency_key, recipient_email)
);
alter table public.crew_email_delivery_log enable row level security;
revoke all on public.crew_email_delivery_log from anon, authenticated;
grant all on public.crew_email_delivery_log to service_role;

create or replace function public.crew_guard_announcement_publisher()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_role text;
  v_request_role text;
begin
  v_request_role := coalesce(current_setting('request.jwt.claim.role', true), '');
  if v_request_role = 'service_role' then
    if coalesce(new.title, '') not like 'KC Meet invitation:%' then
      raise exception 'Service role may only create KC Meet invitation announcements.';
    end if;
    if not exists (
      select 1 from public.crew_profiles
      where auth_id = new.author_id
        and approval_status = 'approved'
        and role in ('admin','super_admin')
    ) then
      raise exception 'KC Meet invitation must be created by an approved Admin or Super Admin.';
    end if;
    return new;
  end if;
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  select role into v_role from public.crew_profiles where auth_id = auth.uid()::text;
  if coalesce(v_role,'') <> 'super_admin' then
    raise exception 'Only the Super Admin can publish crew updates.';
  end if;
  new.author_id := auth.uid()::text;
  return new;
end;
$$;
notify pgrst, 'reload schema';
