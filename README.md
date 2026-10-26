# Kinetic Crew HQ

Unified management app for Kinetic Crew: a responsive, installable web/PWA experience for Super Admin, Admin and Member roles.

## Live preview
**App:** https://kinetic-crew-hq.hatchable.site  
**Project console:** https://hatchable.com/console/projects/kinetic-crew-hq

The hosted project is currently **private**. Its permanent URL shows the host's sign-in wall to non-collaborators until the owner changes visibility in Hatchable Settings. A temporary stranger-view preview link can be shared for a short review window.

## Features
- Email one-time-code sign-in through the hosting platform
- Role-aware Super Admin, Admin and Member dashboards
- Event creation, member registrations and capacity counts
- Crew announcements with audience selection
- Attendance OTPs: six digits, five-minute expiry and single-use verification
- Crew directory and Super Admin role assignment
- Responsive dark/neon interface and installable PWA manifest
- Hosted PostgreSQL schema and migrations
- Backend access gating and role checks

## Source structure
- `public/`: app shell, custom sign-in page, client JavaScript, CSS and PWA manifest
- `api/crew/[...path].js`: backend endpoints for roles, events, announcements, registrations and attendance
- `migrations/`: persistent PostgreSQL tables and an initial demo event
- `hatchable.toml`: hosted authentication and announcement row-access policy

This repository is the source for the hosted app. The server APIs use the hosting platform's database/auth SDK, so they are not intended to run with a plain `npm install` or a local Express server.

## First account and role setup — important
On an empty crew database, the **first person to sign in** is provisioned as Super Admin. Later sign-ins start as Members. Keep the project private and open the preview yourself first so you claim Super Admin before you make the app publicly accessible. After that, Super Admin can promote a signed-in member to Admin from Crew Directory.

## Mobile
The app is responsive and includes a PWA manifest. On Android, open it in Chrome and use **Install app** / **Add to Home screen**. A native signed Android APK/AAB has **not** been built yet.

## Not yet configured
- Push notifications that arrive while the app is closed
- Native Android APK/AAB packaging
- Permanent public visibility (the owner must change this in Hatchable Settings)

Never commit production secrets or real member records. Configure and validate account permissions before inviting the full crew.
