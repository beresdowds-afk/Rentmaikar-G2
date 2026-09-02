import orchestrator from "./residentOrchestrator";

/**
 * Bridge a Traccar position or event payload into the Resident Orchestrator.
 */
export function receiveTraccarEvent(payload: Record<string, unknown>) {
  return orchestrator.processEvent({
    vehicleId: String(payload.deviceId ?? payload.vehicleId ?? "unknown"),
    source: "traccar",
    eventType: (payload.type as string) || "position",
    timestamp:
      (payload.fixTime as string) ||
      (payload.serverTime as string) ||
      new Date().toISOString(),
    payload,
  });
}
