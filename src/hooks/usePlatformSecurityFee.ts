import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PlatformSecurityFeeSetting {
  id: string;
  region: "USA" | "NIGERIA" | string;
  amount: number;
  currency: string;
  description: string;
  is_active: boolean;
  updated_at: string;
}

const STORAGE_KEY = "rentmaikar:platform_security_fee_settings";

export const DEFAULT_PLATFORM_SECURITY_FEES: Record<string, PlatformSecurityFeeSetting> = {
  USA: {
    id: "fee-sec-usa",
    region: "USA",
    amount: 500,
    currency: "USD",
    description: "Refundable platform security deposit/fee required from drivers before signing vehicle rental agreements and receiving vehicle keys.",
    is_active: true,
    updated_at: new Date().toISOString(),
  },
  NIGERIA: {
    id: "fee-sec-nigeria",
    region: "NIGERIA",
    amount: 250000,
    currency: "NGN",
    description: "Refundable platform security deposit/fee required from drivers before signing vehicle rental agreements and receiving vehicle keys.",
    is_active: true,
    updated_at: new Date().toISOString(),
  },
};

function getLocalSettings(): Record<string, PlatformSecurityFeeSetting> {
  if (typeof window === "undefined") return DEFAULT_PLATFORM_SECURITY_FEES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PLATFORM_SECURITY_FEES;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PLATFORM_SECURITY_FEES, ...parsed };
  } catch {
    return DEFAULT_PLATFORM_SECURITY_FEES;
  }
}

function saveLocalSettings(settings: Record<string, PlatformSecurityFeeSetting>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent("platform-security-fee-updated", { detail: settings }));
  } catch (e) {
    console.warn("Could not save platform security fee to localStorage", e);
  }
}

export function formatPlatformFee(setting?: PlatformSecurityFeeSetting | null): string {
  if (!setting) return "";
  const symbol = setting.currency === "NGN" ? "₦" : "$";
  const amount = Number(setting.amount ?? 0);
  if (!Number.isFinite(amount)) return "";
  return `${symbol}${amount.toLocaleString()} ${setting.currency}`;
}

const toRegionKey = (region?: string | null): "USA" | "NIGERIA" => {
  const norm = (region ?? "").toLowerCase();
  return norm.startsWith("nig") || norm === "ng" ? "NIGERIA" : "USA";
};

