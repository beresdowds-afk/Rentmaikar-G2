import { RentMaikarPlugin } from "../pluginTypes";

export const EVBatteryPlugin: RentMaikarPlugin = {
  id: "evBattery",
  name: "EV Battery Telemetry",
  enabled: false,

  async initialize() {
    console.log("[plugin:evBattery] enabled");
  },

  async deactivate() {
    console.log("[plugin:evBattery] disabled");
  },

  async processEvent(event) {
    const payload = event.payload as Record<string, unknown> | undefined;
    if (payload && typeof payload.battery === "number") {
      console.log("[plugin:evBattery] battery=", payload.battery, "vehicle=", event.vehicleId);
    }
  },
};
