-- Allow the Super Admin logo publisher to insert and replace the external_forms
-- destination object. The upload code already writes brand/destinations/external_forms.png;
-- the previous Storage RLS allow-list omitted this filename.
drop policy if exists "Super Admin uploads Kinetic Crew brand logo" on storage.objects;
create policy "Super Admin uploads Kinetic Crew brand logo"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'crew-brand-assets'
  and name in (
    'brand/kinetic-crew-logo.png',
    'brand/email-logo.png',
    'brand/destinations/app.png',
    'brand/destinations/browser.png',
    'brand/destinations/pwa.png',
    'brand/destinations/signin.png',
    'brand/destinations/email.png',
    'brand/destinations/notifications.png',
    'brand/destinations/share_cards.png',
    'brand/destinations/external_forms.png'
  )
  and exists (
    select 1 from public.crew_profiles p
    where p.auth_id = (select auth.uid())::text
      and p.role = 'super_admin'
  )
);

drop policy if exists "Super Admin replaces Kinetic Crew brand logo" on storage.objects;
create policy "Super Admin replaces Kinetic Crew brand logo"
on storage.objects for update to authenticated
using (
  bucket_id = 'crew-brand-assets'
  and name in (
    'brand/kinetic-crew-logo.png',
    'brand/email-logo.png',
    'brand/destinations/app.png',
    'brand/destinations/browser.png',
    'brand/destinations/pwa.png',
    'brand/destinations/signin.png',
    'brand/destinations/email.png',
    'brand/destinations/notifications.png',
    'brand/destinations/share_cards.png',
    'brand/destinations/external_forms.png'
  )
  and exists (
    select 1 from public.crew_profiles p
    where p.auth_id = (select auth.uid())::text
      and p.role = 'super_admin'
  )
)
with check (
  bucket_id = 'crew-brand-assets'
  and name in (
    'brand/kinetic-crew-logo.png',
    'brand/email-logo.png',
    'brand/destinations/app.png',
    'brand/destinations/browser.png',
    'brand/destinations/pwa.png',
    'brand/destinations/signin.png',
    'brand/destinations/email.png',
    'brand/destinations/notifications.png',
    'brand/destinations/share_cards.png',
    'brand/destinations/external_forms.png'
  )
  and exists (
    select 1 from public.crew_profiles p
    where p.auth_id = (select auth.uid())::text
      and p.role = 'super_admin'
  )
);

notify pgrst, 'reload schema';