export function usePlatformSecurityFees() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["platform-security-fee-settings"],
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, PlatformSecurityFeeSetting>> => {
      // 1. First check if security_deposit_settings or platform_security_fee_settings has values
      try {
        const { data: depData, error: depErr } = await supabase
          .from("security_deposit_settings")
          .select("*")
          .eq("is_active", true);

        if (!depErr && depData && depData.length > 0) {
          const mapped: Record<string, PlatformSecurityFeeSetting> = { ...getLocalSettings() };
          depData.forEach((row: any) => {
            const r = toRegionKey(row.region);
            mapped[r] = {
              id: row.id || `fee-sec-${r.toLowerCase()}`,
              region: r,
              amount: Number(row.amount ?? 0),
              currency: row.currency || (r === "NIGERIA" ? "NGN" : "USD"),
              description: row.description || DEFAULT_PLATFORM_SECURITY_FEES[r].description,
              is_active: row.is_active ?? true,
              updated_at: row.updated_at || new Date().toISOString(),
            };
          });
          saveLocalSettings(mapped);
          return mapped;
        }

        const { data, error } = await supabase
          .from("platform_security_fee_settings" as any)
          .select("*")
          .eq("is_active", true);

        if (!error && data && data.length > 0) {
          const mapped: Record<string, PlatformSecurityFeeSetting> = { ...getLocalSettings() };
          data.forEach((row: any) => {
            const r = toRegionKey(row.region);
            mapped[r] = {
              id: row.id || `fee-sec-${r.toLowerCase()}`,
              region: r,
              amount: Number(row.amount ?? 0),
              currency: row.currency || (r === "NIGERIA" ? "NGN" : "USD"),
              description: row.description || DEFAULT_PLATFORM_SECURITY_FEES[r].description,
              is_active: row.is_active ?? true,
              updated_at: row.updated_at || new Date().toISOString(),
            };
          });
          saveLocalSettings(mapped);
          return mapped;
        }
      } catch {
        // Table not present or RLS policy, gracefully fallback to local persisted settings
      }

      return getLocalSettings();
    },
    initialData: getLocalSettings,
  });

  const updateFeeMutation = useMutation({
    mutationFn: async ({
      region,
      amount,
      description,
    }: {
      region: "USA" | "NIGERIA" | string;
      amount: number;
      description?: string;
    }) => {
      const regKey = toRegionKey(region);
      const current = getLocalSettings();
      const updated: PlatformSecurityFeeSetting = {
        ...(current[regKey] || DEFAULT_PLATFORM_SECURITY_FEES[regKey]),
        region: regKey,
        amount,
        description: description ?? (current[regKey]?.description || DEFAULT_PLATFORM_SECURITY_FEES[regKey].description),
        updated_at: new Date().toISOString(),
      };

      const newSettings = {
        ...current,
        [regKey]: updated,
      };

      // Persist locally for zero-latency, cross-tab and cross-component consistency
      saveLocalSettings(newSettings);

      // Attempt DB persistence to security_deposit_settings and fallback
      try {
        const dbRegion = regKey === "NIGERIA" ? "Nigeria" : "USA";
        await supabase
          .from("security_deposit_settings")
          .update({
            amount,
            description: updated.description,
            updated_at: new Date().toISOString(),
          })
          .eq("region", dbRegion);
      } catch {
        // Ignored if DB table not available
      }

      try {
        await supabase
          .from("platform_security_fee_settings" as any)
          .upsert({
            region: regKey,
            amount,
            currency: updated.currency,
            description: updated.description,
            is_active: true,
            updated_at: new Date().toISOString(),
          }, { onConflict: "region" });
      } catch {
        // Ignored if DB table not available
      }

      return newSettings;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["platform-security-fee-settings"], data);
      queryClient.invalidateQueries({ queryKey: ["platform-security-fee-settings"] });
      queryClient.invalidateQueries({ queryKey: ["security-deposit-settings"] });
    },
  });

  return {
    fees: query.data || getLocalSettings(),
    isLoading: query.isLoading,
    updateFee: updateFeeMutation.mutateAsync,
    isUpdating: updateFeeMutation.isPending,
  };
}

/** Specific regional hook for public UI */
export function usePlatformSecurityFee(region?: string | null) {
  const { fees, isLoading, updateFee, isUpdating } = usePlatformSecurityFees();
  const [localFee, setLocalFee] = useState<PlatformSecurityFeeSetting>(() => {
    const key = toRegionKey(region);
    return fees[key] || DEFAULT_PLATFORM_SECURITY_FEES[key];
  });

  const regKey = toRegionKey(region);

  useEffect(() => {
    const key = toRegionKey(region);
    setLocalFee(fees[key] || DEFAULT_PLATFORM_SECURITY_FEES[key]);
  }, [fees, region]);

  useEffect(() => {
    const onCustomUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail[regKey]) {
        setLocalFee(detail[regKey]);
      }
    };
    window.addEventListener("platform-security-fee-updated", onCustomUpdate);
    return () => window.removeEventListener("platform-security-fee-updated", onCustomUpdate);
  }, [regKey]);

  const activeFee = fees[regKey] || localFee || DEFAULT_PLATFORM_SECURITY_FEES[regKey];

  return {
    fee: activeFee,
    formatted: formatPlatformFee(activeFee),
    isLoading,
    updateFee: (amount: number, description?: string) => updateFee({ region: regKey, amount, description }),
    isUpdating,
  };
}
