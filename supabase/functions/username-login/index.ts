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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  try {
    const { username, password } = await req.json();
    const handle = String(username ?? "").trim().toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(handle) || typeof password !== "string" || password.length < 1 || password.length > 256) {
      return reply({ error: "Username or password is incorrect." }, 400);
    }
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = readKey("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
    const service = readKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: profile, error: lookupError } = await admin.from("crew_profiles").select("email").eq("username", handle).maybeSingle();
    if (lookupError || !profile?.email) return reply({ error: "Username or password is incorrect." }, 401);
    const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.signInWithPassword({ email: profile.email, password });
    if (error || !data.session) return reply({ error: "Username or password is incorrect." }, 401);
    return reply({ session: { access_token: data.session.access_token, refresh_token: data.session.refresh_token } });
  } catch {
    return reply({ error: "Unable to sign in right now. Please try again." }, 500);
  }
});