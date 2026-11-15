# Audition Portal deployment notes

## Supabase project

Project: lkdfjiweqxshbbcadfna

Applied live migrations:
- 20261115043541 — audition portal base schema and role-gated read-only API
- 20261115043918 — account attachment and rejection cleanup workflow
- 20261115044005 — temporary credentials
- 20261115044120 — credential verification hardening and attempt limits
- 20261115044321 — forced temporary-password change guard
- 20261115044340 — rejection cleanup retry/finalization
- 20261115044649 — event feed and username fields for the audition client
- 20261115044900 — audition admin review payload includes video storage path
- 20261115044912 — unique audition usernames

Important RPCs:
- crew_audition_submit
- crew_audition_list_applications
- crew_audition_prepare_credentials
- crew_audition_verify_credentials
- crew_audition_claim_credentials
- crew_audition_my_status
- crew_audition_review
- crew_audition_prepare_rejection_delete
- crew_audition_finalize_rejection

## External KC Forma

The Base44 form still needs to call crew_audition_submit. See BASE44_AUDITION_FORM_INTEGRATION.md. The existing Base44 UI was not modified from this repository.

## Email behaviour

Admin generates an 8-character temporary password. It is hashed in Supabase, then the Admin's default email app opens a draft to the applicant. Admin must review and tap Send. This avoids storing a plaintext temporary password or exposing SMTP secrets in browser code.
