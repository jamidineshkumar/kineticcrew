import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { brandedEmail } from "./email-template.ts";
import nodemailer from "npm:nodemailer@6.9.16";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (value: unknown) => String(value ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

function b64url(input: Uint8Array | string) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function pemBytes(pem: string) {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  return Uint8Array.from(atob(body), c => c.charCodeAt(0));
}
async function googleAccessToken() {
  const email = Deno.env.get("FCM_CLIENT_EMAIL");
  const privateKey = Deno.env.get("FCM_PRIVATE_KEY")?.replace(/\\n/g, "\n");
  if (!email || !privateKey) throw new Error("Firebase service-account secrets are incomplete.");
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: email, scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  }));
  const unsigned = header + "." + claims;
  const key = await crypto.subtle.importKey("pkcs8", pemBytes(privateKey), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)));
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: unsigned + "." + b64url(signature) }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || "Firebase authentication failed.");
  return data.access_token as string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return json({ error: "Sign in required." }, 401);

  const adminClient = createClient(url, service);
  try {
    const { data: actor, error: actorError } = await adminClient.from("crew_profiles")
      .select("auth_id,role,approval_status,name").eq("auth_id", authData.user.id).maybeSingle();
    if (actorError || !actor || actor.approval_status !== "approved" || !["admin", "super_admin"].includes(actor.role)) {
      return json({ error: "Only approved Admins and Super Admins can send profile reminders." }, 403);
    }
    const body = await req.json();
    const targetAuthId = String(body.targetAuthId || "").trim();
    if (!targetAuthId || targetAuthId.length > 128 || targetAuthId === actor.auth_id) {
      return json({ error: "Choose a valid member account." }, 400);
    }
    const { data: target, error: targetError } = await adminClient.from("crew_profiles")
      .select("auth_id,name,email,username,role,approval_status,date_of_birth,registration_number,instagram_username,bio,avatar_url")
      .eq("auth_id", targetAuthId).maybeSingle();
    if (targetError) throw targetError;
    if (!target || target.approval_status !== "approved" || !/^\S+@\S+\.\S+$/.test(String(target.email || ""))) {
      return json({ error: "The selected approved member or their email address could not be found." }, 404);
    }
    const missing = [
      !target.name && "full name",
      !target.username && "username",
      !target.date_of_birth && "date of birth",
      !target.registration_number && "registration number",
      !target.instagram_username && "Instagram username",
      !target.bio && "bio",
      !target.avatar_url && "profile photo",
    ].filter(Boolean);
    if (!missing.length) return json({ error: "This member's profile is already complete. No reminder was sent." }, 409);

    const title = "Complete your Kinetic Crew profile";
    const message = "Your Kinetic Crew profile is still incomplete. Please add your " + missing.join(", ") + " to finish setting up your crew identity.";
    const targetUrl = "/?kc_notification_view=profile";
    const { data: saved, error: saveError } = await adminClient.from("crew_profile_reminders")
      .insert({ recipient_auth_id: target.auth_id, created_by: actor.auth_id, title, body: message, target_url: targetUrl })
      .select("id").single();
    if (saveError) throw saveError;

    let pushSent = 0;
    let pushError = "";
    try {
      const { data: devices, error: devicesError } = await adminClient.from("crew_push_tokens")
        .select("token").eq("auth_id", target.auth_id);
      if (devicesError) throw devicesError;
      const tokens = [...new Set((devices || []).map((d: any) => String(d.token || "")).filter(Boolean))];
      if (tokens.length) {
        const projectId = Deno.env.get("FCM_PROJECT_ID");
        if (!projectId) throw new Error("FCM_PROJECT_ID secret is missing.");
        const accessToken = await googleAccessToken();
        for (const token of tokens) {
          const response = await fetch("https://fcm.googleapis.com/v1/projects/" + projectId + "/messages:send", {
            method: "POST",
            headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
            body: JSON.stringify({ message: {
              token,
              notification: { title, body: message },
              webpush: { notification: { title, body: message, icon: "/icon.svg", badge: "/kc-notification-badge.svg", tag: "profile-reminder-" + saved.id, renotify: false }, fcmOptions: { link: "https://kineticcrew.vercel.app" + targetUrl } },
              android: { priority: "HIGH", notification: { channel_id: "crew_updates", sound: "default", icon: "ic_stat_notification", tag: "profile-reminder-" + saved.id } },
              data: { url: targetUrl, notificationId: "profile-reminder-" + saved.id, notificationType: "profile_reminder" },
            } }),
          });
          if (response.ok) pushSent++;
          else {
            const detail = JSON.stringify(await response.json());
            if (detail.includes("UNREGISTERED") || detail.includes("registration-token-not-registered")) {
              await adminClient.from("crew_push_tokens").delete().eq("token", token);
            } else pushError = detail.slice(0, 300);
          }
        }
      }
    } catch (error) {
      pushError = error instanceof Error ? error.message : "Push delivery failed.";
    }

    let emailSent = false;
    let emailError = "";
    try {
      const smtpUser = Deno.env.get("SMTP_USER") || "kineticcreww@gmail.com";
      const smtpPass = Deno.env.get("SMTP_PASS");
      if (!smtpPass) throw new Error("SMTP_PASS is not configured.");
      const mailer = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: smtpUser, pass: smtpPass } });
      await mailer.sendMail({
        from: '"KINETIC CREW" <' + smtpUser + '>',
        to: target.email,
        subject: title + " | Kinetic Crew",
        text: message + "\n\nOpen Kinetic Crew: https://kineticcrew.vercel.app",
        html: brandedEmail({title,contentHtml:'<p style="margin:0 0 10px;">Hi '+esc(target.name || target.username || "there")+',</p><p style="margin:0;color:#c2bec8;">'+esc(message)+'</p>',buttonLabel:"Complete your profile",buttonUrl:"https://kineticcrew.vercel.app/?kc_notification_view=profile"}),
      });
      emailSent = true;
    } catch (error) {
      emailError = error instanceof Error ? error.message : "Email delivery failed.";
    }
    return json({ ok: true, notificationStored: true, pushSent, emailSent, pushError, emailError, missing });
  } catch (error) {
    console.error("send-profile-completion-reminder:", error);
    return json({ error: error instanceof Error ? error.message : "Could not send the profile reminder." }, 500);
  }
});