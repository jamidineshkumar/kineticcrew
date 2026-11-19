create table if not exists public.kc_passkey_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  credential_id text not null unique,
  public_key text not null,
  counter bigint not null default 0,
  transports text[] not null default '{}',
  rp_id text not null,
  origin text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists kc_passkey_credentials_user_idx on public.kc_passkey_credentials(user_id);
create table if not exists public.kc_passkey_challenges (
  user_id uuid primary key references auth.users(id) on delete cascade,
  challenge text not null,
  purpose text not null check (purpose in ('registration','authentication')),
  rp_id text not null,
  origin text not null,
  expires_at timestamptz not null
);
alter table public.kc_passkey_credentials enable row level security;
alter table public.kc_passkey_challenges enable row level security;
revoke all on public.kc_passkey_credentials from anon, authenticated;
revoke all on public.kc_passkey_challenges from anon, authenticated;
grant all on public.kc_passkey_credentials to service_role;
grant all on public.kc_passkey_challenges to service_role;
