import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import {
  persistTelemetryAnomaly,
  type TelemetryAnomalyWriter,
} from "../telemetryAnomalyPersistence";

describe("telemetry anomaly persistence", () => {
  it("uses a stable entity/category key and requires a returned database row", async () => {
    let capturedSql = "";
    let capturedParams: unknown[] = [];
    const writer: TelemetryAnomalyWriter = {
      async query(sql, params) {
        capturedSql = sql;
        capturedParams = params;
        return { rows: [{ id: "anomaly-1" }], rowCount: 1 };
      },
    };

    await persistTelemetryAnomaly(writer, {
      vehicleId: "vehicle-1",
      deviceId: "device-1",
      provider: "emqx",
      anomalyType: "critical_battery",
      severity: "critical",
      details: { battery_percent: 2 },
    });

    assert.match(capturedSql, /ON CONFLICT \(active_dedupe_key\)/);
    assert.equal(
      capturedParams[6],
      createHash("md5").update("vehicle-1:critical_battery").digest("hex"),
    );
  });

  it("fails explicitly when the anomaly row cannot be persisted", async () => {
    const writer: TelemetryAnomalyWriter = {
      async query() {
        throw new Error("database unavailable");
      },
    };
    await assert.rejects(
      persistTelemetryAnomaly(writer, {
        vehicleId: "vehicle-1",
        anomalyType: "impossible_speed",
        severity: "warning",
        details: { speed_kmh: 301 },
      }),
      /TELEMETRY_ANOMALY_PIPELINE_FAILED/,
    );
  });

  it("fails explicitly when the upsert does not return a stored row", async () => {
    const writer: TelemetryAnomalyWriter = {
      async query() {
        return { rows: [], rowCount: 0 };
      },
    };
    await assert.rejects(
      persistTelemetryAnomaly(writer, {
        deviceId: "device-1",
        anomalyType: "unexpected_device_disconnection",
        severity: "warning",
        details: {},
      }),
      /TELEMETRY_ANOMALY_PIPELINE_FAILED/,
    );
  });
});
