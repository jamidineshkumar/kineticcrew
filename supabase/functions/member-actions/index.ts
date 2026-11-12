import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    let service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!service) {
      const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
      if (raw) service = JSON.parse(raw).default;
    }
    if (!url || !anon || !service) return json({ error: "Member action service is not configured." }, 500);

    const authorization = req.headers.get("Authorization") || "";
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "Sign in again before managing a member." }, 401);

    const body = await req.json();
    const action = String(body?.action || "");
    const targetId = String(body?.authId || "").trim();
    if (!["block", "unblock"].includes(action)) return json({ error: "Choose block or unblock." }, 400);
    if (!targetId || targetId.length > 128 || targetId === authData.user.id) return json({ error: "Choose a valid member account." }, 400);

    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const [{ data: actor, error: actorError }, { data: target, error: targetError }] = await Promise.all([
      admin.from("crew_profiles").select("role").eq("auth_id", authData.user.id).maybeSingle(),
      admin.from("crew_profiles").select("auth_id,name,role").eq("auth_id", targetId).maybeSingle(),
    ]);
    if (actorError || !actor || !["admin", "super_admin"].includes(actor.role)) return json({ error: "Admin access required." }, 403);
    if (targetError || !target) return json({ error: "Crew member not found." }, 404);
    if (target.role === "super_admin") return json({ error: "A Super Admin account cannot be blocked or unblocked here." }, 403);
    if (actor.role === "admin" && target.role !== "member") return json({ error: "Admins can block or unblock members only. A Super Admin must manage Admin accounts." }, 403);

    if (action === "block") {
      const { error: insertError } = await admin.from("crew_member_blocks").upsert({
        blocked_auth_id: targetId,
        blocked_by: authData.user.id,
        reason: String(body?.reason || "").slice(0, 500),
      }, { onConflict: "blocked_auth_id" });
      if (insertError) throw insertError;
      const { error: banError } = await admin.auth.admin.updateUserById(targetId, { ban_duration: "876000h" });
      if (banError) {
        await admin.from("crew_member_blocks").delete().eq("blocked_auth_id", targetId);
        throw banError;
      }
      return json({
        ok: true,
        message: (target.name || "Member") + " is blocked. New sign-ins and refreshes are disabled on every device; active app sessions are denied by the crew access check.",
      });
    }

    const { error: unbanError } = await admin.auth.admin.updateUserById(targetId, { ban_duration: "none" });
    if (unbanError) throw unbanError;
    const { error: deleteError } = await admin.from("crew_member_blocks").delete().eq("blocked_auth_id", targetId);
    if (deleteError) throw deleteError;
    return json({ ok: true, message: (target.name || "Member") + " has been unblocked. They can sign in again." });
  } catch (error) {
    console.error("member-actions failed:", error);
    return json({ error: error instanceof Error ? error.message : "Could not complete this member action." }, 500);
  }
});
