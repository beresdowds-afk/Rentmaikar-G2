import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { requireAuthenticatedUser } from "../_shared/auth-guards.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUCKET = "elevenlabs-test-audio";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authRes = await requireAuthenticatedUser(req);
  if (authRes instanceof Response) return authRes;
  const { userId } = authRes as { userId: string };

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Admin check
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
    const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");

    const { logId, path } = await req.json();
    let storagePath: string | null = path ?? null;
    let ownerId: string | null = null;

    if (logId) {
      const { data: row, error } = await admin.from("elevenlabs_test_logs")
        .select("audio_storage_path, user_id").eq("id", logId).maybeSingle();
      if (error || !row) throw new Error("Log not found");
      storagePath = row.audio_storage_path;
      ownerId = row.user_id;
    }

    if (!storagePath) throw new Error("No audio for this run");
    if (!isAdmin && ownerId !== userId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { data: signed, error: sErr } = await admin.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 10);
    if (sErr || !signed) throw new Error(sErr?.message || "Failed to sign URL");

    return new Response(JSON.stringify({ url: signed.signedUrl, expiresIn: 600 }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
