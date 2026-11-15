import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]!));
const randomText = (length: number) => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, b => chars[b % chars.length]).join("");
};
const sha256 = async (value: string) => {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
};

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

  const db = createClient(url, service);
  const { data: actor, error: actorError } = await db.from("crew_profiles")
    .select("auth_id,role,approval_status").eq("auth_id", authData.user.id).maybeSingle();
  if (actorError || !actor || actor.approval_status !== "approved" || !["admin", "super_admin"].includes(actor.role)) {
    return json({ error: "Only approved Admins and Super Admins can issue final selection credentials." }, 403);
  }

  try {
    const body = await req.json();
    const id = String(body.applicationId || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "A valid application ID is required." }, 400);
    const { data: app, error: appError } = await db.from("crew_audition_applications")
      .select("id,name,email,application_status,auth_id").eq("id", id).maybeSingle();
    if (appError) throw appError;
    if (!app) return json({ error: "Audition application not found." }, 404);
    if (app.application_status !== "selected") {
      return json({ error: "Both Admin and Super Admin must accept before member credentials can be issued." }, 409);
    }
    if (app.auth_id) return json({ ok: true, alreadyActivated: true, message: "Member account is already activated." });

    const email = String(app.email || "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: "The applicant's personal email address is invalid." }, 400);
    const key = "audition-selected-credentials:" + app.id;
    const { data: existing, error: existingError } = await db.from("crew_email_delivery_log")
      .select("status").eq("idempotency_key", key).eq("recipient_email", email).maybeSingle();
    if (existingError) throw existingError;
    if (existing?.status === "sent") return json({ ok: true, alreadySent: true, message: "Selection credentials were already emailed." });

    const stale = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    await db.from("crew_email_delivery_log").delete()
      .eq("idempotency_key", key).eq("recipient_email", email).eq("status", "sending").lt("created_at", stale);
    const { data: claim, error: claimError } = await db.from("crew_email_delivery_log")
      .insert({ idempotency_key: key, recipient_email: email, status: "sending" })
      .select("recipient_email").maybeSingle();
    if (claimError?.code === "23505") return json({ ok: true, inProgress: true, message: "Selection email is already being processed." });
    if (claimError) throw claimError;
    if (!claim) return json({ ok: true, inProgress: true });

    const smtpUser = Deno.env.get("SMTP_USER") || "kineticcreww@gmail.com";
    const smtpPass = Deno.env.get("SMTP_PASS");
    if (!smtpPass) {
      await db.from("crew_email_delivery_log").delete().eq("idempotency_key", key).eq("recipient_email", email);
      return json({ error: "SMTP_PASS is not configured in Supabase Edge Function secrets." }, 503);
    }

    let username = "";
    let password = "";
    let prepared = false;
    for (let attempt = 0; attempt < 8 && !prepared; attempt++) {
      username = "kc" + randomText(6).toLowerCase();
      password = randomText(8);
      const { error } = await userClient.rpc("crew_audition_prepare_credentials", {
        p_application_id: id, p_username: username, p_temporary_password: password,
      });
      if (!error) prepared = true;
      else if (!/already in use|unique|duplicate/i.test(error.message || "")) throw error;
    }
    if (!prepared) throw new Error("Could not generate a unique member username. Retry the selection email.");

    const loginUrl = new URL("login.html", "https://kineticcrew.vercel.app");
    loginUrl.searchParams.set("audition", "credentials-sent");
    loginUrl.searchParams.set("username", username);
    loginUrl.searchParams.set("email", email);

    const mailer = nodemailer.createTransport({
      host: "smtp.gmail.com", port: 465, secure: true,
      auth: { user: smtpUser, pass: smtpPass },
    });
    try {
      await mailer.verify();
      await mailer.sendMail({
        from: { name: "Kinetic Crew", address: smtpUser },
        to: email,
        subject: "You're selected — welcome to Kinetic Crew",
        text:
          "Hello " + String(app.name || "Applicant") + ",\n\n" +
          "Congratulations! Both the Admin and Super Admin have selected you for Kinetic Crew.\n\n" +
          "Your member account is ready to activate:\nUsername: " + username +
          "\nTemporary password: " + password +
          "\n\nOpen this link, choose Sign Up, enter the exact username, your personal email and temporary password, then verify your email:\n" +
          loginUrl.href + "\n\nYou will be asked to change your temporary password before entering the crew app.\n\nKinetic Crew",
        html:
          '<!doctype html><html><body style="margin:0;padding:28px;background:#09080d;color:#f7f4f8;font-family:Arial,sans-serif">' +
          '<div style="max-width:520px;margin:auto"><p style="letter-spacing:4px;color:#f0a2cf;font-size:11px;font-weight:bold">KINETIC CREW · FINAL SELECTION</p>' +
          '<h1 style="font-size:30px;margin:12px 0">You’re selected!</h1><div style="padding:24px;border:1px solid #55404e;border-radius:22px;background:#211720">' +
          '<p>Hello ' + esc(app.name) + ',</p><p>Both reviewers have selected you. Welcome to Kinetic Crew.</p>' +
          '<p style="font-size:11px;letter-spacing:2px;color:#d7a5c4">YOUR MEMBER LOGIN</p>' +
          '<p><b>Username</b><br><span style="font-size:20px">' + esc(username) + '</span></p>' +
          '<p><b>Temporary password</b><br><span style="font-size:20px;letter-spacing:3px">' + esc(password) + '</span></p>' +
          '<p style="margin:24px 0"><a href="' + esc(loginUrl.href) + '" style="display:inline-block;padding:14px 20px;border-radius:12px;background:#d94691;color:white;text-decoration:none;font-weight:bold">Activate Member Account</a></p>' +
          '<p style="font-size:12px;color:#c4b7c4">Use your personal email address and these exact credentials. Change the temporary password when prompted. Keep this email private.</p>' +
          '</div><p style="font-size:12px;color:#9f96a2;margin-top:18px">Kinetic Crew</p></div></body></html>',
      });
      const { error: markError } = await db.from("crew_email_delivery_log").update({
        status: "sent", sent_at: new Date().toISOString(),
      }).eq("idempotency_key", key).eq("recipient_email", email);
      if (markError) throw markError;
      return json({ ok: true, sent: 1, email });
    } catch (mailError) {
      await db.from("crew_email_delivery_log").delete().eq("idempotency_key", key).eq("recipient_email", email);
      console.error("Selection credentials email failed:", String(mailError));
      return json({ error: "Credentials were prepared, but the selection email could not be delivered. Retry the email from Audition Management." }, 503);
    }
  } catch (error) {
    console.error("send-audition-selection-email:", error);
    return json({ error: error instanceof Error ? error.message : "Selection email failed." }, 500);
  }
});