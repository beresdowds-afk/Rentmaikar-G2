import pluginManager from "./pluginManager";
import { EVBatteryPlugin } from "./evBattery/evBatteryPlugin";
import { OBDPlugin } from "./obd/obdPlugin";

pluginManager.register(EVBatteryPlugin);
pluginManager.register(OBDPlugin);

export { pluginManager };
export default pluginManager;
