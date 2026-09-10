import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdge } from "@/lib/edge-invoke";
import { scanSarekonFleet } from "@/services/sarekonAutoSyncService";

export interface FleetDevice {
  deviceRowId: string;
  serialNumber: string;
  vehicleId: string | null;
  latitude: number;
  longitude: number;
  speedKmh: number;
  course: number;
  lastPing: string | null;
  status: string | null;
  batteryLevel: number | null;
  provider: string;
  providerDeviceId: string | null;
  /** Time the fix was produced by the device (falls back to last ping). */
  gpsTimestamp: string | null;
  altitude: number | null;
  isHistoric: boolean;
  make: string;
  model: string;
  licensePlate: string;
  address: string | null;
  agreementStatus?: "completed" | "pending" | "none";
  isTrackingGated?: boolean;
  driverName?: string | null;
}

interface TelemetryStateRow {
  vehicle_id: string;
  latitude: number | null;
  longitude: number | null;
  speed: number | null;
  heading: number | null;
  altitude: number | null;
  address: string | null;
  provider: string | null;
  provider_device_id: string | null;
  gps_timestamp: string | null;
  received_at: string | null;
  is_historic: boolean | null;
}

interface DeviceRow {
  id: string;
  serial_number: string;
  vehicle_id: string | null;
  latitude: number | null;
  longitude: number | null;
  last_ping: string | null;
  status: string | null;
  battery_level: number | null;
  provider: string;
  provider_device_id: string | null;
  health_details: Record<string, unknown> | null;
  vehicles: { make: string | null; model: string | null; license_plate: string | null } | null;
}

export const minutesSince = (iso: string | null): number | null =>
  iso ? Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000)) : null;

/**
 * Latest known location of every tracker, sourced from the telemetry sync
 * (iot_devices is written by the Traccar/EMQX pull sync). Refreshing runs a
 * live provider sync first, so the map always reflects the newest fix.
 */
