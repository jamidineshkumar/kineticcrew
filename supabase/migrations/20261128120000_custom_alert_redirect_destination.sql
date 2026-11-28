alter table public.crew_scheduled_pushes
  add column if not exists destination_url text;

comment on column public.crew_scheduled_pushes.destination_url is
  'Validated HTTPS external URL or same-origin app path to open when a custom alert notification is tapped.';
