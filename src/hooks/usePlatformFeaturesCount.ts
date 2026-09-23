import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PlatformFeatureItem {
  id: string;
  key: string;
  name: string;
  category: string;
  description: string | null;
  is_global_default: boolean;
}

export function usePlatformFeaturesCount(fallbackCount: number = 68) {
  const [count, setCount] = useState<number>(fallbackCount);
  const [features, setFeatures] = useState<PlatformFeatureItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFeatures = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Query exact count and features from the platform_features database table
      const { data, count: dbCount, error: dbError } = await supabase
        .from("platform_features")
        .select("*", { count: "exact" })
        .order("category, name");

      if (dbError) {
        console.warn("[usePlatformFeaturesCount] Error querying platform_features:", dbError.message);
        setError(dbError.message);
      } else {
        if (typeof dbCount === "number" && dbCount > 0) {
          setCount(dbCount);
        } else if (data && data.length > 0) {
          setCount(data.length);
        }
        if (data) {
          setFeatures(data as PlatformFeatureItem[]);
        }
      }
    } catch (err: any) {
      console.warn("[usePlatformFeaturesCount] Exception querying platform_features:", err);
      setError(err?.message || "Failed to fetch platform features count");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeatures();
  }, [fetchFeatures]);

  return {
    count,
    features,
    isLoading,
    error,
    refetch: fetchFeatures,
  };
}
