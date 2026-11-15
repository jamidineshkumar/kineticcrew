import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (value: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]!));

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(url, service);

  try {
    const body = await req.json();
    const id = String(body.applicationId || "").trim();
    const token = String(body.trackingToken || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f]{64}$/i.test(token)) {
      return json({ error: "A valid application reference and private tracking token are required." }, 400);
    }

    const { data: app, error: appError } = await db.from("crew_audition_applications")
      .select("id,name,email,application_status,tracking_token_sha256")
      .eq("id", id).maybeSingle();
    if (appError) throw appError;
    if (!app) return json({ error: "Application not found." }, 404);
    if (app.tracking_token_sha256 !== await sha256(token)) {
      return json({ error: "The private tracking link could not be verified." }, 403);
    }
    const email = String(app.email || "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: "The personal email address is invalid." }, 400);

    const key = "audition-application-link:" + app.id;
    const { data: existing, error: existingError } = await db.from("crew_email_delivery_log")
      .select("status").eq("idempotency_key", key).eq("recipient_email", email).maybeSingle();
    if (existingError) throw existingError;
    if (existing?.status === "sent") return json({ ok: true, alreadySent: true });

    const stale = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    await db.from("crew_email_delivery_log").delete()
      .eq("idempotency_key", key).eq("recipient_email", email).eq("status", "sending").lt("created_at", stale);
    const { data: claim, error: claimError } = await db.from("crew_email_delivery_log")
      .insert({ idempotency_key: key, recipient_email: email, status: "sending" })
      .select("recipient_email").maybeSingle();
    if (claimError?.code === "23505") return json({ ok: true, inProgress: true });
    if (claimError) throw claimError;
    if (!claim) return json({ ok: true, inProgress: true });

    const smtpUser = Deno.env.get("SMTP_USER") || "kineticcreww@gmail.com";
    const smtpPass = Deno.env.get("SMTP_PASS");
    if (!smtpPass) {
      await db.from("crew_email_delivery_log").delete().eq("idempotency_key", key).eq("recipient_email", email);
      return json({ error: "SMTP_PASS is not configured in Supabase Edge Function secrets." }, 503);
    }

    const trackingUrl = "https://kineticcrew.vercel.app/track-application.html?token=" + encodeURIComponent(token);
    const mailer = nodemailer.createTransport({
      host: "smtp.gmail.com", port: 465, secure: true,
      auth: { user: smtpUser, pass: smtpPass },
    });
    try {
      await mailer.verify();
      await mailer.sendMail({
        from: { name: "Kinetic Crew", address: smtpUser },
        to: email,
        subject: "Your Kinetic Crew audition application was received",
        text:
          "Hello " + String(app.name || "Applicant") + ",\n\n" +
          "Your Kinetic Crew audition application has been received successfully.\n\n" +
          "Use this private link to track your application status:\n" + trackingUrl +
          "\n\nKeep this link private. It is intended only for the personal email address used in your application.\n\nKinetic Crew",
        html:
          '<!doctype html><html><body style="margin:0;padding:28px;background:#09080d;color:#f7f4f8;font-family:Arial,sans-serif">' +
          '<div style="max-width:520px;margin:auto"><p style="letter-spacing:4px;color:#f0a2cf;font-size:11px;font-weight:bold">KINETIC CREW · AUDITIONS</p>' +
          '<h1 style="font-size:30px;margin:12px 0">Application received</h1>' +
          '<div style="padding:24px;border:1px solid #55404e;border-radius:22px;background:#211720">' +
          '<p>Hello ' + esc(app.name) + ',</p><p>Your audition application has been received successfully.</p>' +
          '<p style="margin:26px 0"><a href="' + esc(trackingUrl) + '" style="display:inline-block;padding:14px 20px;border-radius:12px;background:#d94691;color:white;text-decoration:none;font-weight:bold">Track Application</a></p>' +
          '<p style="font-size:12px;color:#c4b7c4">Keep this private link confidential. It is intended only for you.</p></div>' +
          '<p style="font-size:12px;color:#9f96a2;margin-top:18px">Kinetic Crew</p></div></body></html>',
      });
      const { error: markError } = await db.from("crew_email_delivery_log").update({
        status: "sent", sent_at: new Date().toISOString(),
      }).eq("idempotency_key", key).eq("recipient_email", email);
      if (markError) throw markError;
      return json({ ok: true, sent: 1 });
    } catch (mailError) {
      await db.from("crew_email_delivery_log").delete().eq("idempotency_key", key).eq("recipient_email", email);
      console.error("Audition application email failed:", String(mailError));
      return json({ error: "The application was saved, but the tracking email could not be sent. Please retry." }, 503);
    }
  } catch (error) {
    console.error("send-audition-application-link:", error);
    return json({ error: error instanceof Error ? error.message : "Could not send the tracking email." }, 500);
  }
});