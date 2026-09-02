// Server-side Resident Orchestrator core.
// Pure, dependency-free processing of vehicle telemetry events into
// canonical vehicle state + analytics events. Shared by the ingestion
// endpoint (telemetry-ingest) and the scheduled MQTT worker.

export interface VehicleEvent {
  vehicleId: string;
  source: "traccar" | "mqtt" | "manual";
  eventType: string;
  timestamp: string;
  topic?: string | null;
  payload: Record<string, unknown>;
}

export interface VehicleState {
  vehicle_id: string;
  latitude?: number | null;
  longitude?: number | null;
  speed?: number | null;
  ignition?: boolean | null;
  battery?: number | null;
  fuel?: number | null;
  temperature?: number | null;
  last_source: string;
  last_event_type: string;
  last_event_at: string;
  payload: Record<string, unknown>;
}

export interface AnalyticsRow {
  vehicle_id: string;
  category: "driver_behavior" | "accident" | "maintenance" | "security";
  event_type: string;
  severity: "info" | "warning" | "critical";
  source: string;
  payload: Record<string, unknown>;
}

const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v)
    ? v
    : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))
    ? Number(v)
    : undefined;

const bool = (v: unknown): boolean | undefined =>
  typeof v === "boolean" ? v : v === "true" ? true : v === "false" ? false : undefined;

/** Merge an incoming event into the previous state (previous may be null). */
export function reduceState(prev: Partial<VehicleState> | null, event: VehicleEvent): VehicleState {
  const p = event.payload ?? {};
  const next: VehicleState = {
    vehicle_id: event.vehicleId,
    latitude: prev?.latitude ?? null,
    longitude: prev?.longitude ?? null,
    speed: prev?.speed ?? null,
    ignition: prev?.ignition ?? null,
    battery: prev?.battery ?? null,
    fuel: prev?.fuel ?? null,
    temperature: prev?.temperature ?? null,
    last_source: event.source,
    last_event_type: event.eventType,
    last_event_at: event.timestamp,
    payload: p,
  };

  const lat = num(p.latitude ?? p.lat);
  const lng = num(p.longitude ?? p.lng ?? p.lon);
  const speed = num(p.speed);
  const ignition = bool(p.ignition);
  const battery = num(p.battery ?? p.battery_level ?? p.batteryLevel);
  const fuel = num(p.fuel ?? p.fuel_level);
  const temperature = num(p.temperature ?? p.engine_temperature);

  if (lat !== undefined) next.latitude = lat;
  if (lng !== undefined) next.longitude = lng;
  if (speed !== undefined) next.speed = speed;
  if (ignition !== undefined) next.ignition = ignition;
  if (battery !== undefined) next.battery = battery;
  if (fuel !== undefined) next.fuel = fuel;
  if (temperature !== undefined) next.temperature = temperature;

  return next;
}

/** Derive analytics events from the merged state. Mirrors the client rules. */
export function runAnalytics(state: VehicleState, event: VehicleEvent): AnalyticsRow[] {
  const rows: AnalyticsRow[] = [];
  const base = { vehicle_id: state.vehicle_id, source: event.source };

  if (typeof state.speed === "number" && state.speed > 120) {
    rows.push({
      ...base,
      category: "driver_behavior",
      event_type: "speed_violation",
      severity: "warning",
      payload: { speed: state.speed },
    });
  }

  if (typeof state.temperature === "number" && state.temperature > 100) {
    rows.push({
      ...base,
      category: "maintenance",
      event_type: "engine_temperature",
      severity: "critical",
      payload: { temperature: state.temperature },
    });
  }

  if (typeof state.battery === "number" && state.battery < 15) {
    rows.push({
      ...base,
      category: "maintenance",
      event_type: "low_battery",
      severity: "warning",
      payload: { battery: state.battery },
    });
  }

  const impact = num((event.payload ?? {}).impact ?? (event.payload ?? {}).g_force);
  if (typeof impact === "number" && impact >= 3) {
    rows.push({
      ...base,
      category: "accident",
      event_type: "impact_detected",
      severity: "critical",
      payload: { impact },
    });
  }

  return rows;
}

/** Normalise an inbound record (MQTT topic or Traccar position) into an event. */
export function normalizeEvent(input: Record<string, unknown>): VehicleEvent | null {
  const topic = typeof input.topic === "string" ? input.topic : null;
  const payload = (input.payload && typeof input.payload === "object"
    ? input.payload
    : input) as Record<string, unknown>;

  let vehicleId =
    (typeof input.vehicleId === "string" && input.vehicleId) ||
    (typeof input.vehicle_id === "string" && input.vehicle_id) ||
    (typeof payload.vehicleId === "string" && (payload.vehicleId as string)) ||
    (typeof payload.vehicle_id === "string" && (payload.vehicle_id as string)) ||
    "";

  if (!vehicleId && topic) {
    const parts = topic.split("/");
    if (parts[0] === "rentmaikar" && parts[1] === "vehicle" && parts[2]) vehicleId = parts[2];
  }
  if (!vehicleId && payload.deviceId) vehicleId = String(payload.deviceId);
  if (!vehicleId) return null;

  const source = (input.source === "traccar" || input.source === "mqtt" || input.source === "manual")
    ? input.source
    : topic
    ? "mqtt"
    : "traccar";

  const eventType =
    (typeof input.eventType === "string" && input.eventType) ||
    (topic ? topic.split("/")[3] ?? "telemetry" : String(payload.type ?? "position"));

  const timestamp =
    (typeof input.timestamp === "string" && input.timestamp) ||
    (typeof payload.fixTime === "string" && (payload.fixTime as string)) ||
    (typeof payload.serverTime === "string" && (payload.serverTime as string)) ||
    new Date().toISOString();

  return { vehicleId, source: source as VehicleEvent["source"], eventType, timestamp, topic, payload };
}
