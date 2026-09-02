import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRegion } from "@/contexts/RegionContext";

/**
 * Region-aware pricing hints sourced from `vehicle_category_prices`
 * (managed via the super Admin dashboard). Returns the lowest driver
 * weekly rent and the highest published weekly rate — which we surface
 * to owners as an approximate ceiling of what their vehicle can earn.
 */
export function usePricingHints() {
  const { country, currencySymbol } = useRegion();
  const region = country === "Nigeria" ? "NIGERIA" : "USA";

  const query = useQuery({
    queryKey: ["pricing-hints", region],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_category_prices")
        .select("category, price, min_price, currency")
        .eq("region", region);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const rows = query.data ?? [];
  const mins = rows.map((r) => Number(r.min_price)).filter((n) => n > 0);
  const maxes = rows.map((r) => Number(r.price)).filter((n) => n > 0);

  const format = (n: number) =>
    country === "Nigeria"
      ? `${currencySymbol}${Math.round(n).toLocaleString()}`
      : `${currencySymbol}${Math.round(n).toLocaleString()}`;

  const driverFrom = mins.length ? format(Math.min(...mins)) : null;
  const ownerUpTo = maxes.length ? format(Math.max(...maxes)) : null;

  return {
    isLoading: query.isLoading,
    driverFrom, // "Rent from …/week"
    ownerUpTo,  // "Earn up to …/week"
    currencySymbol,
  };
}
