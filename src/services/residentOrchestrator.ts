import {
  VehicleEvent,
  VehicleState,
  AnalyticsEvent,
} from "./resident-ochestrator/types";
import pluginManager from "@/plugins/pluginManager";
import { supabase } from "@/integrations/supabase/client";

type Listener = (state: VehicleState, events: AnalyticsEvent[]) => void;

class ResidentOrchestrator {
  private vehicleStates: Map<string, VehicleState> = new Map();
  private recentAnalytics: AnalyticsEvent[] = [];
  private listeners: Set<Listener> = new Set();
  private lastTraccarEventAt: number | null = null;
  private lastMqttEventAt: number | null = null;

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }


  getAllStates(): VehicleState[] {
    return Array.from(this.vehicleStates.values());
  }

  getRecentAnalytics(limit = 50): AnalyticsEvent[] {
    return this.recentAnalytics.slice(-limit).reverse();
  }

  getFeedHealth() {
    return {
      lastTraccarEventAt: this.lastTraccarEventAt,
      lastMqttEventAt: this.lastMqttEventAt,
    };
  }

  async processEvent(event: VehicleEvent) {
    const state =
      this.vehicleStates.get(event.vehicleId) || {
        vehicleId: event.vehicleId,
        lastUpdate: event.timestamp,
      };

    if (event.source === "traccar") {
      this.processTraccar(state, event);
      this.lastTraccarEventAt = Date.now();
    }
    if (event.source === "mqtt") {
      this.processMQTT(state, event);
      this.lastMqttEventAt = Date.now();
    }

    state.lastUpdate = event.timestamp;
    this.vehicleStates.set(event.vehicleId, state);

    const analytics = this.runAnalytics(state, event);
    this.listeners.forEach((l) => {
      try {
        l(state, analytics);
      } catch (e) {
        console.warn("orchestrator listener error", e);
      }
    });

    // Fan out to plugins (non-blocking)
    pluginManager
      .process({
        type: event.eventType,
        vehicleId: event.vehicleId,
        source: event.source,
        timestamp: event.timestamp,
        payload: event.payload,
      })
      .catch((e) => console.warn("plugin dispatch failed", e));

    return state;
  }

  private processTraccar(state: VehicleState, event: VehicleEvent) {
    const data = event.payload as Record<string, unknown>;
    if (typeof data.latitude === "number") state.latitude = data.latitude;
    if (typeof data.longitude === "number") state.longitude = data.longitude;
    if (typeof data.speed === "number") state.speed = data.speed;
    if (typeof data.ignition === "boolean") state.ignition = data.ignition;
  }

  private processMQTT(state: VehicleState, event: VehicleEvent) {
    const data = event.payload as Record<string, unknown>;
    if (typeof data.battery === "number") state.battery = data.battery;
    if (typeof data.fuel === "number") state.fuel = data.fuel;
    if (typeof data.temperature === "number") state.temperature = data.temperature;
  }

  private runAnalytics(state: VehicleState, event: VehicleEvent): AnalyticsEvent[] {
    const events: AnalyticsEvent[] = [];

    if (state.speed && state.speed > 120) {
      events.push({
        vehicleId: state.vehicleId,
        category: "driver_behavior",
        data: { type: "speed_violation", speed: state.speed, severity: "warning" },
      });
    }

    if (state.temperature && state.temperature > 100) {
      events.push({
        vehicleId: state.vehicleId,
        category: "maintenance",
        data: { type: "engine_temperature", temperature: state.temperature, severity: "critical" },
      });
    }

    if (typeof state.battery === "number" && state.battery < 15) {
      events.push({
        vehicleId: state.vehicleId,
        category: "maintenance",
        data: { type: "low_battery", battery: state.battery, severity: "warning" },
      });
    }

    if (events.length) {
      this.recentAnalytics.push(...events);
      if (this.recentAnalytics.length > 200) {
        this.recentAnalytics = this.recentAnalytics.slice(-200);
      }
      this.persistAnalytics(events, event).catch((e) =>
        console.warn("persist analytics failed", e),
      );
    }

    return events;
  }

  /**
   * Persistence + analytics are authoritative on the server: the browser only
   * forwards the raw event to the `telemetry-ingest` edge function, which runs
   * the same orchestrator core, upserts vehicle state and writes analytics.
   * The local instance stays as a low-latency UI mirror.
   */
  private async persistAnalytics(_events: AnalyticsEvent[], src: VehicleEvent) {
    try {
      await supabase.functions.invoke("telemetry-ingest", {
        body: {
          events: [
            {
              source: src.source,
              vehicleId: src.vehicleId,
              eventType: src.eventType,
              timestamp: src.timestamp,
              payload: src.payload,
            },
          ],
        },
      });
    } catch (e) {
      console.warn("orchestrator: server ingest skipped", e);
    }
  }

  getVehicleState(vehicleId: string) {
    return this.vehicleStates.get(vehicleId);
  }
}

const orchestrator = new ResidentOrchestrator();
export default orchestrator;
