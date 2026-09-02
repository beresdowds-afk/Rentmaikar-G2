import orchestrator from "./residentOrchestrator";

/**
 * Bridge MQTT telemetry messages into the Resident Orchestrator.
 * Expected topic shape: rentmaikar/vehicle/{vehicleId}/...
 */
export function receiveMQTTMessage(topic: string, message: Record<string, unknown>) {
  const parts = topic.split("/");
  const vehicleId = parts[2] ?? String(message?.vehicleId ?? "unknown");

  return orchestrator.processEvent({
    vehicleId,
    source: "mqtt",
    eventType: parts[3] ?? "telemetry",
    timestamp: new Date().toISOString(),
    payload: message ?? {},
  });
}
