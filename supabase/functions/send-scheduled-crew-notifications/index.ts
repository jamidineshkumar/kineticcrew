import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-kc-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function readKey(primary: string, legacy: string) {
  const raw = Deno.env.get(primary);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "string") return parsed;
      if (parsed && typeof parsed === "object") return parsed.default || Object.values(parsed).find(v => typeof v === "string") || "";
    } catch { return raw; }
  }
  return Deno.env.get(legacy) || "";
}
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
    iss: email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = header + "." + claims;
  const key = await crypto.subtle.importKey(
    "pkcs8", pemBytes(privateKey), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)));
  const assertion = unsigned + "." + b64url(signature);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || "Could not authenticate with Firebase.");
  return data.access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = readKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
  const serviceKey = readKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
  if (!supabaseUrl || !serviceKey) return json({ error: "Supabase server credentials are not configured." }, 500);

  const admin = createClient(supabaseUrl, serviceKey);
  try {
    const cronSecret = req.headers.get("x-kc-cron-secret") || "";
    if (cronSecret.length < 32) return json({ error: "Scheduler authentication required." }, 401);
    const { data: valid, error: authError } = await admin.rpc("crew_validate_notification_cron_secret", { p_secret: cronSecret });
    if (authError || valid !== true) return json({ error: "Scheduler authentication failed." }, 401);

    await admin.from("crew_scheduled_pushes")
      .update({ status: "pending", last_error: "Recovered after an interrupted delivery attempt.", updated_at: new Date().toISOString() })
      .eq("status", "sending")
      .lt("updated_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());

    const { error: promotionError } = await admin.rpc("crew_enqueue_event_promotions");
    if (promotionError) throw promotionError;

    const { data: due, error: dueError } = await admin
      .from("crew_scheduled_pushes")
      .select("id,recipient_auth_id,source_type,source_id,notification_key,title,body,attempts")
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(150);
    if (dueError) throw dueError;
    if (!due?.length) return json({ ok: true, processed: 0, sent: 0, failed: 0 });

    const projectId = Deno.env.get("FCM_PROJECT_ID");
    if (!projectId) throw new Error("FCM_PROJECT_ID secret is missing.");
    const accessToken = await googleAccessToken();
    let sent = 0, failed = 0, noDevices = 0;

    for (const item of due) {
      const { data: claimed, error: claimError } = await admin
        .from("crew_scheduled_pushes")
        .update({ status: "sending", attempts: Number(item.attempts || 0) + 1, last_error: null })
        .eq("id", item.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      if (claimError) throw claimError;
      if (!claimed) continue;

      if (String(item.notification_key).startsWith("promotion_")) {
        const { data: event, error: eventError } = await admin
          .from("crew_events")
          .select("id,starts_at,event_status,capacity")
          .eq("id", item.source_id)
          .maybeSingle();
        if (eventError) throw eventError;
        const { count: registrationCount, error: countError } = await admin
          .from("crew_registrations")
          .select("member_id", { count: "exact", head: true })
          .eq("event_id", item.source_id);
        if (countError) throw countError;
        const { data: alreadyRegistered, error: registrationError } = await admin
          .from("crew_registrations")
          .select("member_id")
          .eq("event_id", item.source_id)
          .eq("member_id", item.recipient_auth_id)
          .maybeSingle();
        if (registrationError) throw registrationError;
        const seatsRemain = event && event.event_status === "scheduled"
          && new Date(event.starts_at).getTime() > Date.now()
          && Number(event.capacity || 0) > Number(registrationCount || 0);
        if (!seatsRemain || alreadyRegistered) {
          await admin.from("crew_scheduled_pushes").update({
            status: "failed",
            last_error: alreadyRegistered ? "Member has already registered." : "Event is full, cancelled, postponed or has started.",
            updated_at: new Date().toISOString(),
          }).eq("id", item.id);
          continue;
        }
      }

      const { data: devices, error: deviceError } = await admin
        .from("crew_push_tokens")
        .select("id,token")
        .eq("auth_id", item.recipient_auth_id);
      if (deviceError) throw deviceError;
      const tokens = [...new Set((devices || []).map((device: any) => String(device.token || "")).filter(Boolean))];
      if (!tokens.length) {
        await admin.from("crew_scheduled_pushes").update({
          status: "no_devices", last_error: "No registered push devices for this member.", updated_at: new Date().toISOString(),
        }).eq("id", item.id);
        noDevices++;
        continue;
      }

      const notificationId = String(item.id);
      const url = "/";
      const results = await Promise.all(tokens.map(async (token: string) => {
        const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            message: {
              token,
              notification: { title: item.title, body: item.body },
              data: {
                url,
                notificationId,
                sourceType: String(item.source_type),
                sourceId: String(item.source_id),
                notificationKey: String(item.notification_key),
              },
              webpush: {
                headers: { Urgency: "high" },
                notification: {
                  title: item.title,
                  body: item.body,
                  icon: "/icon.svg",
                  image: "/kinetic-crew-logo.jpg",
                  badge: "/kc-notification-badge.svg",
                  tag: notificationId,
                  renotify: false,
                },
                fcmOptions: { link: url },
              },
              android: {
                priority: "HIGH",
                notification: { channel_id: "crew_updates", sound: "default", tag: notificationId },
              },
              apns: { headers: { "apns-priority": "10" }, payload: { aps: { sound: "default" } } },
            },
          }),
        });
        if (response.ok) return { ok: true, token };
        const error = await response.json().catch(() => ({}));
        const detail = JSON.stringify(error);
        const invalid = detail.includes("UNREGISTERED") || detail.includes("registration-token-not-registered");
        return { ok: false, token, invalid, error: detail.slice(0, 500) };
      }));

      const invalidTokens = results.filter(result => !result.ok && result.invalid).map(result => result.token);
      if (invalidTokens.length) await admin.from("crew_push_tokens").delete().in("token", invalidTokens);
      const failures = results.filter(result => !result.ok && !result.invalid);
      const delivered = results.filter(result => result.ok).length;
      if (!failures.length && delivered > 0) {
        await admin.from("crew_scheduled_pushes").update({
          status: "sent", sent_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString(),
        }).eq("id", item.id);
        sent++;
      } else {
        const attempt = Number(item.attempts || 0) + 1;
        const retry = attempt < 5 && failures.length > 0;
        const errorText = failures.map(result => result.error).join(" | ").slice(0, 2000) || "All registered device tokens were invalid.";
        await admin.from("crew_scheduled_pushes").update({
          status: retry ? "pending" : "failed",
          scheduled_at: retry ? new Date(Date.now() + 5 * 60 * 1000).toISOString() : new Date().toISOString(),
          last_error: errorText,
          updated_at: new Date().toISOString(),
        }).eq("id", item.id);
        if (retry) failed++;
        else failed++;
      }
    }
    return json({ ok: true, processed: due.length, sent, failed, noDevices });
  } catch (error) {
    console.error("send-scheduled-crew-notifications:", error);
    return json({ error: error instanceof Error ? error.message : "Scheduled notification delivery failed." }, 500);
  }
});
