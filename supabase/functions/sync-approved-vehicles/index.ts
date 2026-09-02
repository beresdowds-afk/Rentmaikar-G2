// Scheduled sync: pulls approved owner vehicle details into the vehicle
// registry. Idempotent — plates already present are skipped and reported.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { requireCronSecretAsync } from "../_shared/cron-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const unauthorized = await requireCronSecretAsync(req);
  if (unauthorized) return unauthorized;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let source = "cron";
    try {
      const body = await req.json();
      if (typeof body?.source === "string" && body.source.trim()) source = body.source.trim();
    } catch (_e) {
      // no body — scheduled invoke
    }

    const { data, error } = await supabase.rpc("sync_approved_application_vehicles", {
      p_source: source,
    });
    if (error) throw error;

    console.log("vehicle import run complete", data);
    return new Response(JSON.stringify({ ok: true, result: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("sync-approved-vehicles failed", message);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
