import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

interface DeleteResult {
  user_id: string;
  status: "deleted" | "forbidden" | "error";
  message?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const token = authHeader.slice(7);

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const admin = createClient(url, service);

    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const callerId = userData.user.id;

    let body: { userIds?: unknown; reason?: unknown };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const ids = Array.isArray(body.userIds)
      ? body.userIds.filter((v): v is string => typeof v === "string" && uuidRe.test(v))
      : [];
    if (ids.length === 0 || ids.length > 100) {
      return json({ error: "userIds must contain 1-100 valid user ids" }, 400);
    }
    const reason = typeof body.reason === "string" ? body.reason.slice(0, 500) : null;

    const results: DeleteResult[] = [];

    for (const targetId of ids) {
      // Authorization is decided in the database, using the caller's own JWT.
      const { data: allowed, error: authzErr } = await userClient.rpc(
        "can_delete_user_account",
        { _target_user_id: targetId },
      );

      if (authzErr) {
        results.push({ user_id: targetId, status: "error", message: authzErr.message });
        continue;
      }
      if (allowed !== true) {
        results.push({
          user_id: targetId,
          status: "forbidden",
          message: "You are not allowed to delete this account.",
        });
        continue;
      }

      const { data: profile } = await admin
        .from("profiles")
        .select("email, full_name")
        .eq("user_id", targetId)
        .maybeSingle();

      const { data: roles } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", targetId);

      const { data: purged, error: purgeErr } = await admin.rpc("purge_user_account", {
        _target_user_id: targetId,
      });
      if (purgeErr) {
        results.push({ user_id: targetId, status: "error", message: purgeErr.message });
        continue;
      }

      const { error: delErr } = await admin.auth.admin.deleteUser(targetId);
      if (delErr && !/not found/i.test(delErr.message)) {
        results.push({ user_id: targetId, status: "error", message: delErr.message });
        continue;
      }

      await admin.from("admin_audit_log").insert({
        admin_id: callerId,
        action: "user_account_deleted",
        target_table: "auth.users",
        target_id: targetId,
        details: {
          email: profile?.email ?? null,
          full_name: profile?.full_name ?? null,
          roles: (roles ?? []).map((r: { role: string }) => r.role),
          purged,
          reason,
        },
      });

      results.push({ user_id: targetId, status: "deleted" });
    }

    return json({ results });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    return json({ error: message }, 500);
  }
});
