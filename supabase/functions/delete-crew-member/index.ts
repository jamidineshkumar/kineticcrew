import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function listAllObjects(admin: ReturnType<typeof createClient>, bucket: string, prefix: string): Promise<string[]> {
  const paths: string[] = [];
  async function walk(folder: string, depth: number) {
    if (depth > 8) throw new Error("Storage folder nesting is unexpectedly deep.");
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
      offset += data.length;
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
      if (secretRaw) service = JSON.parse(secretRaw).default;
    }
    if (!url || !anon || !service) return json({ error: "Member removal service is not configured." }, 500);

    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "Sign in again before removing a member." }, 401);

    const body = await req.json();
    const targetId = String(body?.authId || "").trim();
    if (!targetId || targetId.length > 128) return json({ error: "Choose a valid crew account." }, 400);
    if (targetId === authData.user.id) return json({ error: "You cannot remove your own account." }, 400);

    const adminClient = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: target, error: targetError } = await adminClient
      .from("crew_profiles").select("auth_id,name,email,role").eq("auth_id", targetId).maybeSingle();
    if (targetError || !target) return json({ error: "Crew member not found." }, 404);

    const { data: actor, error: actorError } = await adminClient
      .from("crew_profiles").select("role").eq("auth_id", authData.user.id).maybeSingle();
    if (actorError || !actor || !["admin", "super_admin"].includes(actor.role)) return json({ error: "Admin access required." }, 403);
    if (target.role === "super_admin") return json({ error: "A Super Admin account cannot be deleted here." }, 403);
    if (actor.role === "admin" && target.role !== "member") return json({ error: "Admins can remove members only. A Super Admin must remove another Admin." }, 403);

    // A permanent email tombstone is created only when the account was blocked first.
    const { data: priorBlock, error: blockLookupError } = await adminClient
      .from("crew_member_blocks").select("blocked_auth_id").eq("blocked_auth_id", targetId).maybeSingle();
    if (blockLookupError) throw new Error("Could not verify the member's block status: " + blockLookupError.message);
    if (priorBlock) {
      const { data: authTarget, error: authTargetError } = await adminClient.auth.admin.getUserById(targetId);
      if (authTargetError || !authTarget?.user?.email) throw new Error("Could not verify the blocked member's email. Nothing was deleted.");
      const normalizedEmail = authTarget.user.email.trim().toLowerCase();
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalizedEmail));
      const emailHash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
      const { error: tombstoneError } = await adminClient.from("crew_permanent_email_blocks").upsert({
        email_sha256: emailHash,
        reason: "blocked_then_deleted",
        created_by: authData.user.id,
      }, { onConflict: "email_sha256" });
      if (tombstoneError) throw new Error("Could not secure the permanent email restriction: " + tombstoneError.message);
    }

    // Remove the member's personal uploaded files before deleting their profile metadata.
    const buckets = ["crew-avatars", "crew-profile-documents", "crew-memories", "crew-wardrobe"];
    for (const bucket of buckets) {
      const paths = await listAllObjects(adminClient, bucket, targetId);
      for (let i = 0; i < paths.length; i += 100) {
        const { error } = await adminClient.storage.from(bucket).remove(paths.slice(i, i + 100));
        if (error) throw new Error("Could not remove the member's files from " + bucket + ": " + error.message);
      }
    }

    const { data: removed, error: cleanupError } = await userClient.rpc("crew_admin_delete_member", { p_auth_id: targetId });
    if (cleanupError) throw new Error(cleanupError.message || "Could not remove the member's crew data.");

    const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(targetId);
    if (authDeleteError) {
      console.error("Crew profile data removed, but Auth account deletion needs retry:", targetId, authDeleteError.message);
      return json({ error: "Crew data was removed, but the sign-in account could not be fully deleted. Contact the Super Admin before this email is reused." }, 500);
    }
    return json({ ok: true, message: (target.name || "Crew member") + " and their account data were permanently removed.", removed: removed || null });
  } catch (error) {
    console.error("delete-crew-member failed:", error);
    return json({ error: error instanceof Error ? error.message : "Could not remove this member." }, 500);
  }
});