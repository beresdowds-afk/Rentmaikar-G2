import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // 1. Fetch all active schedules that are 'scheduled' or 'due'
    const { data: schedules, error: schedErr } = await supa
      .from("vehicle_maintenance_schedules")
      .select("*, vehicles(id, mileage, make, model, year, license_plate)")
      .in("status", ["scheduled", "due"]);

    if (schedErr) throw schedErr;

    const now = new Date();
    let updatedCount = 0;
    const alertList: any[] = [];

    for (const item of schedules || []) {
      const currentMileage = Number(item.vehicles?.mileage || 0);
      const nextDueMileage = item.next_due_mileage ? Number(item.next_due_mileage) : null;
      const nextDueAt = item.next_due_at ? new Date(item.next_due_at) : null;

      let newStatus = item.status;

      // Mileage check: overdue if current mileage exceeds next due mileage by > 500 miles; due if within 300 miles
      if (nextDueMileage !== null) {
        if (currentMileage >= nextDueMileage) {
          newStatus = currentMileage >= nextDueMileage + 500 ? "overdue" : "due";
        }
      }

      // Date check
      if (nextDueAt !== null && newStatus !== "overdue") {
        if (now >= nextDueAt) {
          newStatus = now.getTime() - nextDueAt.getTime() > 7 * 24 * 3600 * 1000 ? "overdue" : "due";
        }
      }

      if (newStatus !== item.status) {
        await supa
          .from("vehicle_maintenance_schedules")
          .update({ status: newStatus, updated_at: now.toISOString() })
          .eq("id", item.id);

        updatedCount++;
        alertList.push({
          schedule_id: item.id,
          vehicle_id: item.vehicle_id,
          service_type: item.service_type,
          new_status: newStatus,
        });
      }
    }

    return json(200, {
      ok: true,
      processed: schedules?.length || 0,
      updated: updatedCount,
      alerts: alertList,
    });
  } catch (err: any) {
    return json(500, { error: err.message || "Failed to process maintenance schedules" });
  }
});
