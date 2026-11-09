import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Body {
  target_user_id: string;
  active: boolean;
  reason: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (status: number, payload: unknown) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Missing authorization" });

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json(401, { error: "Invalid session" });

    const body = (await req.json()) as Body;
    const { target_user_id, active, reason } = body || ({} as Body);
    if (!target_user_id || typeof active !== "boolean") {
      return json(400, { error: "target_user_id and active are required" });
    }
    if (!reason || reason.trim().length < 5) {
      return json(400, {
        error: "A reason (at least 5 characters) is required for audit.",
      });
    }
    if (target_user_id === userData.user.id) {
      return json(400, { error: "You cannot deactivate your own account." });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Caller must be admin OR admin_assistant with can_manage_users = true.
    const { data: callerRoles, error: callerRoleError } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    if (callerRoleError) return json(500, { error: "Could not verify caller roles." });
    const roles = (callerRoles || []).map((r: any) => r.role);
    const isAdmin = roles.includes("admin");
    let isAssistantWithPerm = false;
    if (!isAdmin && roles.includes("admin_assistant")) {
      const { data: perm } = await admin
        .from("admin_assistant_permissions")
        .select("can_manage_users")
        .eq("user_id", userData.user.id)
        .maybeSingle();
      isAssistantWithPerm = !!perm?.can_manage_users;
    }
    if (!isAdmin && !isAssistantWithPerm) {
      return json(403, {
        error:
          "Only admins or admin assistants with the Manage Users permission can change activation status.",
      });
    }

    // Look up target role — protect other admins from being toggled by assistants.
    const { data: targetRoles, error: targetRoleError } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", target_user_id);
    if (targetRoleError) return json(500, { error: "Could not verify target roles." });
    const targetRoleList = (targetRoles || []).map((r: any) => r.role);
    if (targetRoleList.includes("admin") && !isAdmin) {
      return json(403, {
        error: "Admin assistants cannot change an admin's activation status.",
      });
    }

    const now = new Date().toISOString();

    // Cascade to linked accounts (couple/linked accounts stored in account_links).
    const { data: linkedRows, error: linkedError } = await admin
      .rpc("get_linked_user_ids", { _user_id: target_user_id });
    if (linkedError) return json(500, { error: "Could not verify linked accounts." });
    const linkedIds: string[] = Array.isArray(linkedRows)
      ? (linkedRows as any[])
          .map((r: any) => (typeof r === "string" ? r : r.linked_user_id))
          .filter((id: string) => id && id !== target_user_id)
      : [];

    const allTargets = Array.from(new Set([target_user_id, ...linkedIds]));
    if (allTargets.includes(userData.user.id)) {
      return json(400, { error: "This action would also affect your own account." });
    }
    if (!isAdmin && linkedIds.length) {
      const { data: linkedRoles, error: linkedRoleError } = await admin
        .from("user_roles").select("role").in("user_id", linkedIds);
      if (linkedRoleError) return json(500, { error: "Could not verify linked account roles." });
      if ((linkedRoles || []).some((r) => r.role === "admin")) {
        return json(403, { error: "Admin assistants cannot change a linked admin's activation status." });
      }
    }

    const { data: updatedProfiles, error: updateErr } = await admin
      .from("profiles")
      .update({ is_active: active, updated_at: now })
      .in("user_id", allTargets)
      .select("user_id");
    if (updateErr) return json(400, { error: updateErr.message });
    if ((updatedProfiles || []).length !== allTargets.length) {
      return json(500, { error: "Some profiles were not updated. Review affected accounts before retrying." });
    }

    const authFailures: string[] = [];
    for (const uid of allTargets) {
      try {
        const { error } = await admin.auth.admin.updateUserById(uid, {
          ban_duration: active ? "none" : "876000h", // ~100 years
        });
        if (error) {
          console.error("auth ban toggle failed for", uid, error);
          authFailures.push(uid);
        }
      } catch (e) {
        console.error("auth ban toggle failed for", uid, e);
        authFailures.push(uid);
      }
    }

    // Audit log — one row per affected user so both sides are traceable.
    const auditRows = allTargets.map((uid) => ({
      actor_id: userData.user.id,
      target_user_id: uid,
      action: active ? "user_activated" : "user_deactivated",
      old_role: null,
      new_role: null,
      notes: JSON.stringify({
        summary: active
          ? "Account reactivated by administrator"
          : "Account deactivated by administrator",
        actor_kind: isAdmin ? "admin" : "admin_assistant",
        target_roles: uid === target_user_id ? targetRoleList : ["linked_account"],
        reason,
        primary_target: target_user_id,
        cascaded: uid !== target_user_id,
        linked_group: allTargets,
        auth_update_failed: authFailures.includes(uid),
        at: now,
      }),
    }));
    const { error: auditError } = await admin.from("role_audit_log").insert(auditRows);
    if (auditError) console.error("activation audit insert failed:", auditError);
    if (authFailures.length || auditError) {
      return json(500, {
        error: "Profile status changed, but authentication or audit updates failed. Review affected accounts before retrying.",
        auth_update_failed_user_ids: authFailures,
        audit_failed: !!auditError,
      });
    }

    return json(200, {
      success: true,
      target_user_id,
      active,
      cascaded_user_ids: linkedIds,
      message: linkedIds.length
        ? `User and ${linkedIds.length} linked account(s) ${active ? "activated" : "deactivated"}.`
        : `User ${active ? "activated" : "deactivated"}.`,
    });
  } catch (err: any) {
    console.error("admin-set-user-active error:", err);
    return json(500, { error: err?.message || "Unknown error" });
  }
});
