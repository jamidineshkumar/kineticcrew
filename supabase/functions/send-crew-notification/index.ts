import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const APP_ORIGIN = (Deno.env.get("KC_APP_ORIGIN") || "https://kineticcrew.vercel.app").replace(/\/+$/, "");
function safeNotificationPath(value: unknown) {
  const fallback = "/?kc_notification_view=notifications";
  try { const parsed = new URL(String(value || fallback), APP_ORIGIN); if (parsed.protocol !== "https:" || parsed.origin !== APP_ORIGIN || parsed.username || parsed.password || !parsed.pathname.startsWith("/")) return fallback; return parsed.pathname + parsed.search + parsed.hash; }
  catch { return fallback; }
}
function safeNotificationTarget(value: unknown) {
  const fallback = "/?kc_notification_view=notifications";
  try { const parsed = new URL(String(value || fallback), APP_ORIGIN); if (parsed.protocol !== "https:" || parsed.username || parsed.password) return fallback; return parsed.origin === APP_ORIGIN ? parsed.pathname + parsed.search + parsed.hash : parsed.href; }
  catch { return fallback; }
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

    if (body.action === "message") {
      const messageId = String(body.messageId || "");
      const conversationId = String(body.conversationId || "");
      if (!/^[0-9a-f-]{36}$/i.test(messageId) || !/^[0-9a-f-]{36}$/i.test(conversationId)) {
        return json({ error: "A valid message and conversation are required." }, 400);
      }
      const { data: message, error: messageError } = await adminClient
        .from("kg_messages")
        .select("id,conversation_id,sender_id,message_type,body")
        .eq("id", messageId).eq("conversation_id", conversationId)
        .eq("sender_id", authData.user.id).maybeSingle();
      if (messageError) throw messageError;
      if (!message) return json({ error: "Message not found or not sent by this account." }, 404);

      const { data: senderMembership, error: senderMembershipError } = await adminClient
        .from("kg_conversation_members").select("user_id")
        .eq("conversation_id", conversationId).eq("user_id", authData.user.id).maybeSingle();
      if (senderMembershipError) throw senderMembershipError;
      if (!senderMembership) return json({ error: "Conversation membership required." }, 403);

      const [{ data: conversation, error: conversationError }, { data: sender, error: senderError }, { data: members, error: membersError }] = await Promise.all([
        adminClient.from("kg_conversations").select("kind,title").eq("id", conversationId).maybeSingle(),
        adminClient.from("crew_profiles").select("name").eq("auth_id", authData.user.id).maybeSingle(),
        adminClient.from("kg_conversation_members").select("user_id,muted_until,notifications_enabled").eq("conversation_id", conversationId).neq("user_id", authData.user.id),
      ]);
      if (conversationError) throw conversationError;
      if (senderError) throw senderError;
      if (membersError) throw membersError;
      if (!conversation) return json({ error: "Conversation not found." }, 404);

      const now = Date.now();
      const recipientIds = [...new Set((members || [])
        .filter((member: any) => member.notifications_enabled !== false && (!member.muted_until || Date.parse(member.muted_until) <= now))
        .map((member: any) => String(member.user_id))
        .filter(Boolean))];
      if (!recipientIds.length) return json({ ok: true, sent: 0, message: "No recipients have message notifications enabled." });

      const { data: devices, error: devicesError } = await adminClient
        .from("crew_push_tokens").select("token,auth_id").in("auth_id", recipientIds);
      if (devicesError) throw devicesError;
      const tokens = [...new Set((devices || []).map((device: any) => String(device.token)).filter(Boolean))];
      if (!tokens.length) return json({ ok: true, sent: 0, message: "Recipients have not enabled push notifications on a device." });

      const senderName = String(sender?.name || "Crew member").slice(0, 80);
      const type = String(message.message_type || "text");
      const preview = type === "text" ? String(message.body || "New message")
        : type === "image" ? "Photo"
        : type === "video" ? "Video"
        : type === "voice" || type === "audio" ? "Voice message"
        : type === "document" ? "Document"
        : type === "gif" ? "GIF"
        : type === "location" ? "Shared a location"
        : "New message";
      const title = conversation.kind === "direct" ? "Kinetic Gram · " + senderName
        : "Kinetic Gram · " + String(conversation.title || "Group chat").slice(0, 80);
      const messageBody = (conversation.kind === "direct" ? preview : senderName + ": " + preview).slice(0, 180);
      const notificationUrl = safeNotificationPath("/?kc_notification_view=gram-chat&kc_open_chat=" + encodeURIComponent(conversationId));
      const absoluteNotificationUrl = APP_ORIGIN + notificationUrl;
      const projectId = Deno.env.get("FCM_PROJECT_ID");
      if (!projectId) throw new Error("FCM_PROJECT_ID secret is missing.");
      const accessToken = await googleAccessToken();
      const notificationId = "kg-" + messageId;
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
              notification: { title, body: messageBody },
              webpush: {
                notification: { title, body: messageBody, icon: "/icon.svg", badge: "/kc-notification-badge.svg", tag: notificationId, renotify: false },
                fcmOptions: { link: absoluteNotificationUrl },
              },
              android: { priority: "HIGH", notification: { channel_id: "crew_updates", sound: "default", icon: "ic_stat_notification", tag: notificationId } },
              data: { url: notificationUrl, notificationId, notificationType: "kg_message", conversationId, messageId },
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
    }
    const isCrewAdmin = ["admin", "super_admin"].includes(profile.role);
    if (["schedule", "list_scheduled", "cancel_scheduled"].includes(String(body.action || "")) && !isCrewAdmin) {
      return json({ error: "Admin access required." }, 403);
    }
    if (body.action === "schedule") {
      const title = String(body.title || "").trim().slice(0, 120);
      const message = String(body.body || "").trim().slice(0, 1000);
      const audience = String(body.audience || "all");
      const imageUrl = String(body.imageUrl || "").trim();
      const destinationUrl = safeNotificationTarget(body.url);
      const scheduledAt = new Date(String(body.scheduledAt || ""));
      const now = Date.now();
      const allowedImagePrefix = (supabaseUrl.endsWith("/") ? supabaseUrl.slice(0, -1) : supabaseUrl) + "/storage/v1/object/public/crew-alert-media/alerts/";
      if (!title || !message) return json({ error: "A title and message are required." }, 400);
      if (!["all", "member", "admin", "super_admin"].includes(audience)) return json({ error: "Invalid audience." }, 400);
      if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() < now + 60000 || scheduledAt.getTime() > now + 366 * 24 * 60 * 60 * 1000) {
        return json({ error: "Choose a time at least one minute from now and within the next year." }, 400);
      }
      if (imageUrl && (!imageUrl.startsWith(allowedImagePrefix) || imageUrl.length > 2048)) {
        return json({ error: "The attached image URL is invalid." }, 400);
      }
      let recipientQuery = adminClient.from("crew_push_tokens")
        .select("auth_id,crew_profiles!inner(role,approval_status)")
        .eq("crew_profiles.approval_status", "approved");
      if (audience === "member") recipientQuery = recipientQuery.eq("crew_profiles.role", "member");
      if (audience === "admin") recipientQuery = recipientQuery.in("crew_profiles.role", ["admin", "super_admin"]);
      if (audience === "super_admin") recipientQuery = recipientQuery.eq("crew_profiles.role", "super_admin");
      const { data: deviceRows, error: recipientError } = await recipientQuery;
      if (recipientError) throw recipientError;
      const recipients = [...new Set((deviceRows || []).map((row: any) => String(row.auth_id || "")).filter(Boolean))];
      if (!recipients.length) return json({ ok: true, scheduled: 0, message: "No registered push devices were found for this audience." });
      const sourceId = crypto.randomUUID();
      const notificationKey = "custom_alert:" + sourceId;
      const rows = recipients.map(recipient_auth_id => ({
        recipient_auth_id, source_type: "custom_alert", source_id: sourceId,
        notification_key: notificationKey, title, body: message,
        scheduled_at: scheduledAt.toISOString(), status: "pending", image_url: imageUrl || null,
        destination_url: destinationUrl,
      }));
      for (let offset = 0; offset < rows.length; offset += 500) {
        const { error } = await adminClient.from("crew_scheduled_pushes").insert(rows.slice(offset, offset + 500));
        if (error) throw error;
      }
      return json({ ok: true, scheduled: recipients.length, sourceId, scheduledAt: scheduledAt.toISOString(), message: "Notification scheduled." });
    }
    if (body.action === "list_scheduled") {
      const { data, error } = await adminClient.from("crew_scheduled_pushes")
        .select("source_id,title,body,scheduled_at,image_url,destination_url,recipient_auth_id")
        .eq("source_type", "custom_alert").eq("status", "pending")
        .gt("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true }).limit(1000);
      if (error) throw error;
      const grouped = new Map<string, any>();
      for (const row of data || []) {
        const key = String(row.source_id);
        if (!grouped.has(key)) grouped.set(key, {
          id: key, title: row.title, body: row.body, scheduledAt: row.scheduled_at,
          imageUrl: row.image_url || "", destinationUrl: row.destination_url || "", recipients: 0,
        });
        grouped.get(key).recipients++;
      }
      return json({ ok: true, items: [...grouped.values()] });
    }
    if (body.action === "cancel_scheduled") {
      const sourceId = String(body.sourceId || "");
      if (!/^[0-9a-f-]{36}$/i.test(sourceId)) return json({ error: "A valid scheduled alert is required." }, 400);
      const { data, error } = await adminClient.from("crew_scheduled_pushes")
        .delete().eq("source_type", "custom_alert").eq("source_id", sourceId)
        .eq("status", "pending").select("id");
      if (error) throw error;
      return json({ ok: true, cancelled: data?.length || 0 });
    }
    if (body.action !== "send") return json({ error: "Unsupported action." }, 400);
    if (!isCrewAdmin) return json({ error: "Admin access required." }, 403);

    const title = String(body.title || "Kinetic Crew").trim().slice(0, 120);
    const message = String(body.body || "").trim().slice(0, 1000);
    const audience = String(body.audience || "all");
    const imageUrl = String(body.imageUrl || "").trim();
    const notificationUrl = safeNotificationTarget(body.url);
    const absoluteNotificationUrl = notificationUrl.startsWith("https://") ? notificationUrl : APP_ORIGIN + notificationUrl;
    const allowedImagePrefix = supabaseUrl.replace(/\/$/, "") + "/storage/v1/object/public/crew-alert-media/alerts/";
    if (!title || !message) return json({ error: "A title and message are required." }, 400);
    if (!["all", "member", "admin", "super_admin", "selected"].includes(audience)) return json({ error: "Invalid audience." }, 400);
    if (imageUrl && (!imageUrl.startsWith(allowedImagePrefix) || imageUrl.length > 2048)) {
      return json({ error: "The attached image URL is invalid." }, 400);
    }

    let query = adminClient.from("crew_push_tokens").select("token,auth_id,crew_profiles!inner(role)").eq("crew_profiles.approval_status", "approved");
    if (audience === "member") query = query.eq("crew_profiles.role", "member");
    if (audience === "admin") query = query.in("crew_profiles.role", ["admin", "super_admin"]);
    if (audience === "super_admin") query = query.eq("crew_profiles.role", "super_admin");
    const recipientIds = [...new Set((Array.isArray(body.recipientIds) ? body.recipientIds : []).map((id: unknown) => String(id)).filter((id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)))];
    if (audience === "selected") {
      if (!recipientIds.length || recipientIds.length > 100) return json({ error: "Select between 1 and 100 approved crew members." }, 400);
      query = query.in("auth_id", recipientIds);
    }
    const { data: devices, error: devicesError } = await query;
    if (devicesError) throw devicesError;
    const tokens = [...new Set((devices || []).map((d: any) => d.token))];
    if (!tokens.length) return json({ ok: true, sent: 0, message: "No registered devices for this audience yet." });

    const projectId = Deno.env.get("FCM_PROJECT_ID");
    if (!projectId) throw new Error("FCM_PROJECT_ID secret is missing.");
    const accessToken = await googleAccessToken();
    // Share one replacement tag across every token for this broadcast so
    // duplicate registrations cannot stack identical alerts on one device.
    const notificationId = crypto.randomUUID();
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
            notification: { title, body: message, ...(imageUrl ? { image: imageUrl } : {}) },
            webpush: { notification: { title, body: message, icon: "/icon.svg", ...(imageUrl ? { image: imageUrl } : {}), badge: "/kc-notification-badge.svg", tag: notificationId, renotify: false }, fcmOptions: { link: absoluteNotificationUrl } },
            android: { priority: "HIGH", notification: { channel_id: "crew_updates", sound: "default", icon: "ic_stat_notification", tag: notificationId, ...(imageUrl ? { image: imageUrl } : {}) } },
            data: { url: notificationUrl, notificationId, notificationType: "custom_alert", ...(imageUrl ? { imageUrl } : {}) },
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
    if (imageUrl && sent > 0) {
      const objectPath = decodeURIComponent(new URL(imageUrl).pathname.split("/storage/v1/object/public/crew-alert-media/")[1] || "");
      if (!objectPath.startsWith("alerts/") || objectPath.includes("..")) throw new Error("Attached alert image path is invalid.");
      const { error: cleanupError } = await adminClient.from("crew_alert_media_cleanup").upsert({
        object_path: objectPath,
        cleanup_after: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        last_error: null,
      }, { onConflict: "object_path" });
      if (cleanupError) throw cleanupError;
    }
    return json({ ok: true, sent, failed: failures.length, removed: invalid.length, message: `Delivered to ${sent} device(s).` });
  } catch (error) {
    console.error("send-crew-notification:", error);
    return json({ error: error instanceof Error ? error.message : "Notification request failed." }, 500);
  }
});
