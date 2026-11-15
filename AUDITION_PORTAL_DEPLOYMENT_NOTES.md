# Kinetic Crew Audition Portal

## Live Supabase project
Project: lkdfjiweqxshbbcadfna

## Public application flow
- The login page's “Not a crew member yet?” link opens \`/audition-application.html\`.
- The native form submits to \`crew_audition_submit\`.
- Supabase stores the applicant details, audition video URL and a hash of a private tracking token.
- The browser invokes \`send-audition-application-link\`; only the personal email supplied by the applicant receives the private Track Application link.
- \`/track-application.html?token=...\` verifies the token through \`crew_audition_track_status\` and shows the submitted details, video and current review decisions.

## Admin review
- Admin and Super Admin review the same submitted audition video independently.
- Review does not require the applicant to create an account or receive credentials first.
- Both Accept: status becomes \`selected\`; the selection email function issues a unique username and 8-character temporary password.
- Both Reject: status becomes \`rejected\`.
- Different decisions: status becomes \`review_disagreement\`; no member access is issued.
- The Admin page refreshes the application list automatically and supports Excel export.

## Final member activation
- The selected applicant receives member credentials at the personal email address.
- The applicant opens the supplied login link, signs up with the exact username, personal email and temporary password, and verifies the email.
- The credential claim attaches the new account to the selected application and promotes it to the regular Member role.
- The applicant is required to change the temporary password before entering the main app.

## Email functions
- \`send-audition-application-link\`: public invocation, but validates the application ID and private tracking token before sending.
- \`send-audition-selection-email\`: authenticated Admin/Super Admin only; requires final \`selected\` status and sends member credentials.
- Both functions use Supabase Edge Function secrets \`SMTP_USER\` and \`SMTP_PASS\`; the default sender is \`kineticcreww@gmail.com\`.

The old Base44 form integration is retired. The separate Crew Confirmation page now redirects to the native audition application.
