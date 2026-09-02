import { useEffect, useState } from "react";
import { useRegion } from "@/contexts/RegionContext";
import { supabase } from "@/integrations/supabase/client";

export interface PayPalConfig {
  clientId: string | null;
  environment: "sandbox" | "production";
  mode: "sandbox" | "live";
  currency: "USD";
  enabled: boolean;
  isLoading: boolean;
  error: string | null;
}

export function usePayPalConfig(): PayPalConfig {
  const { country, currency } = useRegion();
  const [clientId, setClientId] = useState<string | null>(null);
  const [mode, setMode] = useState<"sandbox" | "live">("sandbox");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const isUS = country === "USA" && currency === "USD";

    if (!isUS) {
      setIsLoading(false);
      return;
    }

    async function load() {
      try {
        const { data, error: fnError } = await supabase.functions.invoke("get-paypal-config");
        if (cancelled) return;
        if (fnError || !data?.client_id) {
          setError(fnError?.message ?? data?.error ?? "PayPal not configured");
          setClientId(null);
        } else {
          setClientId(data.client_id);
          setMode(data.mode === "live" ? "live" : "sandbox");
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load PayPal config");
          setClientId(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [country, currency]);

  const isEnabled = country === "USA" && currency === "USD" && !!clientId && !error;

  return {
    clientId,
    environment: mode === "live" ? "production" : "sandbox",
    mode,
    currency: "USD",
    enabled: isEnabled,
    isLoading,
    error,
  };
}
