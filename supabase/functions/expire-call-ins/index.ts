import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const cronSecret = Deno.env.get("CRON_SECRET");
  const provided = req.headers.get("x-cron-secret") ?? new URL(req.url).searchParams.get("secret");
  if (cronSecret && provided !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: expired } = await admin
    .from("driver_call_ins")
    .update({
      status: "expired",
      ended_at: new Date().toISOString(),
      end_reason: "Call-in window expired",
    })
    .eq("status", "active")
    .lt("expires_at", new Date().toISOString())
    .select("id, type, driver_id, vehicle_id, extend_requested");

  // For sick call-ins that reached the 7d cap AND requested extension → create recall requiring owner+admin approval
  for (const c of expired ?? []) {
    if (c.type === "sick" && c.extend_requested) {
      const { data: veh } = await admin
        .from("vehicles").select("owner_id").eq("id", c.vehicle_id).maybeSingle();
      await admin.from("vehicle_recalls").insert({
        vehicle_id: c.vehicle_id,
        driver_id: c.driver_id,
        owner_id: veh?.owner_id ?? null,
        recall_reason: "Sick call-in exceeded 7-day cap; extension requested",
        recall_type: "sick_extension",
        status: "requested",
        priority: "high",
        triggered_by_call_ins: [c.id],
      });
    }
  }

  return new Response(JSON.stringify({ success: true, expired: expired?.length ?? 0 }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
});
