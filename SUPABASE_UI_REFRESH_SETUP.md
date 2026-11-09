# Kinetic Crew UI refresh — backend setup

The refreshed client adds a shared crew group chat and profile-photo uploads. These require one new Supabase migration.

## Apply the migration

1. Open the Kinetic Crew Supabase project.
2. Open **SQL Editor** and create a new query.
3. Copy the complete contents of `supabase/migrations/202611090007_chat_avatar.sql` from this branch.
4. Run it once. It creates the crew chat message table and secure RPC, the profile avatar URL field and RPC, and the public avatar storage bucket with per-user upload/update policies.
5. Reload the app and sign in again.

Apply the existing migrations first, in filename order, through `202611090006_push_notifications.sql`. Then apply `202611090007_chat_avatar.sql`.

## What members see

- Crew chat is a separate shared group conversation, not an announcement feed. Messages refresh every five seconds.
- Members can upload a JPG, PNG or WebP profile photo up to 5 MB.
- App settings provide theme, motion, notification, profile and install shortcuts.
- Members keep the everyday navigation; admin-only tools remain restricted to admins.

## Deployment note

This branch is prepared for review and mobile build testing. It has not been merged to `main` or deployed to the live website. Merge only after the preview and Supabase migration have been checked.


## App release notifications (new)

Apply `supabase/migrations/202611090008_app_releases.sql` after migration 007.

- Only a **Super Admin** can publish an app release.
- Publishing creates a permanent versioned release record and one unread in-app notification for every existing crew account.
- Members see a release popup the next time they open the app; active sessions check for new releases every 30 seconds.
- The notification includes the version, title, summary, feature list, fixes and publish date.
- Members can revisit all releases in Notifications > App updates.
- Notification preferences (signature tone, soft chime, double pulse, minimal pop, silent, volume and vibration) are stored per device.

The custom tone is an in-app sound. Browsers and mobile operating systems control sound for notifications delivered while the app is fully closed; the app cannot override those system-level sounds. Push delivery also requires notification permission and working Firebase configuration.
