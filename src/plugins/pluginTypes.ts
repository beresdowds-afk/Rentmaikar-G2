export interface PluginEvent {
  type: string;
  vehicleId?: string;
  source?: "traccar" | "mqtt" | string;
  timestamp?: string;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface RentMaikarPlugin {
  id: string;
  name: string;
  enabled: boolean;
  initialize(): Promise<void>;
  deactivate(): Promise<void>;
  processEvent(event: PluginEvent): Promise<void>;
}
