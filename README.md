# Kinetic Crew HQ

A responsive, installable Crew HQ for Kinetic Crew. The GitHub Pages build uses static HTML/CSS/JavaScript, Supabase Auth, and a role-checked PostgreSQL RPC backend.

## GitHub Pages URL

After enabling Pages with GitHub Actions as the source, the site will be published at:

https://jamidineshkumar.github.io/kineticcrew/

Every push to main runs the deployment workflow.

## Included features

- Email OTP sign-in through Supabase Auth
- Super Admin, Admin and Member roles
- Create events, register members, and enforce event capacity
- Crew announcements with audience selection
- Six-digit attendance OTPs with five-minute expiry, hashed in the database and single-use verification
- Attendance desk and roster
- Crew directory and Super Admin role assignment
- Dark neon UI, responsive mobile layout, and installable PWA shell

## One-time setup

### 1. Apply the database migration

Open supabase/migrations/202610260001_kinetic_crew_hq.sql in this repository, copy its entire contents, then open your Supabase SQL Editor:

https://supabase.com/dashboard/project/hmkbukpudlvyihgntaju/sql/new

Paste the SQL and click Run. It creates only crew_* objects, enables RLS, revokes direct table access from browser roles, and grants authenticated users access only through a permission-checked RPC. It does not change KhetMitra tables.

### 2. Set up email sign-in

In Supabase Dashboard → Authentication → URL Configuration, add this Redirect URL:

https://jamidineshkumar.github.io/kineticcrew/**

In Authentication → Email Templates, ensure the sign-in email contains the one-time token placeholder {{ .Token }} if users should type the six-digit code into the app. If the template is link-based, the confirmation URL must redirect to the GitHub Pages app.

### 3. Enable GitHub Pages

In this repository, go to Settings → Pages and set Build and deployment → Source to GitHub Actions. The workflow publishes only public/.

### 4. Claim Super Admin

After deployment and migration, sign in with the intended owner email. New accounts start as Members by design; this prevents a random visitor from claiming the first-admin role. Once you have signed in and loaded Crew HQ at least once, open the Supabase SQL Editor and run this query after replacing the sample email with your exact account email:

    update public.crew_profiles set role = 'super_admin' where lower(email) = lower('YOUR_EMAIL@example.com') returning email, role;

Confirm the returned email is yours, then refresh Crew HQ. Only the project owner can run this promotion. Admins can later promote Members from Crew Directory.

## Configuration

public/config.js contains only the Supabase URL and publishable client key. These are browser-visible public values; never replace the key with a service_role or secret key. The current config uses the existing Supabase project URL from KhetMitra, but all Crew data is isolated in crew_* tables. For cleaner production separation, create a dedicated Supabase project and update the two config values before applying the migration.

The app base path is configured as /kineticcrew/, which matches the GitHub Pages project URL. If the repository is renamed, update basePath in public/config.js.

## Mobile and remaining limits

- On Android Chrome, open the app and select Install app / Add to Home screen.
- A native Android APK/AAB has not been built.
- Push notifications delivered while the app is closed are not configured.
- GitHub Pages hosts the static UI; Supabase provides authentication and database actions.
- A starter event is seeded into an empty crew_events table; event deletion/editing is not part of this version.

## Security notes

- The browser key is the Supabase publishable key, not a secret.
- Crew tables have direct privileges revoked for anon and authenticated roles.
- Client data operations run through crew_api, which checks the current Supabase user and role on the server.
- New accounts start as Members. The project owner must explicitly promote the intended owner account using the SQL command above; this prevents first-visitor admin takeover.
