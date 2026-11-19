create table if not exists public.kc_webauthn_credentials (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 credential_id text not null unique,
 public_key text not null,
 sign_count bigint not null default 0,
 transports text[] not null default '{}',
 device_type text,
 backed_up boolean not null default false,
 created_at timestamptz not null default now(),
 last_used_at timestamptz
);
create index if not exists kc_webauthn_credentials_user_id_idx on public.kc_webauthn_credentials(user_id);
create table if not exists public.kc_webauthn_challenges (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 purpose text not null check (purpose in ('registration','authentication')),
 challenge text not null,
 expires_at timestamptz not null,
 created_at timestamptz not null default now()
);
create index if not exists kc_webauthn_challenges_lookup_idx on public.kc_webauthn_challenges(user_id,purpose,created_at desc);
alter table public.kc_webauthn_credentials enable row level security;
alter table public.kc_webauthn_challenges enable row level security;
revoke all on public.kc_webauthn_credentials from anon, authenticated;
revoke all on public.kc_webauthn_challenges from anon, authenticated;
grant all on public.kc_webauthn_credentials to service_role;
grant all on public.kc_webauthn_challenges to service_role;
