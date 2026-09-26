import { supabase } from "@/integrations/supabase/client";

/**
 * Explicit device telemetry and liveness states.
 * Prohibits treating stale "last known GPS position" as active proof of liveness.
 */
export type DeviceLivenessState =
  | "ACTIVE"
  | "STALE"
  | "DORMANT"
  | "UNPROVISIONED"
  | "UNREACHABLE"
  | "ERROR";

export interface DeviceLivenessEvaluation {
  state: DeviceLivenessState;
  ageMinutes: number | null;
  isLive: boolean;
  reason: string;
}

/**
 * Rigorously evaluates device liveness based on timestamp age and hardware telemetry evidence.
 */
export function evaluateDeviceLiveness(device: {
  last_ping?: string | Date | null;
  status?: string | null;
  is_linked?: boolean | null;
  vehicle_id?: string | null;
  has_error?: boolean | null;
}): DeviceLivenessEvaluation {
  if (device.has_error || device.status === "error") {
    return {
      state: "ERROR",
      ageMinutes: null,
      isLive: false,
      reason: "Device reported hardware or communication error",
    };
  }

  if (!device.is_linked || !device.vehicle_id) {
    return {
      state: "UNPROVISIONED",
      ageMinutes: null,
      isLive: false,
      reason: "Device is unprovisioned or unassigned to an active vehicle",
    };
  }

  if (!device.last_ping) {
    return {
      state: "UNREACHABLE",
      ageMinutes: null,
      isLive: false,
      reason: "Device has never recorded a valid ping timestamp",
    };
  }

  const pingTime = new Date(device.last_ping).getTime();
  if (isNaN(pingTime)) {
    return {
      state: "ERROR",
      ageMinutes: null,
      isLive: false,
      reason: "Device ping timestamp is malformed",
    };
  }

  const ageMinutes = Math.floor((Date.now() - pingTime) / 60000);

  if (ageMinutes <= 30) {
    return {
      state: "ACTIVE",
      ageMinutes: Math.max(0, ageMinutes),
      isLive: true,
      reason: `Active telemetry confirmed ${Math.max(0, ageMinutes)}m ago`,
    };
  }

  if (ageMinutes <= 180) {
    return {
      state: "STALE",
      ageMinutes,
      isLive: false,
      reason: `Telemetry delayed/stale: silent for ${ageMinutes}m`,
    };
  }

  if (ageMinutes <= 1440 * 7) {
    return {
      state: "DORMANT",
      ageMinutes,
      isLive: false,
      reason: `Device dormant: no telemetry for ${Math.floor(ageMinutes / 60)} hours`,
    };
  }

  return {
    state: "UNREACHABLE",
    ageMinutes,
    isLive: false,
    reason: `Device unreachable: silent for over 7 days`,
  };
}

export interface LivenessCategoryStats {
  total: number;
  active: number;
  inactive: number;
}

export interface LivenessTestResult {
  success: boolean;
  timestamp: string;
  audit_id: string;
  sims: LivenessCategoryStats;
  devices: LivenessCategoryStats;
  vehicles: LivenessCategoryStats;
}

export interface SimAutoEnableRecord {
  device_id: string;
  sim_id: string;
  device_serial: string;
  iccid: string;
  provider: string;
}

export interface SimAutoEnableResult {
  success: boolean;
  enabled_count: number;
  timestamp: string;
  records: SimAutoEnableRecord[];
}

export interface VehicleProvisionRecord {
  vehicle_id: string;
  make: string;
  model: string;
  license_plate: string;
  pickup_location: string;
  status: string;
  is_public: boolean;
}

export interface VehicleProvisionResult {
  success: boolean;
  devices_provisioned: number;
  vehicles_published: number;
  timestamp: string;
  records: VehicleProvisionRecord[];
}

export interface FullIoTOrchestrationResult {
  success: boolean;
  timestamp: string;
  sim_auto_enable: SimAutoEnableResult;
  liveness_test: LivenessTestResult;
  vehicle_provision_and_publish: VehicleProvisionResult;
}

export interface IoTAuditLogRecord {
  id: string;
  action: string;
  performed_by: string | null;
  device_id: string | null;
  sim_id: string | null;
  vehicle_id: string | null;
  details: Record<string, any>;
  created_at: string;
}

/**
 * Executes a real-time liveness test across all SIM cards, SIM-enabled devices,
 * and device-provisioned vehicles, updating their status to active or inactive.
 */
export async function runIoTLivenessTest(): Promise<LivenessTestResult> {
  const { data, error } = await supabase.rpc("run_iot_liveness_test" as any);
  if (error) {
    console.error("Failed to run IoT liveness test:", error);
    throw error;
  }
  return data as LivenessTestResult;
}

/**
 * Auto-enables all available tracking devices from available SIM inventory,
 * pairs them, activates telemetry, and logs audit events.
 */
export async function autoEnableSims(): Promise<SimAutoEnableResult> {
  const { data, error } = await supabase.rpc("auto_enable_sims" as any);
  if (error) {
    console.error("Failed to auto-enable SIMs:", error);
    throw error;
  }
  return data as SimAutoEnableResult;
}

/**
 * Auto-enables active IoT tracking devices for vehicles that have proper pickup locations,
 * validates operational readiness, and automatically publishes the vehicles to the public catalogue.
 */
export async function autoEnableVehiclesAndPublish(): Promise<VehicleProvisionResult> {
  const { data, error } = await supabase.rpc("auto_enable_vehicles_and_catalogue_publish" as any);
  if (error) {
    console.error("Failed to auto-enable vehicles and publish to catalogue:", error);
    throw error;
  }
  return data as VehicleProvisionResult;
}

/**
 * Runs the unified end-to-end orchestration pipeline:
 * 1. Auto-enables SIMs for available devices
 * 2. Runs real-time liveness test across SIMs, devices, and vehicles
 * 3. Auto-enables devices for vehicles with proper pickup locations and publishes to public catalogue
 */
export async function runFullIoTOrchestration(): Promise<FullIoTOrchestrationResult> {
  const { data, error } = await supabase.rpc("run_full_iot_orchestration" as any);
  if (error) {
    console.error("Failed to execute full IoT orchestration:", error);
    throw error;
  }
  return data as FullIoTOrchestrationResult;
}

/**
 * Fetches recent records from iot_audit_log for display on the admin dashboard.
 */
export async function fetchIoTAuditLogs(limit = 30): Promise<IoTAuditLogRecord[]> {
  const { data, error } = await supabase
    .from("iot_audit_log" as any)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Failed to fetch IoT audit logs:", error);
    return [];
  }
  return (data || []) as IoTAuditLogRecord[];
}

/**
 * Subscribes to real-time additions to iot_audit_log.
 */
export function subscribeToIoTAuditLog(onInsert: (record: IoTAuditLogRecord) => void) {
  const channelId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now().toString(36);
  const channel = supabase
    .channel("iot_audit_log_realtime_" + channelId)
    .on(
      "postgres_changes" as any,
      {
        event: "INSERT",
        schema: "public",
        table: "iot_audit_log",
      },
      (payload: any) => {
        if (payload.new) {
          onInsert(payload.new as IoTAuditLogRecord);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
