alter table public.crew_audition_applications add column if not exists tracking_token_sha256 text;
create unique index if not exists crew_audition_applications_tracking_token_uidx on public.crew_audition_applications(tracking_token_sha256) where tracking_token_sha256 is not null;
-- Function definitions are applied through the Supabase migration runner; this file mirrors the live native audition tracking migration.
