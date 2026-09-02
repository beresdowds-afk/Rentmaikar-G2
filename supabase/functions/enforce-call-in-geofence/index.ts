import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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

  try {
    const { data: fences, error: fencesErr } = await admin
      .from("vehicle_geofences")
      .select("id, vehicle_id, call_in_id, center_lat, center_lng, radius_m")
      .eq("active", true)
      .limit(500);

    if (fencesErr) {
      console.error("[enforce-call-in-geofence] fences fetch error:", fencesErr);
      return new Response(JSON.stringify({ error: "Failed to load geofences" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const results: any[] = [];

    for (const fence of fences ?? []) {
      try {
        const { data: tele } = await admin
          .from("mqtt_telemetry_logs")
          .select("payload, received_at")
          .eq("vehicle_id", String(fence.vehicle_id))
          .eq("data_type", "location")
          .order("received_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        let lat: number | null = null, lng: number | null = null;
        if (tele?.payload) {
          const p: any = tele.payload;
          lat = typeof p.lat === "number" ? p.lat : (typeof p.latitude === "number" ? p.latitude : null);
          lng = typeof p.lng === "number" ? p.lng : (typeof p.longitude === "number" ? p.longitude : null);
        }
        if (lat === null || lng === null) {
          await admin.from("vehicle_geofences").update({ last_checked_at: new Date().toISOString() }).eq("id", fence.id);
          continue;
        }

        const dist = haversineMeters(fence.center_lat, fence.center_lng, lat, lng);
        await admin.from("vehicle_geofences").update({
          last_checked_at: new Date().toISOString(),
          last_distance_m: dist,
        }).eq("id", fence.id);

        if (dist > fence.radius_m) {
          await admin.from("vehicle_geofences").update({
            active: false,
            breached_at: new Date().toISOString(),
          }).eq("id", fence.id);

          await admin.from("driver_call_ins").update({
            status: "breached",
            ended_at: new Date().toISOString(),
            end_reason: `Geofence breach: ${Math.round(dist)}m from center (limit ${fence.radius_m}m)`,
          }).eq("id", fence.call_in_id);

          results.push({ call_in_id: fence.call_in_id, breached: true, distance_m: Math.round(dist) });
        }
      } catch (fenceErr) {
        console.error("[enforce-call-in-geofence] fence error:", fence.id, fenceErr);
        results.push({ call_in_id: fence.call_in_id, error: String(fenceErr) });
      }
    }

    return new Response(JSON.stringify({ success: true, checked: fences?.length ?? 0, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error("[enforce-call-in-geofence] fatal:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
