import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
function readKey(primary: string, legacy: string) {
  const raw = Deno.env.get(primary);
  if (raw) {
    try { const parsed = JSON.parse(raw); if (typeof parsed === "string") return parsed; if (parsed && typeof parsed === "object") return parsed.default || Object.values(parsed).find(v => typeof v === "string") || ""; }
    catch { return raw; }
  }
  return Deno.env.get(legacy) || "";
}
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const APPLICATION_URL = "https://kineticcrew-kineticforms.base44.app/f/xdewij49gp";
const REJECTED_MESSAGE = "It seems you are not a member of Kinetic Crew. Please submit an application to join.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  try {
    const { username, password, email, checkOnly } = await req.json();
    const handle = String(username ?? "").trim().toLowerCase();
    const normalizedEmail = String(email ?? "").trim().toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(handle)) return reply({ error: "Enter a valid username." }, 400);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = readKey("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
    const service = readKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
    if (!url || !anon || !service) return reply({ error: "Authentication service is not configured." }, 500);
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

    if (checkOnly === true) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return reply({ error: "Enter a valid email address." }, 400);
      const emailHash = await sha256(normalizedEmail);
      const { data: marker, error } = await admin.from("crew_member_rejection_tombstones")
        .select("rejected_at").eq("email_sha256", emailHash).maybeSingle();
      if (error) throw error;
      return reply({ rejected: !!marker, message: marker ? REJECTED_MESSAGE : "", application_url: marker ? APPLICATION_URL : "" });
    }

    if (typeof password !== "string" || password.length < 1 || password.length > 256)
      return reply({ error: "Username or password is incorrect." }, 400);

    const { data: profile, error: lookupError } = await admin.from("crew_profiles")
      .select("email").eq("username", handle).maybeSingle();
    if (lookupError) throw lookupError;
    if (!profile?.email) {
      const usernameHash = await sha256(handle);
      const { data: marker, error: markerError } = await admin.from("crew_member_rejection_tombstones")
        .select("rejected_at").eq("username_sha256", usernameHash).maybeSingle();
      if (markerError) throw markerError;
      if (marker) return reply({ code: "MEMBERSHIP_REJECTED", error: REJECTED_MESSAGE, application_url: APPLICATION_URL }, 403);
      return reply({ error: "Username or password is incorrect." }, 401);
    }

    const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.signInWithPassword({ email: profile.email, password });
    if (error || !data.session) return reply({ error: "Username or password is incorrect." }, 401);
    return reply({ session: { access_token: data.session.access_token, refresh_token: data.session.refresh_token } });
  } catch (error) {
    console.error("username-login failed:", error);
    return reply({ error: "Unable to sign in right now. Please try again." }, 500);
  }
});
