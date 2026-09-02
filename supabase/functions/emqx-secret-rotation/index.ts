import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEmqxCredentials, probeEmqx, readCredentialVersion } from "../_shared/emqx-credentials.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/**
 * EMQX secret rotation broker.
 * Actions: status | stage | verify | activate | rollback | probe
 * Admin-only. Raw credentials never leave the backend.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: roleRow } = await admin
      .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return json({ error: "Admin access required" }, 403);

    const { action, versionId, apiKey, apiSecret, notes } = await req.json().catch(() => ({}));

    const history = async () => {
      const { data } = await admin
        .from("emqx_credential_versions")
        .select("id, api_key_masked, api_secret_masked, status, verified_at, verification_result, notes, created_at, activated_at, retired_at")
        .order("created_at", { ascending: false })
        .limit(25);
      return data ?? [];
    };

    switch (action) {
      case "status": {
        const creds = await getEmqxCredentials();
        return json({
          success: true,
          configured: Boolean(creds),
          source: creds?.source ?? null,
          activeVersionId: creds?.versionId ?? null,
          url: creds?.url ?? null,
          history: await history(),
        });
      }

      case "probe": {
        const creds = await getEmqxCredentials();
        if (!creds) return json({ success: false, error: "No EMQX credentials configured" }, 400);
        const result = await probeEmqx(creds.url, creds.key, creds.secret);
        return json({ success: result.ok, source: creds.source, result });
      }

      case "stage": {
        if (!apiKey || !apiSecret) return json({ error: "apiKey and apiSecret are required" }, 400);
        const { data, error } = await userClient.rpc("emqx_stage_credentials", {
          _api_key: apiKey,
          _api_secret: apiSecret,
          _notes: notes ?? null,
        });
        if (error) return json({ error: error.message }, 400);
        return json({ success: true, versionId: data, history: await history() });
      }

      case "verify": {
        if (!versionId) return json({ error: "versionId is required" }, 400);
        const row = await readCredentialVersion(versionId);
        if (!row) return json({ error: "Credential version not found" }, 404);
        const { getEmqxManagementConfig } = await import("../_shared/emqx-config.ts");
        const url = (await getEmqxManagementConfig()).apiUrl;
        const result = await probeEmqx(url, row.api_key, row.api_secret);
        await admin.rpc("emqx_record_verification", {
          _version_id: versionId,
          _ok: result.ok,
          _result: { status: result.status, detail: result.detail, checked_at: new Date().toISOString() },
        });
        return json({ success: result.ok, result, history: await history() });
      }

      case "activate": {
        if (!versionId) return json({ error: "versionId is required" }, 400);
        const { data, error } = await userClient.rpc("emqx_activate_credentials", { _version_id: versionId });
        if (error) return json({ error: error.message }, 400);
        return json({ success: true, data, history: await history() });
      }

      case "rollback": {
        const { data, error } = await userClient.rpc("emqx_rollback_credentials");
        if (error) return json({ error: error.message }, 400);
        return json({ success: true, data, history: await history() });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error("[emqx-secret-rotation]", err);
    return json({ error: (err as Error).message ?? "Internal server error" }, 500);
  }
});
