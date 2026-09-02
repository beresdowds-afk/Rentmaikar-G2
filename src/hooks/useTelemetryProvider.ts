import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type TelemetryProviderName = "emqx" | "traccar" | "sarekon";

export interface ProviderStatus {
  active: TelemetryProviderName;
  providers: Record<string, { configured: boolean }>;
}

/**
 * Reads the ACTIVE telemetry provider (admin toggle in telemetry_providers)
 * and keeps it live via Postgres realtime, so any provider-aware UI reacts
 * the moment an admin flips the switch.
 */
export function useTelemetryProvider() {
  const [active, setActive] = useState<TelemetryProviderName | null>(null);
  const [configured, setConfigured] = useState<Record<string, { configured: boolean }>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("telemetry_providers")
      .select("name, is_active, priority")
      .eq("is_active", true)
      .order("priority", { ascending: true })
      .limit(1)
      .maybeSingle();
    setActive(((data?.name as TelemetryProviderName) ?? "traccar"));
    setLoading(false);
  }, []);

  const refreshConfigured = useCallback(async () => {
    const { data } = await supabase.functions.invoke("telemetry-dispatch", {
      body: { action: "get_active_provider" },
    });
    if (data?.providers) setConfigured(data.providers);
    if (data?.active) setActive(data.active);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("telemetry-provider-switch")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "telemetry_providers" },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  return { active, loading, configured, reload: load, refreshConfigured };
}

/** Send a vehicle command through whichever provider is active. */
export async function sendTelemetryCommand(params: {
  command: string;
  deviceId?: string;
  vehicleId?: string;
  payload?: Record<string, unknown>;
}) {
  const { data, error } = await supabase.functions.invoke("telemetry-dispatch", {
    body: {
      action: "send_command",
      command: params.command,
      device_id: params.deviceId,
      vehicle_id: params.vehicleId,
      payload: params.payload ?? {},
    },
  });
  if (error) throw error;
  return data as { ok: boolean; provider: string; error?: string };
}
