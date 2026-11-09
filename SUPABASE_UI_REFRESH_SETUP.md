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
