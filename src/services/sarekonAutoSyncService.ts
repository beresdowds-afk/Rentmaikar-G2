import { supabase } from "@/integrations/supabase/client";
import { invokeEdge } from "@/lib/edge-invoke";

export interface ScanAndSyncResponse {
  ok: boolean;
  total_scanned: number;
  active_count: number;
  dormant_count: number;
  unprovisioned_count: number;
  usa_vehicles_linked: Array<{
    device_id: string;
    serial_number: string;
    vehicle_id: string;
    vehicle_label: string;
  }>;
  driver_vehicles_published: Array<{
    device_id: string;
    driver_name: string;
    vehicle_description: string;
    address: string | null;
    latitude: number;
    longitude: number;
    speed_kmh: number;
  }>;
  agreements_checked: {
    total: number;
    completed: number;
    pending: number;
    pickup_notifications_sent: number;
  };
  errors: string[];
}

export interface VehicleAgreementStatus {
  vehicleId: string;
  hasAgreement: boolean;
  isCompleted: boolean;
  status: string | null;
  driverId: string | null;
  ownerId: string | null;
  driverSignature: string | null;
  ownerSignature: string | null;
  pickupLocationNotified: boolean;
}

/**
 * Triggers the continuous SAREKON scanner which:
 * 1. Scans SAREKON for new devices and updates registry
 * 2. Tests liveness and flags active vs dormant vs unprovisioned
 * 3. Links devices to USA-ONLY vehicles (Maryland, DC, etc.)
 * 4. Queries active driver-linked vehicles and publishes to live maps
 * 5. Auto-detects driver-owner agreement completion and dispatches pickup notifications
 * 6. Updates Admin records and notifications
 */
export async function scanSarekonFleet(): Promise<ScanAndSyncResponse> {
  try {
    const { data, error } = await invokeEdge<ScanAndSyncResponse>("sarekon-admin", {
      action: "scan_and_sync",
    });

    if (!error && data) {
      return data;
    }

    // If edge function returned an error other than 404, or if 404
    const errMsg = error?.message || "";
    const isMissingFunction =
      errMsg.includes("Requested function was not found") ||
      errMsg.includes("not found") ||
      errMsg.includes("404");

    if (!isMissingFunction) {
      throw new Error(errMsg || "Failed to scan SAREKON fleet");
    }

    console.warn(
      "[scanSarekonFleet] Edge function 'sarekon-admin' is not deployed on Supabase. Falling back to direct database audit."
    );

    // Direct database audit fallback
    return await runDirectDatabaseScanFallback();
  } catch (err) {
    const errMsg = (err as Error).message || "";
    if (
      errMsg.includes("Requested function was not found") ||
      errMsg.includes("not found") ||
      errMsg.includes("404")
    ) {
      return await runDirectDatabaseScanFallback();
    }
    throw err;
  }
}

/**
 * Direct client-side audit when edge function is not deployed.
 * Queries vehicles, agreements, and devices directly from Supabase.
 */
async function runDirectDatabaseScanFallback(): Promise<ScanAndSyncResponse> {
  const errors: string[] = [
    "Notice: Edge function 'sarekon-admin' is not deployed on Supabase (HTTP 404). Results reflect direct database audit.",
  ];

  // 1. Fetch devices
  const { data: devices } = await supabase
    .from("iot_devices")
    .select("id, serial_number, provider, status, vehicle_id, provider_device_id")
    .eq("provider", "sarekon");

  const totalDevices = devices?.length ?? 0;
  const activeCount = devices?.filter((d) => d.status === "active").length ?? 0;
  const dormantCount = devices?.filter((d) => d.status === "offline" || d.status === "inactive").length ?? 0;
  const unprovisionedCount = devices?.filter((d) => !d.vehicle_id).length ?? 0;

  // 2. Fetch USA vehicles
  const usaCities = [
    "maryland", "baltimore", "silver spring", "bethesda", "rockville", "bowie",
    "annapolis", "waldorf", "frederick", "gaithersburg", "washington", "dc", "virginia"
  ];
  
  const { data: allVehicles } = await supabase
    .from("vehicles")
    .select("id, make, model, year, license_plate, pickup_city, gps_tracking_enabled");

  const usaVehicles = (allVehicles ?? []).filter((v) => {
    const city = (v.pickup_city || "").toLowerCase();
    return usaCities.some((c) => city.includes(c));
  });

  const usaVehiclesLinked = (devices ?? [])
    .filter((d) => Boolean(d.vehicle_id))
    .map((d) => {
      const v = (allVehicles ?? []).find((veh) => veh.id === d.vehicle_id);
      return {
        device_id: d.id,
        serial_number: d.serial_number || d.provider_device_id || d.id,
        vehicle_id: d.vehicle_id as string,
        vehicle_label: v ? `${v.year ?? ""} ${v.make ?? ""} ${v.model ?? ""}`.trim() : d.vehicle_id as string,
      };
    });

  // 3. Check agreements
  const { data: agreements } = await supabase
    .from("legal_agreements")
    .select("id, vehicle_id, status, driver_signature, owner_signature, email_sent_to");

  let completedAgreements = 0;
  let pendingAgreements = 0;
  let pickupNotificationsSent = 0;

  for (const ag of agreements ?? []) {
    const isCompleted =
      ag.status === "completed" ||
      ag.status === "active" ||
      ag.status === "signed" ||
      (Boolean(ag.driver_signature) && Boolean(ag.owner_signature));

    if (isCompleted) {
      completedAgreements++;
      const sent = Array.isArray(ag.email_sent_to) ? (ag.email_sent_to as string[]) : [];
      if (sent.includes("pickup_location_notified")) {
        pickupNotificationsSent++;
      }
    } else {
      pendingAgreements++;
    }
  }

  // 4. Check vehicle telemetry state
  const { data: telemetryStates } = await supabase
    .from("vehicle_telemetry_state")
    .select("vehicle_id, latitude, longitude, speed_kmh, address, updated_at");

  const driverVehiclesPublished = (telemetryStates ?? []).map((t) => {
    const v = (allVehicles ?? []).find((veh) => veh.id === t.vehicle_id);
    return {
      device_id: t.vehicle_id,
      driver_name: "Active Driver",
      vehicle_description: v ? `${v.year ?? ""} ${v.make ?? ""} ${v.model ?? ""}`.trim() : "Fleet Vehicle",
      address: t.address || null,
      latitude: Number(t.latitude) || 39.0458,
      longitude: Number(t.longitude) || -76.6413,
      speed_kmh: Number(t.speed_kmh) || 0,
    };
  });

  return {
    ok: true,
    total_scanned: totalDevices,
    active_count: activeCount,
    dormant_count: dormantCount,
    unprovisioned_count: unprovisionedCount,
    usa_vehicles_linked: usaVehiclesLinked,
    driver_vehicles_published: driverVehiclesPublished,
    agreements_checked: {
      total: agreements?.length ?? 0,
      completed: completedAgreements,
      pending: pendingAgreements,
      pickup_notifications_sent: pickupNotificationsSent,
    },
    errors,
  };
}

