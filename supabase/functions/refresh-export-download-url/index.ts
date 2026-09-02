// Returns a fresh 1-hour signed URL for an existing ZIP in `document-exports`.
// Used by the client to auto-recover when a previous URL has expired.
// Rate-limited (20/min) since it's cheap but must not be exploitable to enumerate paths.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";
import { checkRateLimit, tooMany } from "../_shared/rate-limit.ts";

const Body = z.object({ storage_path: z.string().min(1).max(400) });

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: parsed.error.flatten() });
    const { storage_path } = parsed.data;

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const auth = req.headers.get("authorization") ?? "";
    const jwt = auth.replace(/^Bearer\s+/i, "");
    const { data: userData } = jwt ? await supa.auth.getUser(jwt) : { data: { user: null } as any };
    if (!userData?.user) return json(401, { error: "unauthorized" });
    const uid = userData.user.id;

    const rl = await checkRateLimit(uid, "refresh-export-download-url", 20);
    if (!rl.allowed) return tooMany(rl.retry_after_seconds);

    // AuthZ: caller must be either the exporter, the target user, or an admin/assistant.
    // Storage path convention: `<exporterId>/<targetUserId>/<stamp>-<label>.zip`.
    const parts = storage_path.split("/");
    if (parts.length < 3) return json(400, { error: "invalid storage_path" });
    const [exporterId, targetUserId] = parts;

    let allowed = uid === exporterId || uid === targetUserId;
    if (!allowed) {
      const { data: roles } = await supa.from("user_roles")
        .select("role").eq("user_id", uid)
        .in("role", ["admin", "admin_assistant"] as any);
      const roleList = (roles ?? []).map((r: any) => r.role);
      if (roleList.includes("admin")) {
        allowed = true;
      } else if (roleList.includes("admin_assistant")) {
        // Assistants only for explicitly assigned users.
        const { data: assignment } = await supa
          .from("admin_assistant_user_assignments")
          .select("id")
          .eq("assistant_id", uid)
          .eq("target_user_id", targetUserId)
          .limit(1);
        allowed = !!(assignment && assignment.length > 0);
      }
    }
    if (!allowed) return json(403, { error: "forbidden" });


    // Confirm the ZIP actually exists in the audit log to avoid path guessing.
    const { data: audit } = await supa.from("document_export_audit")
      .select("id").eq("storage_path", storage_path).limit(1);
    if (!audit || audit.length === 0) return json(404, { error: "export not found" });

    const { data, error } = await supa.storage
      .from("document-exports").createSignedUrl(storage_path, 3600);
    if (error) return json(500, { error: error.message });

    return json(200, { download_url: data?.signedUrl, expires_in: 3600 });
  } catch (e) {
    return json(500, { error: String(e) });
  }
});
