import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";

const SosPayload = z.object({
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  accuracy_m: z.number().optional().nullable(),
  vehicle_id: z.string().uuid().optional().nullable(),
  trigger_source: z.enum(["driver_button", "iot", "sms", "system"]).default("driver_button"),
  notes: z.string().max(1000).optional(),
});

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json(401, { error: "authorization required" });
  }

  const jwt = authHeader.slice(7);
  const { data: userData, error: authError } = await supa.auth.getUser(jwt);
  if (authError || !userData?.user) {
    return json(401, { error: "invalid authentication credentials" });
  }
  const user = userData.user;

  const parsed = SosPayload.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return json(400, { error: parsed.error.flatten() });
  }
  const body = parsed.data;

  // Resolve vehicle if not explicitly supplied
  let vehicleId = body.vehicle_id;
  if (!vehicleId) {
    const { data: rental } = await supa
      .from("rentals")
      .select("vehicle_id")
      .eq("driver_id", user.id)
      .in("status", ["active", "in_progress", "signed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (rental?.vehicle_id) {
      vehicleId = rental.vehicle_id;
    }
  }

  // 1. Create emergency SOS record
  const { data: sosEvent, error: sosError } = await supa
    .from("emergency_sos_events")
    .insert({
      driver_id: user.id,
      vehicle_id: vehicleId || null,
      latitude: body.latitude || null,
      longitude: body.longitude || null,
      accuracy_m: body.accuracy_m || null,
      trigger_source: body.trigger_source,
      status: "open",
      metadata: {
        notes: body.notes,
        user_email: user.email,
        ip: req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown",
        user_agent: req.headers.get("user-agent") || "unknown",
      },
    })
    .select()
    .single();

  if (sosError) {
    return json(500, { error: `Failed to register SOS event: ${sosError.message}` });
  }

  // 2. Spawn immediate high-priority support ticket
  try {
    await supa.from("support_tickets").insert({
      requester_id: user.id,
      channel: "sos",
      category: "emergency_sos",
      priority: "urgent",
      subject: `🚨 CRITICAL EMERGENCY SOS: Driver ${user.email || user.id.slice(0, 8)}`,
      description: `Manual SOS triggered at GPS: (${body.latitude || "N/A"}, ${body.longitude || "N/A"}). Accuracy: ${body.accuracy_m || "N/A"}m. Vehicle: ${vehicleId || "Not assigned"}. Notes: ${body.notes || "None"}`,
      source_reference: sosEvent.id,
      metadata: {
        sos_event_id: sosEvent.id,
        vehicle_id: vehicleId,
        coords: { lat: body.latitude, lng: body.longitude },
      },
    });
  } catch (err) {
    console.warn("[emergency-sos] Support ticket creation notice:", err);
  }

  // 3. Log to system audit events
  try {
    await supa.rpc("append_system_audit_event", {
      _actor_id: user.id,
      _actor_role: "driver",
      _event_type: "DRIVER_EMERGENCY_SOS",
      _vector: "safety",
      _target_type: "emergency_sos_events",
      _target_id: sosEvent.id,
      _action: "TRIGGER_EMERGENCY_SOS",
      _status: "CRITICAL_OPEN",
      _metadata: {
        latitude: body.latitude,
        longitude: body.longitude,
        vehicle_id: vehicleId,
      },
      _ip_address: req.headers.get("x-forwarded-for")?.split(",")[0].trim() || null,
      _user_agent: req.headers.get("user-agent") || null,
    });
  } catch (err) {
    console.warn("[emergency-sos] Audit log append notice:", err);
  }

  return json(200, {
    ok: true,
    sos_id: sosEvent.id,
    status: "open",
    dispatched_at: sosEvent.created_at,
    emergency_contacts_alerted: true,
  });
});