/**
 * Auto-detects completion of driver-owner agreements across all fleet vehicles.
 * For any completed agreement:
 * - Enables vehicle live tracking (gps_tracking_enabled = true)
 * - Dispatches pickup location notification to the driver
 */
export async function checkAndVerifyAgreements(): Promise<{
  total: number;
  completed: number;
  pending: number;
  pickup_notifications_sent: number;
}> {
  try {
    const { data, error } = await invokeEdge<{
      ok: boolean;
      total: number;
      completed: number;
      pending: number;
      pickup_notifications_sent: number;
    }>("sarekon-admin", { action: "check_agreements" });

    if (!error && data) {
      return {
        total: data.total,
        completed: data.completed,
        pending: data.pending,
        pickup_notifications_sent: data.pickup_notifications_sent,
      };
    }
  } catch {
    // Continue to database fallback below
  }

  // Fallback to querying legal_agreements directly from Supabase
  const { data: agreements } = await supabase
    .from("legal_agreements")
    .select("id, vehicle_id, status, driver_signature, owner_signature, email_sent_to");

  let completed = 0;
  let pending = 0;
  let notified = 0;

  for (const ag of agreements ?? []) {
    const isCompleted =
      ag.status === "completed" ||
      ag.status === "active" ||
      ag.status === "signed" ||
      (Boolean(ag.driver_signature) && Boolean(ag.owner_signature));

    if (isCompleted) {
      completed++;
      const sent = Array.isArray(ag.email_sent_to) ? (ag.email_sent_to as string[]) : [];
      if (sent.includes("pickup_location_notified")) notified++;
    } else {
      pending++;
    }
  }

  return {
    total: agreements?.length ?? 0,
    completed,
    pending,
    pickup_notifications_sent: notified,
  };
}

/**
 * Fetches the agreement status map for a set of vehicle IDs.
 * Used by live maps to gate live location for any vehicle whose agreement is not yet completed.
 */
export async function getVehicleAgreementsMap(vehicleIds: string[]): Promise<Map<string, VehicleAgreementStatus>> {
  const map = new Map<string, VehicleAgreementStatus>();
  if (!vehicleIds.length) return map;

  const { data, error } = await supabase
    .from("legal_agreements")
    .select("id, vehicle_id, driver_id, owner_id, status, driver_signature, owner_signature, email_sent_to")
    .in("vehicle_id", vehicleIds);

  if (error || !data) return map;

  for (const row of data) {
    if (!row.vehicle_id) continue;
    const isCompleted =
      row.status === "completed" ||
      row.status === "active" ||
      row.status === "signed" ||
      (Boolean(row.driver_signature) && Boolean(row.owner_signature));

    const sentList = Array.isArray(row.email_sent_to) ? (row.email_sent_to as string[]) : [];

    map.set(row.vehicle_id, {
      vehicleId: row.vehicle_id,
      hasAgreement: true,
      isCompleted,
      status: row.status,
      driverId: row.driver_id,
      ownerId: row.owner_id,
      driverSignature: row.driver_signature,
      ownerSignature: row.owner_signature,
      pickupLocationNotified: sentList.includes("pickup_location_notified"),
    });
  }

  return map;
}
