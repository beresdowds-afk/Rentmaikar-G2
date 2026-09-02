import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ data: [{ id: "row-1" }], error: null }),
    })),
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
  },
}));

import orchestrator from "@/services/residentOrchestrator";
import pluginManager from "@/plugins/pluginManager";
import { receiveTraccarEvent } from "@/services/traccarBridge";
import { receiveMQTTMessage } from "@/services/mqttBridge";
import { supabase } from "@/integrations/supabase/client";
import type { RentMaikarPlugin } from "@/plugins/pluginTypes";

const flush = () => new Promise((r) => setTimeout(r, 50));

describe("Orchestrator E2E: Traccar → MQTT → Plugin → vehicle_analytics_events", () => {
  const testPlugin: RentMaikarPlugin = {
    id: "e2e-test-plugin",
    name: "E2E Test Plugin",
    enabled: true,
    initialize: vi.fn().mockResolvedValue(undefined),
    deactivate: vi.fn().mockResolvedValue(undefined),
    processEvent: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    pluginManager.register(testPlugin);
    pluginManager.resetCallCounts();
    (supabase.from as unknown as { mockClear: () => void }).mockClear?.();
    (supabase.functions.invoke as unknown as { mockClear: () => void }).mockClear?.();
  });

  it("Traccar event updates state and fans out to plugins", async () => {
    const vehicleId = `test-${Date.now()}`;
    receiveTraccarEvent({
      deviceId: vehicleId, type: "position", speed: 130,
      ignition: true, fixTime: new Date().toISOString(),
    });
    await flush();
    expect(orchestrator.getVehicleState(vehicleId)?.speed).toBe(130);
    expect(pluginManager.getCallCount("e2e-test-plugin")).toBeGreaterThan(0);
  });

  it("MQTT event updates state and triggers analytics persistence", async () => {
    const vehicleId = `test-mqtt-${Date.now()}`;
    receiveMQTTMessage(`rentmaikar/vehicle/${vehicleId}/telemetry`, {
      battery: 10, temperature: 110,
    });
    await flush();
    const state = orchestrator.getVehicleState(vehicleId);
    expect(state?.battery).toBe(10);
    expect(state?.temperature).toBe(110);
    // Analytics persistence is server-authoritative: the browser forwards the
    // raw event to the telemetry-ingest edge function.
    expect(supabase.functions.invoke).toHaveBeenCalledWith(
      "telemetry-ingest",
      expect.objectContaining({ body: expect.anything() }),
    );
  });

  it("Disabled plugin does not process events; re-enabled resumes", async () => {
    await pluginManager.deactivate("e2e-test-plugin");
    const before = pluginManager.getCallCount("e2e-test-plugin");
    receiveTraccarEvent({
      deviceId: "toggle-1", type: "position", speed: 40,
      ignition: true, fixTime: new Date().toISOString(),
    });
    await flush();
    expect(pluginManager.getCallCount("e2e-test-plugin")).toBe(before);

    await pluginManager.activate("e2e-test-plugin");
    receiveTraccarEvent({
      deviceId: "toggle-1", type: "position", speed: 50,
      ignition: true, fixTime: new Date().toISOString(),
    });
    await flush();
    expect(pluginManager.getCallCount("e2e-test-plugin")).toBeGreaterThan(before);
  });

  it("Feed health tracks last event timestamps per source", async () => {
    receiveTraccarEvent({
      deviceId: "health-1", type: "position", speed: 20,
      ignition: true, fixTime: new Date().toISOString(),
    });
    receiveMQTTMessage("rentmaikar/vehicle/health-1/telemetry", { battery: 80 });
    await flush();
    const h = orchestrator.getFeedHealth();
    expect(h.lastTraccarEventAt).toBeGreaterThan(0);
    expect(h.lastMqttEventAt).toBeGreaterThan(0);
  });
});
