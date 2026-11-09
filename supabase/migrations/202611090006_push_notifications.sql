-- Secure device-token registry for Firebase Cloud Messaging.
create table if not exists public.crew_push_tokens (
  id uuid primary key default gen_random_uuid(),
  auth_id text not null references public.crew_profiles(auth_id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('web','android','ios')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crew_push_tokens_auth_id_idx on public.crew_push_tokens(auth_id);
alter table public.crew_push_tokens enable row level security;
revoke all on public.crew_push_tokens from anon, authenticated;
