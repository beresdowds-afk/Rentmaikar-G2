export interface VehicleEvent {
  vehicleId: string;
  source: "traccar" | "mqtt";
  eventType: string;
  timestamp: string;
  payload: Record<string, any>;
}

export interface VehicleState {
  vehicleId: string;
  latitude?: number;
  longitude?: number;
  speed?: number;
  ignition?: boolean;
  battery?: number;
  fuel?: number;
  temperature?: number;
  lastUpdate: string;
}

export interface AnalyticsEvent {
  vehicleId: string;
  category:
    | "driver_behavior"
    | "accident"
    | "maintenance"
    | "security";
  data: Record<string, any>;
}
