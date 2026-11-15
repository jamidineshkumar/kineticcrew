create table if not exists public.crew_audition_push_events (
  application_id uuid primary key references public.crew_audition_applications(id) on delete cascade,
  status text not null default 'sending' check (status in ('sending','sent','no_devices','failed')),
  sent_count integer not null default 0 check (sent_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);
alter table public.crew_audition_push_events enable row level security;
revoke all on table public.crew_audition_push_events from public, anon, authenticated;
grant all on table public.crew_audition_push_events to service_role;