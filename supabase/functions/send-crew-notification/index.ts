import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

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
  const key = await crypto.subtle.importKey(
    "pkcs8", pemBytes(privateKey), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)));
  const assertion = unsigned + "." + b64url(signature);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion,
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || "Could not authenticate with Firebase.");
  return data.access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return json({ error: "Sign in required." }, 401);

  const adminClient = createClient(supabaseUrl, serviceKey);
  const { data: profile, error: profileError } = await adminClient
    .from("crew_profiles").select("auth_id, role").eq("auth_id", authData.user.id).maybeSingle();
  if (profileError || !profile) return json({ error: "Crew profile not found." }, 403);

  try {
    const body = await req.json();
    if (body.action === "register") {
      const token = String(body.token || "");
      const platform = String(body.platform || "web");
      if (token.length < 30 || token.length > 8192 || !["web", "android", "ios"].includes(platform)) {
        return json({ error: "Invalid device token or platform." }, 400);
      }
      const { error } = await adminClient.from("crew_push_tokens").upsert({
        auth_id: authData.user.id, token, platform, updated_at: new Date().toISOString(),
      }, { onConflict: "token" });
      if (error) throw error;
      return json({ ok: true, message: "This device is registered for crew alerts." });
    }
    if (body.action === "unregister") {
      const token = String(body.token || "");
      const { error } = await adminClient.from("crew_push_tokens")
        .delete().eq("auth_id", authData.user.id).eq("token", token);
      if (error) throw error;
      return json({ ok: true });
    }
    if (body.action !== "send") return json({ error: "Unsupported action." }, 400);
    if (!["admin", "super_admin"].includes(profile.role)) return json({ error: "Admin access required." }, 403);

    const title = String(body.title || "Kinetic Crew").trim().slice(0, 120);
    const message = String(body.body || "").trim().slice(0, 1000);
    const audience = String(body.audience || "all");
    if (!title || !message) return json({ error: "A title and message are required." }, 400);
    if (!["all", "member", "admin", "super_admin"].includes(audience)) return json({ error: "Invalid audience." }, 400);

    let query = adminClient.from("crew_push_tokens").select("token,auth_id,crew_profiles!inner(role)");
    if (audience !== "all") query = query.eq("crew_profiles.role", audience);
    const { data: devices, error: devicesError } = await query;
    if (devicesError) throw devicesError;
    const tokens = [...new Set((devices || []).map((d: any) => d.token))];
    if (!tokens.length) return json({ ok: true, sent: 0, message: "No registered devices for this audience yet." });

    const projectId = Deno.env.get("FCM_PROJECT_ID");
    if (!projectId) throw new Error("FCM_PROJECT_ID secret is missing.");
    const accessToken = await googleAccessToken();
    let sent = 0;
    const invalid: string[] = [];
    const failures: string[] = [];
    for (const token of tokens) {
      const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token,
            notification: { title, body: message },
            webpush: { notification: { title, body: message, icon: "/kinetic-crew-logo.jpg", badge: "/favicon.ico" }, fcmOptions: { link: "/" } },
            android: { priority: "HIGH", notification: { channel_id: "crew_updates", sound: "default" } },
            data: { url: "/" },
          },
        }),
      });
      if (response.ok) sent++;
      else {
        const err = await response.json();
        const detail = JSON.stringify(err);
        if (detail.includes("UNREGISTERED") || detail.includes("registration-token-not-registered") || detail.includes("INVALID_ARGUMENT")) invalid.push(token);
        else failures.push(detail.slice(0, 300));
      }
    }
    if (invalid.length) await adminClient.from("crew_push_tokens").delete().in("token", invalid);
    return json({ ok: true, sent, failed: failures.length, removed: invalid.length, message: `Delivered to ${sent} device(s).` });
  } catch (error) {
    console.error("send-crew-notification:", error);
    return json({ error: error instanceof Error ? error.message : "Notification request failed." }, 500);
  }
});
