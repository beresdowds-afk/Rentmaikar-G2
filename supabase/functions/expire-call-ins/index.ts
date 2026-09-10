import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireCronSecretAsync } from "../_shared/cron-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const cronDenied = await requireCronSecretAsync(req);
  if (cronDenied) return cronDenied;

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
    .select("id, type, driver_id, vehicle_id, extend_requested, renewal_count, max_renewals, recall_initiated");

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

    // For fault or maintenance call-ins that reached maximum renewals (>= 3) → initiate vehicle call-in process
    const isFaultOrMaint = c.type === "fault" || c.type === "maintenance";
    const reachedMaxRenewals = (c.renewal_count ?? 0) >= (c.max_renewals ?? 3);
    if (isFaultOrMaint && reachedMaxRenewals && !c.recall_initiated) {
      const { data: veh } = await admin
        .from("vehicles").select("owner_id").eq("id", c.vehicle_id).maybeSingle();
      const { data: recall } = await admin.from("vehicle_recalls").insert({
        vehicle_id: c.vehicle_id,
        driver_id: c.driver_id,
        owner_id: veh?.owner_id ?? null,
        recall_reason: "Fault/maintenance call-in reached maximum 3 renewals (72h grounded). Vehicle call-in process initiated for mandatory mechanical inspection.",
        recall_type: "fault_maintenance_max_renewals",
        status: "requested",
        priority: "high",
        triggered_by_call_ins: [c.id],
      }).select().single();

      if (recall) {
        await admin
          .from("driver_call_ins")
          .update({ recall_initiated: true, recall_id: recall.id })
          .eq("id", c.id);
      }
    }
  }

  return new Response(JSON.stringify({ success: true, expired: expired?.length ?? 0 }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
});
