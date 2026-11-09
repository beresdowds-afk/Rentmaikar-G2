import { createHash } from "node:crypto";
import type { TelemetryAnomalySeverity } from "./telemetryAnomalyDetection";

export interface TelemetryAnomalyWriter {
  query(
    sql: string,
    params: unknown[],
  ): Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }>;
}

export async function persistTelemetryAnomaly(
  writer: TelemetryAnomalyWriter,
  params: {
    vehicleId?: string | null;
    deviceId?: string | null;
    provider?: string | null;
    anomalyType: string;
    severity: TelemetryAnomalySeverity;
    details: Record<string, unknown>;
  },
): Promise<void> {
  const entityId = params.vehicleId || params.deviceId || "unknown";
  const dedupeKey = createHash("md5")
    .update(`${entityId}:${params.anomalyType}`)
    .digest("hex");

  try {
    const result = await writer.query(
      `INSERT INTO public.telemetry_anomalies (
         vehicle_id, device_id, provider, anomaly_type, severity, details,
         dedupe_key, active_dedupe_key, occurrence_count, last_seen_at, status, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7, 1, now(), 'open', now())
       ON CONFLICT (active_dedupe_key) WHERE active_dedupe_key IS NOT NULL
       DO UPDATE SET
         severity = CASE
           WHEN EXCLUDED.severity = 'critical' OR telemetry_anomalies.severity = 'critical' THEN 'critical'
           WHEN EXCLUDED.severity = 'warning' OR telemetry_anomalies.severity = 'warning' THEN 'warning'
           ELSE 'info'
         END,
         details = EXCLUDED.details,
         occurrence_count = telemetry_anomalies.occurrence_count + 1,
         last_seen_at = now()
       RETURNING id`,
      [
        params.vehicleId || null,
        params.deviceId || null,
        params.provider || null,
        params.anomalyType,
        params.severity,
        JSON.stringify(params.details),
        dedupeKey,
      ],
    );
    if (result.rows.length !== 1) {
      throw new Error("Anomaly upsert returned no persisted row");
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`TELEMETRY_ANOMALY_PIPELINE_FAILED: ${reason}`);
  }
}