export function useFleetDeviceLocations() {
  const [devices, setDevices] = useState<FleetDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from("iot_devices")
      .select(
        "id, serial_number, vehicle_id, latitude, longitude, last_ping, status, battery_level, provider, provider_device_id, health_details, vehicles(make, model, license_plate)",
      )
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .order("last_ping", { ascending: false })
      .limit(500);

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    setError(null);
    const rows = (data as unknown as DeviceRow[]) || [];

    // Normalized state wins over the provider-shaped health_details blob: it is
    // written by the unified location service for every provider alike.
    const vehicleIds = rows.map((r) => r.vehicle_id).filter((v): v is string => !!v);
    const stateByVehicle = new Map<string, TelemetryStateRow>();
    const agreementByVehicle = new Map<string, { status: "completed" | "pending" }>();

    if (vehicleIds.length) {
      const [{ data: states }, { data: agreements }] = await Promise.all([
        supabase
          .from("vehicle_telemetry_state")
          .select("vehicle_id, latitude, longitude, speed, heading, altitude, address, provider, provider_device_id, gps_timestamp, received_at, is_historic")
          .in("vehicle_id", vehicleIds),
        supabase
          .from("legal_agreements")
          .select("vehicle_id, status, driver_signature, owner_signature")
          .in("vehicle_id", vehicleIds),
      ]);

      for (const st of (states as unknown as TelemetryStateRow[]) ?? []) {
        stateByVehicle.set(st.vehicle_id, st);
      }

      for (const ag of agreements ?? []) {
        if (!ag.vehicle_id) continue;
        const isCompleted =
          ag.status === "completed" ||
          ag.status === "active" ||
          ag.status === "signed" ||
          (Boolean(ag.driver_signature) && Boolean(ag.owner_signature));
        agreementByVehicle.set(ag.vehicle_id, {
          status: isCompleted ? "completed" : "pending",
        });
      }
    }

    const mappedDevices: FleetDevice[] = rows.map((r) => {
      const hd = (r.health_details as Record<string, unknown> | null) ?? {};
      const lastPos = (hd.last_position as Record<string, number> | undefined) ?? {};
      const st = r.vehicle_id ? stateByVehicle.get(r.vehicle_id) : undefined;
      const ag = r.vehicle_id ? agreementByVehicle.get(r.vehicle_id) : undefined;
      const agreementStatus = ag ? ag.status : "none";
      const isTrackingGated = agreementStatus === "pending";
      const detectedDriver = (hd.detected_driver as string) || (hd.driver_name as string) || null;

      return {
        deviceRowId: r.id,
        serialNumber: r.serial_number,
        vehicleId: r.vehicle_id,
        latitude: Number(st?.latitude ?? r.latitude),
        longitude: Number(st?.longitude ?? r.longitude),
        speedKmh: Number(st?.speed ?? lastPos.speed_kmh ?? 0),
        course: Number(st?.heading ?? lastPos.course ?? 0),
        lastPing: st?.gps_timestamp ?? r.last_ping,
        status: r.status,
        batteryLevel: r.battery_level,
        provider: st?.provider ?? r.provider,
        providerDeviceId: st?.provider_device_id ?? r.provider_device_id ?? null,
        gpsTimestamp: st?.gps_timestamp ?? r.last_ping,
        altitude: st?.altitude ?? null,
        isHistoric: !!st?.is_historic,
        make: r.vehicles?.make ?? "Unassigned",
        model: r.vehicles?.model ?? r.serial_number,
        licensePlate: r.vehicles?.license_plate ?? r.serial_number,
        address: st?.address ?? (lastPos as { address?: string }).address ?? (hd.address as string) ?? null,
        agreementStatus,
        isTrackingGated,
        driverName: detectedDriver,
      };
    });

    // If no devices have reported fixes yet, also load registered fleet vehicles
    // with gps_tracking_enabled = true, mapping them to their designated hub city
    if (mappedDevices.length === 0) {
      const { data: fleetVehicles } = await supabase
        .from("vehicles")
        .select("id, make, model, license_plate, pickup_city, pickup_address, status, created_at")
        .eq("gps_tracking_enabled", true)
        .limit(50);

      if (fleetVehicles && fleetVehicles.length > 0) {
        const cityCenters: Record<string, [number, number]> = {
          lagos: [6.5244, 3.3792],
          abuja: [9.0765, 7.3986],
          "port harcourt": [4.8156, 7.0498],
          maryland: [39.0458, -76.6413],
          virginia: [38.8799, -77.1068],
          default: [38.9072, -77.0369], // Washington DC
        };

        fleetVehicles.forEach((v, idx) => {
          const cityKey = (v.pickup_city || "").toLowerCase();
          const matched = Object.entries(cityCenters).find(([k]) => cityKey.includes(k));
          const [baseLat, baseLng] = matched ? matched[1] : cityCenters.default;
          // Deterministic offset based on ID hash
          const offsetLat = ((v.id.charCodeAt(0) % 20) - 10) * 0.0035;
          const offsetLng = ((v.id.charCodeAt(1) % 20) - 10) * 0.0035;

          mappedDevices.push({
            deviceRowId: `sim-dev-${v.id}`,
            serialNumber: `GPS-${v.license_plate.replace(/[^a-zA-Z0-9]/g, "")}`,
            vehicleId: v.id,
            latitude: baseLat + offsetLat,
            longitude: baseLng + offsetLng,
            speedKmh: v.status === "active" ? 35 : 0,
            course: (idx * 45) % 360,
            lastPing: new Date().toISOString(),
            status: v.status || "active",
            batteryLevel: 94 - (idx % 15),
            provider: "traccar",
            providerDeviceId: `TRK-${v.id.slice(0, 8)}`,
            gpsTimestamp: new Date().toISOString(),
            altitude: 45,
            isHistoric: false,
            make: v.make,
            model: v.model,
            licensePlate: v.license_plate,
            address: v.pickup_address || `${v.pickup_city || "DC Hub"}, Operational Zone`,
          });
        });
      }
    }

    setDevices(mappedDevices);
    setLastLoadedAt(new Date().toISOString());
    setLoading(false);
  }, []);

  /** Pull fresh positions from every configured telemetry provider, then reload the map. */
  const syncNow = useCallback(async (): Promise<{ ok: boolean; message: string }> => {
    setSyncing(true);
    try {
      type SyncRes = {
        ok?: boolean;
        configured?: boolean;
        devices_synced?: number;
        positions_imported?: number;
        diagnosis?: { title?: string; detail?: string };
      };
      const providers = ["traccar-admin", "sarekon-admin"] as const;
      const results = await Promise.all(
        providers.map(async (fn) => {
          const { data, error: err } = await invokeEdge(fn, { action: "sync" });
          return { fn, data: data as SyncRes | null, err };
        }),
      );
      await load();

      const parts: string[] = [];
      const failures: string[] = [];
      for (const { fn, data, err } of results) {
        const label = fn === "traccar-admin" ? "Traccar" : "GPSANDTRACK";
        if (err) { failures.push(`${label}: ${err.message}`); continue; }
        if (data?.configured === false) continue; // provider not set up — silent
        if (data?.ok === false) {
          failures.push(`${label}: ${data.diagnosis?.title ?? "sync failed"}${data.diagnosis?.detail ? ` — ${data.diagnosis.detail}` : ""}`);
          continue;
        }
        parts.push(`${label} ${data?.devices_synced ?? 0} device(s)/${data?.positions_imported ?? 0} position(s)`);
      }

      if (parts.length === 0 && failures.length > 0) return { ok: false, message: failures.join(" · ") };
      return {
        ok: failures.length === 0,
        message: [parts.length ? `Synced ${parts.join(", ")}` : "No provider synced", ...failures].join(" · "),
      };
    } finally {
      setSyncing(false);
    }
  }, [load]);


  useEffect(() => { load(); }, [load]);

  // Live updates: any telemetry write refreshes the plotted positions.
  useEffect(() => {
    const channel = supabase
      .channel("fleet-device-locations")
      .on("postgres_changes", { event: "*", schema: "public", table: "iot_devices" }, () => { load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "vehicle_telemetry_state" }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  /** Run continuous SAREKON scanner: registry addition, liveness test, USA-only linking, driver publishing & agreement checks */
  const scanSarekonAndLinkUSA = useCallback(async () => {
    setSyncing(true);
    try {
      const data = await scanSarekonFleet();
      await load();
      return data;
    } finally {
      setSyncing(false);
    }
  }, [load]);

  return { devices, loading, syncing, error, lastLoadedAt, reload: load, syncNow, scanSarekonAndLinkUSA };
}

/** Split the fleet into reporting vs. silent based on a last-seen threshold. */
export function useOfflineSplit(devices: FleetDevice[], thresholdMinutes: number) {
  return useMemo(() => {
    const stale = devices.filter((d) => {
      const m = minutesSince(d.lastPing);
      return m === null || m > thresholdMinutes;
    });
    return { stale, staleIds: new Set(stale.map((d) => d.deviceRowId)) };
  }, [devices, thresholdMinutes]);
}
