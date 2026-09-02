import { RentMaikarPlugin } from "../pluginTypes";

export const OBDPlugin: RentMaikarPlugin = {
  id: "obd",
  name: "OBD-II Vehicle Diagnostics",
  enabled: false,

  async initialize() {
    console.log("[plugin:obd] enabled");
  },

  async deactivate() {
    console.log("[plugin:obd] disabled");
  },

  async processEvent(event) {
    if (event.type === "obd") {
      console.log("[plugin:obd] diagnostics", event.payload);
    }
  },
};
