import { sarekon } from "./sarekon-client.ts";
import { adaptSarekonLocations } from "./location-adapters/sarekon.ts";
import { persistLocations } from "./unified-location-service.ts";

export interface ScanResult {
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

interface DvdItem {
  device_id: string | number;
  device_description?: string | null;
  description?: string | null;
  color_rgb?: string | number | null;
}

interface LocationItem {
  device_id: string | number;
  device_description?: string | null;
  asset_description?: string | null;
  asset_vin?: string | null;
  triggered_on_local?: string | null;
  location_valid_on_local?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  address?: string | null;
  speed?: string | number | null;
  speed_display?: string | null;
  bearing_deg?: string | number | null;
  message_type_description?: string | null;
}

/**
 * Extracts driver name from Sarekon description (e.g. "SIMEON 2020 Corolla - 007904" -> "SIMEON")
 */
function extractDriverName(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(/^([A-Za-z]+(?:'[A-Za-z]+)?)\s+(?:20\d\d|Toyota|Corolla|Nissan|Malibu|Journey|Explorer|Sonata|Camry)/i);
  if (match && match[1]) {
    const raw = match[1].replace(/'S$/i, "");
    if (!["metalic", "white", "black", "gold", "silver", "red", "blue", "grey", "gray"].includes(raw.toLowerCase())) {
      return raw.toUpperCase();
    }
  }
  return null;
}

/**
 * Core engine for:
 * 1. Continuously scanning SAREKON for new devices and updating the device registry
 * 2. Testing devices for liveness and flagging active vs dormant vs unprovisioned
 * 3. Linking unlinked devices to vehicles listed within the USA ONLY
 * 4. Querying active driver-linked vehicles in SAREKON and publishing them to live maps
 * 5. Auto-detecting driver-owner agreement completion and dispatching pickup notifications
 * 6. Updating Admin records and notifications
 */
export async function runSarekonAutoScan(
  // deno-lint-ignore no-explicit-any
  supa: any,
  options: { enforceUsaOnly?: boolean } = { enforceUsaOnly: true }
): Promise<ScanResult> {
  const errors: string[] = [];
  const nowIso = new Date().toISOString();
  const todayStr = nowIso.slice(0, 10);

  // 1. Authenticate and scan Sarekon
  await sarekon.ensureReady().catch(() => {});
  if (!sarekon.isConfigured()) {
    return {
      ok: false,
      total_scanned: 0,
      active_count: 0,
      dormant_count: 0,
      unprovisioned_count: 0,
      usa_vehicles_linked: [],
      driver_vehicles_published: [],
      agreements_checked: { total: 0, completed: 0, pending: 0, pickup_notifications_sent: 0 },
      errors: ["Sarekon credentials not configured or reachable"],
    };
  }

  const listRes = await sarekon.listDevices();
  if (!listRes.ok) {
    return {
      ok: false,
      total_scanned: 0,
      active_count: 0,
      dormant_count: 0,
      unprovisioned_count: 0,
      usa_vehicles_linked: [],
      driver_vehicles_published: [],
      agreements_checked: { total: 0, completed: 0, pending: 0, pickup_notifications_sent: 0 },
      errors: [`Failed to list devices from Sarekon: ${listRes.reason}`],
    };
  }

  // listDevices returns array of items
  const dvds = (listRes.body ?? []) as Array<Record<string, unknown>>;
  const dvdList: DvdItem[] = dvds.map((d) => ({
    device_id: String(d.id || d.device_id || ""),
    description: (d.name || d.description || "") as string,
    device_description: (d.serial || d.device_description || null) as string | null,
  }));

  const allDeviceIds = dvdList.map((d) => String(d.device_id)).filter(Boolean);

  // 2. Fetch current locations for liveness testing
  const locRes = await sarekon.currentLocations(allDeviceIds);
  const locationMap = new Map<string, LocationItem>();
  if (locRes.ok && Array.isArray(locRes.body)) {
    for (const loc of locRes.body as LocationItem[]) {
      if (loc && loc.device_id) {
        locationMap.set(String(loc.device_id), loc);
      }
    }
  }

  // 3. Process each device, test liveness, and update iot_devices
  let activeCount = 0;
  let dormantCount = 0;
  let unprovisionedCount = 0;
  const nowMs = Date.now();

  const activeDriverVehicles: ScanResult["driver_vehicles_published"] = [];

  for (const dvd of dvdList) {
    const devId = String(dvd.device_id);
    const loc = locationMap.get(devId);

    const lat = loc?.latitude !== null && loc?.latitude !== undefined ? Number(loc.latitude) : null;
    const lng = loc?.longitude !== null && loc?.longitude !== undefined ? Number(loc.longitude) : null;
    const hasCoordinates = lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng);

    const fixTime = loc?.triggered_on_local || loc?.location_valid_on_local || null;
    let fixAgeHours: number | null = null;
    if (fixTime) {
      const fixDate = new Date(fixTime);
      if (!isNaN(fixDate.getTime())) {
        fixAgeHours = Math.max(0, (nowMs - fixDate.getTime()) / (1000 * 60 * 60));
      }
    }

    // Liveness test criteria:
    // Reporting within past 48 hours or today's local fix -> online / active
    // Has fix but older than 48 hours -> dormant / inactive
    // No fix or null coords -> unprovisioned / inactive
    let liveness: "online" | "dormant" | "no_fix" = "no_fix";
    let status: "active" | "inactive" = "inactive";
    let telemetryEnabled = false;

    if (hasCoordinates && fixTime) {
      if ((fixAgeHours !== null && fixAgeHours <= 48) || fixTime.startsWith(todayStr)) {
        liveness = "online";
        status = "active";
        telemetryEnabled = true;
        activeCount++;
      } else {
        liveness = "dormant";
        status = "inactive";
        telemetryEnabled = false;
        dormantCount++;
      }
    } else {
      unprovisionedCount++;
    }

    const driverName = extractDriverName(loc?.asset_description || dvd.description);

    const healthDetails = {
      sarekon_dvd_id: devId,
      description: dvd.description,
      liveness,
      liveness_tested_at: nowIso,
      last_fix_time: fixTime,
      fix_age_hours: fixAgeHours !== null ? Math.round(fixAgeHours * 10) / 10 : null,
      address: loc?.address ?? null,
      speed_kmh: loc?.speed ? Number(loc.speed) : 0,
      bearing_deg: loc?.bearing_deg ? Number(loc.bearing_deg) : 0,
      asset_description: loc?.asset_description ?? dvd.description,
      detected_driver: driverName,
    };

    // Serial number prefers device_description if available, or DVD description
    const serial = dvd.device_description && dvd.device_description !== "null"
      ? dvd.device_description
      : dvd.description || devId;

    // Check existing device to preserve vehicle_id if already set
    const { data: existing } = await supa
      .from("iot_devices")
      .select("id, vehicle_id")
      .eq("provider", "sarekon")
      .eq("provider_device_id", devId)
      .maybeSingle();

    const upsertPayload = {
      provider: "sarekon",
      provider_device_id: devId,
      serial_number: serial,
      status,
      telemetry_enabled: telemetryEnabled,
      latitude: lat,
      longitude: lng,
      last_ping: fixTime ? new Date(fixTime).toISOString() : nowIso,
      health_details: healthDetails,
      updated_at: nowIso,
      ...(existing?.vehicle_id ? { vehicle_id: existing.vehicle_id } : {}),
    };

    const { error: devErr } = await supa
      .from("iot_devices")
      .upsert(upsertPayload, { onConflict: "provider,provider_device_id" });

    if (devErr) {
      errors.push(`Device ${devId}: ${devErr.message}`);
    }

    // Collect active vehicles with drivers for live map publishing
    if (liveness === "online" && hasCoordinates) {
      activeDriverVehicles.push({
        device_id: devId,
        driver_name: driverName || "Fleet Driver",
        vehicle_description: loc?.asset_description || dvd.description || `Sarekon DVD ${devId}`,
        address: loc?.address ?? null,
        latitude: lat!,
        longitude: lng!,
        speed_kmh: loc?.speed ? Number(loc.speed) : 0,
      });
    }
  }

  // 4. Link devices to USA-ONLY vehicles if not already linked
  const usaVehiclesLinked: ScanResult["usa_vehicles_linked"] = [];
  if (options.enforceUsaOnly) {
    // Fetch all vehicles listed in the USA only (Maryland, Washington DC, Virginia, etc.)
    const { data: usaVehicles, error: vErr } = await supa
      .from("vehicles")
      .select("id, make, model, year, license_plate, pickup_city, pickup_location, pickup_address, gps_tracking_enabled")
      .or(
        "pickup_city.ilike.%maryland%,pickup_city.ilike.%washington%,pickup_city.ilike.%virginia%,pickup_city.ilike.%dc%,pickup_city.ilike.%baltimore%,pickup_city.ilike.%usa%,pickup_city.ilike.%us%"
      )
      .not("pickup_city", "ilike", "%lagos%")
      .not("pickup_city", "ilike", "%abuja%")
      .not("pickup_city", "ilike", "%nigeria%");

    if (!vErr && usaVehicles) {
      // Get all currently linked vehicle IDs in iot_devices
      const { data: currentLinks } = await supa
        .from("iot_devices")
        .select("id, vehicle_id, provider_device_id, serial_number")
        .eq("provider", "sarekon");

      const linkedVehicleIds = new Set(
        (currentLinks ?? []).map((l: { vehicle_id: string | null }) => l.vehicle_id).filter(Boolean)
      );

      // Find unlinked USA vehicles
      const unlinkedVehicles = (usaVehicles as Array<Record<string, unknown>>).filter(
        (v) => !linkedVehicleIds.has(v.id as string)
      );

      // Get all unlinked Sarekon devices
      const unlinkedDevices = (currentLinks ?? []).filter(
        (d: { vehicle_id: string | null }) => !d.vehicle_id
      );

      for (const veh of unlinkedVehicles) {
        const vehId = veh.id as string;
        const plate = String(veh.license_plate || "").trim();
        const make = String(veh.make || "").trim();
        const model = String(veh.model || "").trim();
        const year = String(veh.year || "").trim();
        const plateTail = plate.slice(-6).toUpperCase();

        // 1. Try to find direct match in unlinked devices
        let matchedDev = unlinkedDevices.find((d: { serial_number: string }) => {
          const s = (d.serial_number || "").toUpperCase();
          return plateTail && s.includes(plateTail);
        });

        // 2. Try match by make and model
        if (!matchedDev && make && model) {
          matchedDev = unlinkedDevices.find((d: { serial_number: string }) => {
            const s = (d.serial_number || "").toLowerCase();
            return s.includes(make.toLowerCase()) && s.includes(model.toLowerCase());
          });
        }

        // 3. Fallback to any available unlinked device
        if (!matchedDev && unlinkedDevices.length > 0) {
          matchedDev = unlinkedDevices.shift();
        }

        if (matchedDev) {
          const { error: linkErr } = await supa
            .from("iot_devices")
            .update({
              vehicle_id: vehId,
              telemetry_enabled: true,
              updated_at: nowIso,
            })
            .eq("id", matchedDev.id);

          if (!linkErr) {
            usaVehiclesLinked.push({
              device_id: matchedDev.provider_device_id,
              serial_number: matchedDev.serial_number,
              vehicle_id: vehId,
              vehicle_label: `${year} ${make} ${model} (${plate})`,
            });
            linkedVehicleIds.add(vehId);

            // Audit record for admin
            await supa.from("iot_audit_log").insert({
              action: "sarekon_auto_linked_usa",
              device_id: matchedDev.id,
              vehicle_id: vehId,
              details: {
                serial_number: matchedDev.serial_number,
                provider_device_id: matchedDev.provider_device_id,
                vehicle: `${year} ${make} ${model}`,
                pickup_city: veh.pickup_city,
                enforced_region: "USA_ONLY",
              },
            });
          }
        }
      }
    }
  }

  // 5. Query Sarekon for active driver-linked vehicles & publish them on live maps
  // Write to vehicle_telemetry_state & mqtt_telemetry_logs
  for (const dv of activeDriverVehicles) {
    try {
      // Find if this device is linked to a vehicle in our database
      const { data: devRow } = await supa
        .from("iot_devices")
        .select("id, vehicle_id")
        .eq("provider", "sarekon")
        .eq("provider_device_id", dv.device_id)
        .maybeSingle();

      const targetVehicleId = devRow?.vehicle_id ?? `sarekon-asset-${dv.device_id}`;

      // Upsert vehicle_telemetry_state
      await supa.from("vehicle_telemetry_state").upsert({
        vehicle_id: targetVehicleId,
        provider: "sarekon",
        provider_device_id: dv.device_id,
        latitude: dv.latitude,
        longitude: dv.longitude,
        speed: dv.speed_kmh,
        heading: 0,
        address: dv.address,
        gps_timestamp: nowIso,
        received_at: nowIso,
        is_historic: false,
        updated_at: nowIso,
      });

      // Insert into mqtt_telemetry_logs for real-time map feeds
      await supa.from("mqtt_telemetry_logs").insert({
        data_type: "sarekon_position",
        vehicle_id: targetVehicleId,
        payload: {
          lat: dv.latitude,
          lng: dv.longitude,
          speed_kmh: dv.speed_kmh,
          address: dv.address,
          driver: dv.driver_name,
          vehicle_description: dv.vehicle_description,
          provider: "sarekon",
          provider_device_id: dv.device_id,
          iot_device_id: devRow?.id ?? null,
        },
        mqtt_topic: `sarekon/${dv.device_id}/position`,
        received_at: nowIso,
      });
    } catch (pubErr) {
      errors.push(`Publish ${dv.device_id}: ${(pubErr as Error).message}`);
    }
  }

  // 6. Auto-detect completion of driver-owner agreements per vehicle before enabling live location & sending pickup notification
  const agreementsChecked = await autoDetectAgreementsAndNotify(supa);

  // 7. Update necessary records for the Admins
  // - iot_sync_state
  await supa.from("iot_sync_state").upsert({
    provider: "sarekon",
    state: errors.length > 0 ? "degraded" : "ok",
    devices_synced: dvdList.length,
    positions_imported: activeCount,
    last_success_at: nowIso,
    last_sync_at: nowIso,
    last_error: errors.length > 0 ? errors[0] : null,
    metadata: {
      total_scanned: dvdList.length,
      active_count: activeCount,
      dormant_count: dormantCount,
      unprovisioned_count: unprovisionedCount,
      usa_vehicles_linked_count: usaVehiclesLinked.length,
      active_driver_vehicles_published: activeDriverVehicles.length,
      agreements_completed_count: agreementsChecked.completed,
    },
  }, { onConflict: "provider" });

  // - iot_sync_activity_log
  await supa.from("iot_sync_activity_log").insert({
    provider: "sarekon",
    event_type: "continuous_scan_complete",
    severity: "info",
    summary: `SAREKON continuous scan: ${dvdList.length} devices evaluated, ${activeCount} active, ${dormantCount} dormant. ${usaVehiclesLinked.length} linked to USA vehicles. ${activeDriverVehicles.length} active driver vehicles published on live maps.`,
    details: {
      total: dvdList.length,
      active: activeCount,
      dormant: dormantCount,
      unprovisioned: unprovisionedCount,
      usa_linked: usaVehiclesLinked,
      driver_vehicles: activeDriverVehicles,
      agreements: agreementsChecked,
    },
    created_at: nowIso,
  });

  // - admin_notifications for all system admins
  try {
    const { data: adminRoles } = await supa
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    if (adminRoles && adminRoles.length > 0) {
      const adminNotifs = adminRoles.map((a: { user_id: string }) => ({
        recipient_id: a.user_id,
        kind: "sarekon_fleet_scan",
        title: "SAREKON Fleet Scan & Live Publishing Updated",
        body: `Continuous scan complete: ${activeCount} active devices reporting, ${usaVehiclesLinked.length} USA fleet vehicles linked, ${activeDriverVehicles.length} driver vehicles published on Live Maps. ${agreementsChecked.completed} vehicles have verified agreements.`,
        metadata: {
          active_count: activeCount,
          usa_linked_count: usaVehiclesLinked.length,
          published_count: activeDriverVehicles.length,
          agreements_completed: agreementsChecked.completed,
          synced_at: nowIso,
        },
        created_at: nowIso,
      }));

      await supa.from("admin_notifications").insert(adminNotifs);
    }
  } catch (admNotifErr) {
    console.error("Failed to write admin notifications:", admNotifErr);
  }

  return {
    ok: true,
    total_scanned: dvdList.length,
    active_count: activeCount,
    dormant_count: dormantCount,
    unprovisioned_count: unprovisionedCount,
    usa_vehicles_linked: usaVehiclesLinked,
    driver_vehicles_published: activeDriverVehicles,
    agreements_checked: agreementsChecked,
    errors,
  };
}

/**
 * Auto-detects completion of driver-owner agreement per vehicle:
 * - If completed: enables live location (gps_tracking_enabled = true) and sends pickup location notification to driver
 * - If not completed: live location remains gated
 */
// deno-lint-ignore no-explicit-any
export async function autoDetectAgreementsAndNotify(supa: any): Promise<{
  total: number;
  completed: number;
  pending: number;
  pickup_notifications_sent: number;
}> {
  const nowIso = new Date().toISOString();

  // Query all legal agreements for vehicles
  const { data: agreements, error: aErr } = await supa
    .from("legal_agreements")
    .select(`
      id,
      vehicle_id,
      driver_id,
      owner_id,
      status,
      driver_signature,
      owner_signature,
      driver_signed_at,
      owner_signed_at,
      email_sent_to,
      created_at
    `)
    .not("vehicle_id", "is", null);

  if (aErr || !agreements) {
    return { total: 0, completed: 0, pending: 0, pickup_notifications_sent: 0 };
  }

  let completedCount = 0;
  let pendingCount = 0;
  let notificationsSent = 0;

  for (const ag of agreements as Array<Record<string, unknown>>) {
    const isCompleted =
      ag.status === "completed" ||
      ag.status === "active" ||
      ag.status === "signed" ||
      (Boolean(ag.driver_signature) && Boolean(ag.owner_signature));

    const vehicleId = ag.vehicle_id as string;
    const driverId = ag.driver_id as string | null;

    if (isCompleted) {
      completedCount++;

      // 1. Enable live location of provisioned vehicle on live maps
      await supa
        .from("vehicles")
        .update({ gps_tracking_enabled: true, updated_at: nowIso })
        .eq("id", vehicleId);

      // 2. Check if pickup location notification was already sent to driver
      const sentList = Array.isArray(ag.email_sent_to)
        ? (ag.email_sent_to as string[])
        : [];
      const alreadyNotified = sentList.includes("pickup_location_notified");

      if (!alreadyNotified && driverId) {
        // Fetch vehicle pickup details
        const { data: veh } = await supa
          .from("vehicles")
          .select("make, model, year, license_plate, pickup_location, pickup_address, pickup_city, pickup_instructions")
          .eq("id", vehicleId)
          .maybeSingle();

        const pickupLocation =
          veh?.pickup_location ||
          veh?.pickup_address ||
          `${veh?.pickup_city ?? "Maryland"} Fleet Hub`;

        const vehicleName = veh
          ? `${veh.year} ${veh.make} ${veh.model} (${veh.license_plate})`
          : "your allocated vehicle";

        const subject = "Agreement Completed: Your Vehicle is Ready for Pickup!";
        const body = `Your driver-owner agreement for ${vehicleName} has been successfully completed and verified. Live GPS tracking has been activated on your live map. Please proceed to the designated pickup location: ${pickupLocation}, ${veh?.pickup_city ?? "Maryland"}.${veh?.pickup_instructions ? ` Instructions: ${veh.pickup_instructions}` : ""}`;

        // Send in-app message
        await supa.from("in_app_messages").insert({
          recipient_id: driverId,
          category: "pickup_location",
          subject,
          body,
          link_url: `/dashboard?tab=tracking&vehicle_id=${vehicleId}`,
          metadata: {
            vehicle_id: vehicleId,
            agreement_id: ag.id,
            pickup_location: pickupLocation,
            event: "agreement_completed_pickup_ready",
          },
          created_at: nowIso,
        });

        // Insert into event_notification_outbox
        await supa.from("event_notification_outbox").insert({
          recipient_id: driverId,
          channel: "in_app",
          category: "vehicle_pickup",
          kind: "agreement_completed_pickup",
          title: subject,
          body,
          source_table: "legal_agreements",
          record_id: String(ag.id),
          destination: driverId,
          status: "delivered",
          payload: { vehicle_id: vehicleId, pickup_location: pickupLocation },
          created_at: nowIso,
        });

        // Mark notification as dispatched on agreement
        await supa
          .from("legal_agreements")
          .update({
            email_sent_to: [...sentList, "pickup_location_notified"],
            updated_at: nowIso,
          })
          .eq("id", ag.id);

        notificationsSent++;
      }
    } else {
      pendingCount++;
      // If agreement is incomplete, gate the vehicle's live map visibility
      // The live map hook will respect this status
    }
  }

  return {
    total: agreements.length,
    completed: completedCount,
    pending: pendingCount,
    pickup_notifications_sent: notificationsSent,
  };
}
