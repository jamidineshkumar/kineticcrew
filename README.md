# Kinetic Crew HQ

Unified management app for Kinetic Crew: one responsive web/PWA experience for Super Admin, Admin and Member roles.

## Live preview
Hosted preview: https://kinetic-crew-hq.hatchable.site

The project currently has **private visibility**. A temporary preview link can be used to view it during testing; to allow all members to sign up permanently, the owner must switch project visibility to public in Hatchable Settings.

## Features
- Email one-time-code sign-in backed by the host's auth service
- Separate role-aware dashboards
- Event creation and member registrations
- Crew announcements with audience filters
- Attendance OTPs: six digits, five-minute expiry, single use
- Crew directory and super-admin role changes
- Mobile responsive layout and installable PWA manifest
- PostgreSQL schema migrations

## Repository structure
- `public/`: hosted app HTML, CSS, JavaScript, manifest and custom login page
- `api/crew/[...path].js`: hosted API with role checks
- `migrations/`: database schema and initial demo event
- `hatchable.toml`: hosted auth and row access policy
- `client/` and `server/`: local development starter files

## First sign-in and role setup
On an empty database, the first person to sign in is provisioned as Super Admin. Later accounts start as Members; the Super Admin can promote them to Admin using Crew Directory. Only share the preview with the intended initial owner until first sign-in is complete.

## Mobile
The app is mobile-first and has a PWA manifest. It can be opened in Android Chrome and added to the home screen. A signed Android APK/AAB has not been built in this repository yet.

## Deployment and privacy
The preview uses hosted PostgreSQL and hosted email-code auth. App push notifications while closed are not configured. Before public launch, review privacy/visibility, validate role assignment with actual member accounts, and configure push delivery if needed. Do not commit credentials or real member records.
