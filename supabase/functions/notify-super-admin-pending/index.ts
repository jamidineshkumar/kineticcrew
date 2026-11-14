import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function b64url(input: Uint8Array | string) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  bytes.forEach((b) => binary += String.fromCharCode(b));
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
  const key = await crypto.subtle.importKey("pkcs8", pemBytes(privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)));
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: unsigned + "." + b64url(signature) }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || "Firebase authentication failed.");
  return data.access_token as string;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST required", { status: 405 });
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, key);
  try {
    const body = await req.json().catch(() => ({}));
    const authId = String(body?.auth_id || "");
    if (!authId || authId.length > 80) return Response.json({ ok: false, error: "Invalid membership reference." }, { status: 400 });

    const { data: member, error: memberError } = await admin.from("crew_profiles")
      .select("auth_id,name,approval_status").eq("auth_id", authId).maybeSingle();
    if (memberError) throw memberError;
    if (!member || member.approval_status !== "pending") return Response.json({ ok: true, skipped: true });

    const { data: prior, error: priorError } = await admin.from("crew_pending_push_alerts")
      .select("status,updated_at").eq("auth_id", authId).maybeSingle();
    if (priorError) throw priorError;
    if (prior?.status === "sent") return Response.json({ ok: true, duplicate: true });
    if (prior?.status === "sending" && Date.now() - new Date(prior.updated_at).getTime() < 120000) {
      return Response.json({ ok: true, in_progress: true });
    }
    const { error: claimError } = await admin.from("crew_pending_push_alerts").upsert({
      auth_id: authId, status: "sending", updated_at: new Date().toISOString(), last_error: null,
    }, { onConflict: "auth_id" });
    if (claimError) throw claimError;

    const { data: devices, error: deviceError } = await admin.from("crew_push_tokens")
      .select("token,crew_profiles!inner(role,approval_status)")
      .eq("crew_profiles.role", "super_admin").eq("crew_profiles.approval_status", "approved");
    if (deviceError) throw deviceError;
    const tokens = [...new Set((devices || []).map((d: any) => d.token))];
    if (!tokens.length) {
      await admin.from("crew_pending_push_alerts").update({
        status: "failed", last_error: "No Super Admin device is registered for push notifications.", updated_at: new Date().toISOString(),
      }).eq("auth_id", authId);
      return Response.json({ ok: true, sent: 0, message: "No registered Super Admin devices." });
    }

    const projectId = Deno.env.get("FCM_PROJECT_ID");
    if (!projectId) throw new Error("FCM_PROJECT_ID secret is missing.");
    const accessToken = await googleAccessToken();
    const title = "New membership request";
    const message = (member.name || "A new member") + " requested to join Kinetic Crew. Open Crew Management → Member Requests.";
    let sent = 0;
    const invalid: string[] = [];
    for (const token of tokens) {
      const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: {
          token,
          notification: { title, body: message },
          webpush: { notification: { title, body: message, icon: "/kinetic-crew-logo.svg", image: "/kinetic-crew-logo.jpg", badge: "/kinetic-crew-logo.svg", tag: "kc-pending-" + authId },  },
          android: { priority: "HIGH", notification: { channel_id: "crew_updates", sound: "default" } },
          data: { url: "/?kc_view=member-requests", route: "member-requests", notification_type: "membership_request" },
        } }),
      });
      if (response.ok) sent++;
      else {
        const detail = JSON.stringify(await response.json());
        if (detail.includes("UNREGISTERED") || detail.includes("registration-token-not-registered")) invalid.push(token);
        else console.error("FCM pending alert failed:", detail.slice(0, 300));
      }
    }
    if (invalid.length) await admin.from("crew_push_tokens").delete().in("token", invalid);
    await admin.from("crew_pending_push_alerts").update({
      status: sent ? "sent" : "failed", sent_at: sent ? new Date().toISOString() : null,
      last_error: sent ? null : "FCM did not accept the notification.", updated_at: new Date().toISOString(),
    }).eq("auth_id", authId);
    return Response.json({ ok: true, sent });
  } catch (error) {
    console.error("notify-super-admin-pending:", error);
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Push notification failed." }, { status: 500 });
  }
});