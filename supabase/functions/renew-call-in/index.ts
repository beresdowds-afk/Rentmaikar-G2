import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const Schema = z.object({
  call_in_id: z.string().uuid(),
  notes: z.string().trim().max(1000).optional(),
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const driverId = userData.user.id;

    const parsed = Schema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid input", details: parsed.error.flatten() }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const { call_in_id, notes } = parsed.data;

    // Call database RPC with driver's context
    const { data: rpcResult, error: rpcErr } = await userClient.rpc("renew_driver_call_in", {
      p_call_in_id: call_in_id,
      p_notes: notes || null,
    });

    if (rpcErr) {
      // Fallback to service role execution if needed
      console.warn("renew_driver_call_in RPC error, executing via service role:", rpcErr);
      const admin = createClient(supabaseUrl, serviceKey);

      const { data: callIn, error: fetchErr } = await admin
        .from("driver_call_ins")
        .select("*, vehicles(owner_id)")
        .eq("id", call_in_id)
        .single();

      if (fetchErr || !callIn) {
        return new Response(JSON.stringify({ error: "Call-in not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      if (callIn.driver_id !== driverId) {
        return new Response(JSON.stringify({ error: "Unauthorized to renew this call-in" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      if (callIn.type !== "fault" && callIn.type !== "maintenance") {
        return new Response(JSON.stringify({ error: "Only fault and maintenance call-ins are renewable" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const currentCount = callIn.renewal_count || 0;
      const maxRenewals = callIn.max_renewals || 3;

      if (currentCount >= maxRenewals) {
        // Initiate recall if not already initiated
        let recallId = callIn.recall_id;
        if (!callIn.recall_initiated) {
          const { data: recall } = await admin.from("vehicle_recalls").insert({
            vehicle_id: callIn.vehicle_id,
            driver_id: callIn.driver_id,
            owner_id: (callIn as any).vehicles?.owner_id ?? null,
            recall_reason: "Vehicle fault/maintenance call-in reached maximum 3 renewals (72h grounded). Vehicle call-in process initiated for mandatory mechanical inspection.",
            recall_type: "fault_maintenance_max_renewals",
            status: "requested",
            priority: "high",
            triggered_by_call_ins: [callIn.id],
          }).select().single();
          recallId = recall?.id;

          await admin
            .from("driver_call_ins")
            .update({ recall_initiated: true, recall_id: recallId })
            .eq("id", callIn.id);
        }

        return new Response(JSON.stringify({
          success: true,
          renewed: false,
          max_reached: true,
          renewal_count: currentCount,
          max_renewals: maxRenewals,
          recall_initiated: true,
          recall_id: recallId,
          message: "Maximum 3 renewals reached. Vehicle call-in process has been initiated.",
        }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const newRenewalCount = currentCount + 1;
      const baseExpires = new Date(callIn.expires_at).getTime();
      const newExpiresAt = new Date(Math.max(baseExpires, Date.now()) + 24 * 60 * 60 * 1000).toISOString();

      let recallId = null;
      const isMaxReached = newRenewalCount >= maxRenewals;

      if (isMaxReached) {
        const { data: recall } = await admin.from("vehicle_recalls").insert({
          vehicle_id: callIn.vehicle_id,
          driver_id: callIn.driver_id,
          owner_id: (callIn as any).vehicles?.owner_id ?? null,
          recall_reason: "Vehicle fault/maintenance call-in reached maximum 3 renewals (72h grounded). Vehicle call-in process initiated for mandatory mechanical inspection.",
          recall_type: "fault_maintenance_max_renewals",
          status: "requested",
          priority: "high",
          triggered_by_call_ins: [callIn.id],
        }).select().single();
        recallId = recall?.id;
      }

      const appendedNotes = notes
        ? `${callIn.notes ? callIn.notes + "\n" : ""}[Renewal #${newRenewalCount}]: ${notes}`
        : callIn.notes;

      await admin
        .from("driver_call_ins")
        .update({
          renewal_count: newRenewalCount,
          expires_at: newExpiresAt,
          last_renewed_at: new Date().toISOString(),
          notes: appendedNotes,
          recall_initiated: isMaxReached,
          recall_id: recallId ?? callIn.recall_id,
        })
        .eq("id", callIn.id);

      await admin
        .from("profiles")
        .update({ suspended_until: newExpiresAt })
        .eq("user_id", driverId);

      await admin
        .from("vehicle_geofences")
        .update({ active: true })
        .eq("call_in_id", callIn.id);

      return new Response(JSON.stringify({
        success: true,
        renewed: true,
        renewal_count: newRenewalCount,
        max_renewals: maxRenewals,
        expires_at: newExpiresAt,
        max_reached: isMaxReached,
        recall_initiated: isMaxReached,
        recall_id: recallId,
        message: isMaxReached
          ? "Call-in renewed for final 24hrs (Renewal 3 of 3). Maximum renewals reached; vehicle call-in process has been initiated."
          : `Call-in successfully renewed for 24 hours (Renewal ${newRenewalCount} of 3).`,
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify(rpcResult), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e) {
    console.error("renew-call-in error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
