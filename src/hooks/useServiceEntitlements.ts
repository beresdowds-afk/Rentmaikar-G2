import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useRegion } from "@/contexts/RegionContext";

export type ServiceKey =
  | "driver_training"
  | "insurance"
  | "roadside_assistance"
  | "vehicle_activation";

// Maps a compulsory-subscription service to its subscription_plans.plan_type.
// Support/vehicle_activation currently do not have a paid plan (feature toggle only).
const PLAN_TYPE_FOR: Partial<Record<ServiceKey, string>> = {
  driver_training: "training",
  insurance: "insurance",
  roadside_assistance: "roadside_support",
  vehicle_activation: "vehicle_activation",
};

export interface ServiceEntitlement {
  /** Feature toggle is on for the user's region. */
  regionEnabled: boolean;
  /** User has a paid, active subscription for the corresponding plan. */
  hasActivePayment: boolean;
  /** Convenience: regionEnabled && (no paid plan needed OR hasActivePayment). */
  isEntitled: boolean;
}

const COUNTRY_CODE: Record<string, string> = {
  USA: "US",
  Nigeria: "NG",
};

export function useServiceEntitlements(services: ServiceKey[]) {
  const { user } = useAuth();
  const { country } = useRegion();
  const [entitlements, setEntitlements] = useState<Record<string, ServiceEntitlement>>({});
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [featRes, ovRes, countryRes, subsRes] = await Promise.all([
        supabase.from("platform_features").select("id, key, is_global_default").in("key", services),
        supabase.from("platform_feature_overrides").select("feature_id, country_id, is_enabled, scope"),
        supabase.from("platform_countries").select("id, code").eq("code", COUNTRY_CODE[country] ?? "").maybeSingle(),
        user
          ? supabase
              .from("user_subscriptions")
              .select("expires_at, status, subscription_plans!inner(plan_type)")
              .eq("user_id", user.id)
              .eq("status", "active")
          : Promise.resolve({ data: [], error: null } as { data: unknown[]; error: null }),
      ]);

      const features = (featRes.data ?? []) as Array<{ id: string; key: string; is_global_default: boolean }>;
      const overrides = (ovRes.data ?? []) as Array<{ feature_id: string; country_id: string | null; is_enabled: boolean; scope: string }>;
      const countryId = (countryRes.data as { id: string } | null)?.id ?? null;
      const activePlanTypes = new Set(
        Array.isArray(subsRes.data)
          ? (subsRes.data as Array<{ expires_at: string; subscription_plans: { plan_type: string } }>)
              .filter((s) => !s.expires_at || new Date(s.expires_at) > new Date())
              .map((s) => s.subscription_plans.plan_type)
          : []
      );

      const result: Record<string, ServiceEntitlement> = {};
      for (const key of services) {
        const feat = features.find((f) => f.key === key);
        let regionEnabled = feat?.is_global_default ?? false;
        if (feat && countryId) {
          const ov = overrides.find(
            (o) => o.feature_id === feat.id && o.scope === "country" && o.country_id === countryId
          );
          if (ov) regionEnabled = ov.is_enabled;
        }
        const planType = PLAN_TYPE_FOR[key];
        const hasActivePayment = planType ? activePlanTypes.has(planType) : true;
        const isEntitled = regionEnabled && hasActivePayment;
        result[key] = { regionEnabled, hasActivePayment, isEntitled };
      }
      setEntitlements(result);
    } catch (err) {
      console.error("useServiceEntitlements failed", err);
    } finally {
      setIsLoading(false);
    }
  }, [user, country, services.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
  }, [load]);

  return { entitlements, isLoading, refetch: load };
}

export default useServiceEntitlements;
