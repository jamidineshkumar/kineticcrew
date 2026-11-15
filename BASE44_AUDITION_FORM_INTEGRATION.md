# KC Forma → Kinetic Crew Audition Portal integration

The Kinetic Crew database exposes a public, narrowly scoped RPC for KC Forma submissions. The Base44 form should call it only after the applicant has completed the form. Keep the existing KC Forma UI and success screen.

## Submission request

Map the actual Base44 field names to the placeholders below:

~~~js
const { data, error } = await supabase.rpc("crew_audition_submit", {
  p_name: formData.fullName,
  p_email: formData.email,
  p_video_url: formData.auditionVideoUrl,
  p_details: {
    phone: formData.phone,
    registrationNumber: formData.registrationNumber,
    instagram: formData.instagram
  },
  p_video_storage_path: formData.auditionVideoStoragePath || null
});

if (error || !data?.ok) {
  throw new Error(error?.message || "Could not submit your audition application.");
}
setSuccessMessage(
  "Application submitted successfully. The Kinetic Crew team will contact you with your login details soon."
);
~~~

If Base44 does not have a Supabase client configured, call this REST RPC endpoint:

- URL: https://lkdfjiweqxshbbcadfna.supabase.co/rest/v1/rpc/crew_audition_submit
- Method: POST
- Headers: apikey, Authorization: Bearer <public publishable key>, Content-Type: application/json
- Body keys: p_name, p_email, p_video_url, p_details, p_video_storage_path

Only use the public publishable key in Base44. Never put a service-role or secret key in browser code.

## Required form fields

- Applicant's full name
- Applicant's registered email
- HTTPS URL for the audition video
- Additional application details in p_details

If the video is uploaded to the Supabase audition-videos bucket, pass its object path as p_video_storage_path. If Base44 hosts the video itself, pass its HTTPS URL in p_video_url; deletion of the external Base44 file must also be handled by Base44.

## Applicant account activation

When Admin issues credentials, the Admin page generates a unique username and an 8-character temporary password. The password is stored only as a one-way hash in Supabase. The Admin's email app opens a draft; the Admin must review and tap Send.

The applicant opens the email link, uses Sign Up with the exact emailed username, email, and temporary password, verifies their email, and is routed into the separate Audition Portal. The first sign-in forces a permanent password change.
