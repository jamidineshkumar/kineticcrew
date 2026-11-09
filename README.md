# Kinetic Crew HQ

A responsive, installable Crew HQ for Kinetic Crew. The GitHub Pages build uses static HTML/CSS/JavaScript, Supabase Auth, a PostgreSQL role-checked RPC backend, and a Supabase Edge Function for username/password login.

## GitHub Pages

https://jamidineshkumar.github.io/kineticcrew/

Every push to `main` runs the deployment workflow.

## Authentication

- Registration collects full name, unique username, email and password.
- Email verification is required before the account can sign in.
- Subsequent sign-in uses username + password.
- Passwords are managed only by Supabase Auth; they are never stored in `crew_profiles`.
- New accounts receive the Member role. Super Admin and Admin roles must be assigned separately.

## Database setup — dedicated Kinetic Crew project

The frontend configuration in `public/config.js` points to the dedicated Kinetic Crew Supabase project. It contains only the project URL and browser publishable key. Never put a service-role key or database password in this file.

Run these SQL migrations in order in the new project's SQL Editor:

1. `supabase/migrations/202610260001_kinetic_crew_hq.sql`
2. `supabase/migrations/202611090001_crew_usernames.sql`
3. `supabase/migrations/202611090002_profile_edit.sql`
4. `supabase/migrations/202611090003_attendance_events.sql`
5. `supabase/migrations/202611090004_initial_operator_roles.sql`
6. `supabase/migrations/202611090005_feature_suite.sql`
7. `supabase/migrations/202611090006_push_notifications.sql`

The migrations must be applied in the listed order. They create the crew tables and permission-checked APIs, add unique usernames and profile editing, implement QR/OTP attendance and event finalization, seed the initial operator role, add the feature suite (rehearsals, leave, expenses, memories, auditions, polls, chat and achievements), and add push-subscription storage. All application tables are prefixed `crew_`.

## Deploy username login Edge Function

The username/password login endpoint maps a username to its verified account email on the server and then calls Supabase Auth. It does not return the email address to the browser.

Deploy `supabase/functions/username-login/index.ts` as an Edge Function named `username-login`. Set these function secrets in the dedicated project:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

The service-role key is used only inside the Edge Function to look up the username. Never expose it to the browser, GitHub source, or public logs. Deploy with the Supabase CLI after linking the new project, for example:

```sh
supabase login
supabase link --project-ref lkdfjiweqxshbbcadfna
supabase secrets set SUPABASE_URL=https://lkdfjiweqxshbbcadfna.supabase.co SUPABASE_ANON_KEY=<publishable-or-anon-key> SUPABASE_SERVICE_ROLE_KEY=<service-role-secret>
supabase functions deploy username-login
```

Do not commit the secret values. Use your local terminal to supply them.

## Supabase Auth configuration

In Authentication → URL Configuration, set the Site URL to the deployed Kinetic Crew URL and add this Redirect URL:

`https://jamidineshkumar.github.io/kineticcrew/**`

In Authentication → Email Templates, configure the signup/confirmation email to display the six-digit token using `{{ .Token }}`. The app verifies it with the Supabase `signup` OTP flow. Ensure email confirmations are enabled.

## First Super Admin

After the owner account has registered and verified its email, run this once in the Supabase SQL Editor, replacing the email with the owner's address:

```sql
update public.crew_profiles
set role = 'super_admin'
where lower(email) = lower('jamidinesh77@gmail.com')
returning email, username, role;
```

The Super Admin can then promote the intended Admin account from Crew Directory. Never grant Super Admin based only on a user-supplied email during public registration.

## Existing features

- Events and event registrations with capacity enforcement
- Crew calendar and participation leaderboard
- Rehearsal scheduling, leave requests and admin approvals
- Audition submissions and selection workflow
- Crew polls with voting and results
- Shared memories, crew chat and achievement awards
- Expense records for admins
- Crew announcements with audience selection
- Six-digit attendance OTPs with five-minute expiry and single-use verification
- Attendance desk and roster
- Crew directory and Super Admin role assignment
- Dark neon UI, responsive mobile layout, and installable PWA shell

## Remaining integrations

- Push notifications while the app is closed require web-push subscription storage and a delivery service.
- SMS OTP/alerts require an SMS provider and verified sender configuration.
- A native Android APK/AAB has not been built; the current mobile delivery is an installable PWA.
- Event editing/deletion and additional management workflows remain future implementation work.

## Security notes

- Browser configuration contains only a public publishable key.
- Password authentication is handled by Supabase Auth.
- Username-to-email resolution happens inside the Edge Function using the server-side service-role secret.
- Crew tables revoke direct browser-role access and use the server-side `crew_api` function for role-checked operations.
