import { createClient } from "npm:@supabase/supabase-js@2";
import { brandedEmail } from "./email-template.ts";
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

function readKey(primary: string, legacy: string) {
  const raw = Deno.env.get(primary);
  if (raw) {
    try { const parsed = JSON.parse(raw); if (typeof parsed === "string") return parsed; if (parsed && typeof parsed === "object") return parsed.default || Object.values(parsed).find(v => typeof v === "string") || ""; }
    catch { return raw; }
  }
  return Deno.env.get(legacy) || "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required." }, 405);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const service = readKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
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
        html:brandedEmail({title:"Application received",subtitle:"Your audition application was received successfully.",contentHtml:'<p style="margin:0 0 12px;">Hello '+esc(app.name)+',</p><p style="margin:0;color:#c2bec8;">Use the private link below to check your application status. Keep this link confidential.</p>',buttonLabel:"Track application",buttonUrl:trackingUrl}),
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