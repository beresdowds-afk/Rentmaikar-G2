import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const Schema = z.object({
  type: z.enum(["fault", "maintenance", "sick"]),
  reason: z.string().trim().min(3).max(500),
  notes: z.string().trim().max(2000).optional(),
  vehicle_id: z.string().uuid(),
  rental_id: z.string().uuid().optional(),
  geofence_lat: z.number().min(-90).max(90),
  geofence_lng: z.number().min(-180).max(180),
  telemetry_snapshot: z.record(z.any()).optional(),
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
    const body = parsed.data;

    const admin = createClient(supabaseUrl, serviceKey);

    // Enforce: only one active call-in per driver
    const { data: existing } = await admin
      .from("driver_call_ins")
      .select("id, type")
      .eq("driver_id", driverId)
      .eq("status", "active")
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ error: `You already have an active ${existing.type} call-in.` }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Ensure driver has this rental / vehicle active
    const { data: rental } = await admin
      .from("rentals")
      .select("id, vehicle_id")
      .eq("driver_id", driverId)
      .eq("vehicle_id", body.vehicle_id)
      .eq("status", "active")
      .maybeSingle();

    if (!rental) {
      return new Response(JSON.stringify({ error: "No active rental for this vehicle." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { data: inserted, error: insErr } = await admin
      .from("driver_call_ins")
      .insert({
        driver_id: driverId,
        rental_id: rental.id,
        vehicle_id: body.vehicle_id,
        type: body.type,
        reason: body.reason,
        notes: body.notes,
        geofence_lat: body.geofence_lat,
        geofence_lng: body.geofence_lng,
        geofence_radius_m: 20,
        telemetry_snapshot: body.telemetry_snapshot ?? {},
      })
      .select()
      .single();

    if (insErr) {
      console.error("insert failed:", insErr);
      return new Response(JSON.stringify({ error: insErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Fire-and-forget repeat-check
    admin.functions.invoke("check-repeat-call-ins", {
      body: { driver_id: driverId, vehicle_id: body.vehicle_id },
    }).catch((e) => console.error("repeat check invoke failed", e));

    return new Response(JSON.stringify({ success: true, call_in: inserted }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
