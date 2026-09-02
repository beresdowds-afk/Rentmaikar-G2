import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { requireInternal } from "../_shared/guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const Schema = z.object({
  driver_id: z.string().uuid(),
  vehicle_id: z.string().uuid(),
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Internal-only endpoint: cron secret or service-role bearer required.
  const denied = requireInternal(req);
  if (denied) return denied;

  try {
    const parsed = Schema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid input" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const { driver_id, vehicle_id } = parsed.data;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Look at fault/maintenance call-ins in the last 48h
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: calls } = await admin
      .from("driver_call_ins")
      .select("id, started_at, type")
      .eq("driver_id", driver_id)
      .eq("vehicle_id", vehicle_id)
      .in("type", ["fault", "maintenance"])
      .gte("started_at", since);

    if (!calls || calls.length < 2) {
      return new Response(JSON.stringify({ success: true, escalated: false }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Distinct calendar dates (UTC)
    const days = new Set(calls.map((c) => new Date(c.started_at).toISOString().slice(0, 10)));
    if (days.size < 2) {
      return new Response(JSON.stringify({ success: true, escalated: false }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const sorted = [...days].sort();
    const d1 = new Date(sorted[sorted.length - 2] + "T00:00:00Z").getTime();
    const d2 = new Date(sorted[sorted.length - 1] + "T00:00:00Z").getTime();
    const consecutive = (d2 - d1) === 24 * 60 * 60 * 1000;
    if (!consecutive) {
      return new Response(JSON.stringify({ success: true, escalated: false }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Skip if an open recall already exists for this vehicle
    const { data: openRecall } = await admin
      .from("vehicle_recalls")
      .select("id")
      .eq("vehicle_id", vehicle_id)
      .in("status", ["requested", "approved", "in_progress"])
      .maybeSingle();
    if (openRecall) {
      return new Response(JSON.stringify({ success: true, escalated: false, reason: "recall_exists" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { data: veh } = await admin
      .from("vehicles").select("owner_id").eq("id", vehicle_id).maybeSingle();

    const { data: recall } = await admin.from("vehicle_recalls").insert({
      vehicle_id,
      driver_id,
      owner_id: veh?.owner_id ?? null,
      recall_reason: "Repeated fault/maintenance call-ins on 2 consecutive days",
      recall_type: "repeat_call_ins",
      status: "requested",
      priority: "high",
      triggered_by_call_ins: calls.map((c) => c.id),
    }).select().single();

    return new Response(JSON.stringify({ success: true, escalated: true, recall_id: recall?.id }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
