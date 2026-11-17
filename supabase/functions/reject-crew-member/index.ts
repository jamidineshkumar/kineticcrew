import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function listAllObjects(admin: ReturnType<typeof createClient>, bucket: string, prefix: string): Promise<string[]> {
  const paths: string[] = [];
  async function walk(folder: string, depth: number) {
    if (depth > 8) throw new Error("Member storage folder nesting is unexpectedly deep.");
    let offset = 0;
    while (true) {
      const { data, error } = await admin.storage.from(bucket).list(folder, {
        limit: 100, offset, sortBy: { column: "name", order: "asc" },
      });
      if (error) throw new Error("Could not inspect member files in " + bucket + ": " + error.message);
      if (!data?.length) break;
      for (const item of data) {
        const path = folder ? folder + "/" + item.name : item.name;
        if (item.id) paths.push(path);
        else await walk(path, depth + 1);
      }
      if (data.length < 100) break;
      offset += 100;
    }
  }
  await walk(prefix, 0);
  return paths;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    let service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!service) {
      const secretRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
      if (secretRaw) { try { service = JSON.parse(secretRaw).default; } catch { service = secretRaw; } }
    }
    if (!url || !anon || !service) return json({ error: "Membership rejection service is not configured." }, 500);

    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "Sign in again before reviewing this request." }, 401);

    const body = await req.json();
    const targetId = String(body?.authId || "").trim();
    if (!targetId || targetId.length > 128 || targetId === authData.user.id) return json({ error: "Choose a valid pending member." }, 400);

    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: actor, error: actorError } = await admin.from("crew_profiles")
      .select("role,approval_status").eq("auth_id", authData.user.id).maybeSingle();
    if (actorError || !actor || actor.approval_status !== "approved" || !["admin", "super_admin"].includes(actor.role))
      return json({ error: "Approved Admin or Super Admin access required." }, 403);

    const { data: target, error: targetError } = await admin.from("crew_profiles")
      .select("auth_id,name,email,username,role,approval_status")
      .eq("auth_id", targetId).maybeSingle();
    if (targetError || !target) return json({ error: "Pending membership request not found." }, 404);
    if (target.role !== "member" || target.approval_status !== "pending")
      return json({ error: "Only pending member applications can be rejected here." }, 409);

    const email = String(target.email || "").trim().toLowerCase();
    const username = String(target.username || "").trim().toLowerCase();
    if (!email || !username) return json({ error: "The request is missing its email or username. Nothing was deleted." }, 409);

    // Delete personal uploads first. If storage cleanup fails, leave the account intact.
    for (const bucket of ["crew-avatars", "crew-profile-documents", "crew-memories", "crew-wardrobe", "crew-gram-media"]) {
      const paths = await listAllObjects(admin, bucket, targetId);
      for (let i = 0; i < paths.length; i += 100) {
        const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + 100));
        if (error) throw new Error("Could not remove the member's files from " + bucket + ": " + error.message);
      }
    }

    // Retain hashes only (no name, email, username, application details, or auth id).
    const { error: markerError } = await admin.from("crew_member_rejection_tombstones").upsert({
      email_sha256: await sha256(email),
      username_sha256: await sha256(username),
      rejected_at: new Date().toISOString(),
    }, { onConflict: "email_sha256" });
    if (markerError) throw new Error("Could not save the privacy-safe rejection marker: " + markerError.message);

    // Existing database routine removes profile-linked records and owned content.
    const { error: cleanupError } = await userClient.rpc("crew_admin_delete_member", { p_auth_id: targetId });
    if (cleanupError) throw new Error(cleanupError.message || "Could not remove the member's profile data.");

    const { error: authDeleteError } = await admin.auth.admin.deleteUser(targetId);
    if (authDeleteError) {
      console.error("Profile data was removed, but Auth deletion needs retry:", targetId, authDeleteError.message);
      return json({ error: "Profile and personal data were removed, but the sign-in identity could not be deleted. The rejected login remains blocked; contact the Super Admin to finish cleanup." }, 500);
    }

    return json({
      ok: true,
      message: "Membership rejected. The account, profile, personal uploads and associated personal records were permanently deleted.",
    });
  } catch (error) {
    console.error("reject-crew-member failed:", error);
    return json({ error: error instanceof Error ? error.message : "Could not reject this membership request." }, 500);
  }
});
