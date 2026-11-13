import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required." }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authorization = req.headers.get("Authorization") || "";
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return json({ error: "Sign in required." }, 401);
  const adminClient = createClient(url, service);
  const { data: actor, error: actorError } = await adminClient.from("crew_profiles")
    .select("auth_id,role,approval_status").eq("auth_id", authData.user.id).maybeSingle();
  if (actorError || !actor || actor.approval_status !== "approved" || !["admin", "super_admin"].includes(actor.role)) {
    return json({ error: "Only approved Admins and Super Admins can send crew email." }, 403);
  }
  try {
    const body = await req.json();
    const title = String(body.title || "").trim().slice(0, 140);
    const message = String(body.body || "").trim().slice(0, 5000);
    const audience = String(body.audience || "all");
    const emailKey = String(body.emailKey || "").trim().slice(0, 180);
    if (!title || !message || !emailKey) return json({ error: "Title, message and email delivery key are required." }, 400);
    if (!["all", "member", "admin", "super_admin"].includes(audience)) return json({ error: "Invalid email audience." }, 400);
    const smtpUser = Deno.env.get("SMTP_USER") || "kineticcreww@gmail.com";
    const smtpPass = Deno.env.get("SMTP_PASS");
    if (!smtpPass) return json({ error: "SMTP_PASS is not configured in Supabase Edge Function secrets." }, 503);
    let query = adminClient.from("crew_profiles").select("auth_id,name,email,role").eq("approval_status", "approved");
    if (audience !== "all") query = query.eq("role", audience);
    const { data: profiles, error: profilesError } = await query;
    if (profilesError) throw profilesError;
    const recipients = (profiles || []).filter((profile: any) => /^\S+@\S+\.\S+$/.test(String(profile.email || "").trim()));
    if (recipients.length > 500) return json({ error: "This audience has more than 500 email recipients. Narrow the audience and retry." }, 400);
    if (!recipients.length) return json({ ok: true, sent: 0, skipped: 0, failed: 0, message: "No approved crew members with email addresses were found." });
    const mailer = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: smtpUser, pass: smtpPass } });
    try { await mailer.verify(); } catch (error) {
      console.error("Crew SMTP verification failed:", error instanceof Error ? error.message : error);
      return json({ error: "Could not connect to Kinetic Crew Gmail SMTP. Check SMTP_USER and SMTP_PASS." }, 503);
    }
    const safeTitle = escapeHtml(title);
    const safeBody = escapeHtml(message).replace(/\r?\n/g, "<br>");
    let sent = 0, skipped = 0, failed = 0;
    for (const recipient of recipients) {
      const email = String(recipient.email).trim().toLowerCase();
      const staleBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      await adminClient.from("crew_email_delivery_log").delete()
        .eq("idempotency_key", emailKey).eq("recipient_email", email).eq("status", "sending").lt("created_at", staleBefore);
      const { data: claim, error: claimError } = await adminClient.from("crew_email_delivery_log")
        .insert({ idempotency_key: emailKey, recipient_email: email, status: "sending" })
        .select("recipient_email").maybeSingle();
      if (claimError?.code === "23505") { skipped++; continue; }
      if (claimError) throw claimError;
      if (!claim) { skipped++; continue; }
      try {
        await mailer.sendMail({
          from: "\"KINETIC CREW\" <" + smtpUser + ">",
          to: email,
          subject: title + " · Kinetic Crew",
          text: message,
          html: '<body style="margin:0;padding:24px;background:#0b1110;color:#f4f0e5;font-family:Arial,sans-serif"><table role="presentation" width="100%" style="max-width:600px;margin:auto;background:#141d1a;border:1px solid #4b5b4e;border-radius:20px;padding:28px"><tr><td><div style="font-size:11px;letter-spacing:3px;color:#d7bd75;font-weight:bold">KINETIC CREW</div><h1 style="font-size:25px;color:#fff8e8;margin:20px 0 12px">' + safeTitle + '</h1><p style="font-size:14px;line-height:1.7;color:#d0d3c8">' + safeBody + '</p><div style="margin-top:26px;padding-top:16px;border-top:1px solid #ffffff22;font-size:10px;letter-spacing:2px;color:#9ba79e">KINETIC CREW · BUILT TO MOVE TOGETHER</div></td></tr></table></body>'
        });
        const { error: sentLogError } = await adminClient.from("crew_email_delivery_log").update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("idempotency_key", emailKey).eq("recipient_email", email);
        if (sentLogError) throw sentLogError;
        sent++;
      } catch (mailError) {
        await adminClient.from("crew_email_delivery_log").delete().eq("idempotency_key", emailKey).eq("recipient_email", email);
        failed++;
        console.error("Crew email delivery failed:", email, String(mailError instanceof Error ? mailError.message : mailError).slice(0, 240));
      }
    }
    return json({ ok: true, sent, skipped, failed, message: "Email delivered to " + sent + " approved crew member(s)." });
  } catch (error) {
    console.error("send-crew-email:", error);
    return json({ error: error instanceof Error ? error.message : "Crew email delivery failed." }, 500);
  }
});
