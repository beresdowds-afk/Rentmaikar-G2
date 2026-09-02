import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const PUBLIC_VEHICLE_PAGE_SIZE = 12;

export interface PublicVehicleRow {
  id: string;
  make: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  status: string | null;
  pickup_city: string | null;
  /** Only returned for signed-in users; anonymous visitors see the city only. */
  pickup_location?: string | null;

  photo_urls: string[] | null;
  created_at: string;
}

export type CatalogueAvailability = "all" | "available" | "rented";

export interface PublicVehicleFilters {
  search: string;
  minYear?: number;
  maxYear?: number;
  availability: CatalogueAvailability;
}

export interface CatalogueError {
  kind: "permission" | "network" | "unknown";
  message: string;
}

const classifyError = (error: any): CatalogueError => {
  const code = error?.code ?? "";
  const msg = String(error?.message ?? "Unknown error");
  if (
    code === "42501" ||
    code === "PGRST301" ||
    /permission denied|row-level security|not authorized/i.test(msg)
  ) {
    return {
      kind: "permission",
      message:
        "This catalogue is not publicly readable right now. An administrator needs to publish vehicles for public viewing.",
    };
  }
  if (/fetch|network|timeout/i.test(msg)) {
    return { kind: "network", message: "We could not reach the vehicle service. Check your connection and retry." };
  }
  return { kind: "unknown", message: msg };
};

/** Columns readable by everyone; `pickup_location` is restricted to signed-in users. */
const PUBLIC_COLUMNS = "id, make, model, year, color, status, pickup_city, photo_urls, created_at";
const AUTHED_COLUMNS = `${PUBLIC_COLUMNS}, pickup_location`;

const selectColumns = async () => {
  const { data } = await supabase.auth.getSession();
  return data.session ? AUTHED_COLUMNS : PUBLIC_COLUMNS;
};

/**
 * Paginated public catalogue feed. Reads the `public_vehicle_listings` view,
 * which only exposes non-sensitive fields for vehicles that are available/active.
 * Anonymous visitors never receive the exact pickup location.
 */
export const usePublicVehicles = (filters: PublicVehicleFilters) => {
  const query = useInfiniteQuery({
    queryKey: ["public-vehicles", filters],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const from = (pageParam as number) * PUBLIC_VEHICLE_PAGE_SIZE;
      const to = from + PUBLIC_VEHICLE_PAGE_SIZE - 1;

      let q = supabase
        .from("public_vehicle_listings")
        .select(await selectColumns(), {

          count: "exact",
        })
        .order("created_at", { ascending: false })
        .range(from, to);

      if (filters.search.trim()) {
        const term = `%${filters.search.trim().replace(/[%,]/g, "")}%`;
        q = q.or(`make.ilike.${term},model.ilike.${term}`);
      }
      if (typeof filters.minYear === "number") q = q.gte("year", filters.minYear);
      if (typeof filters.maxYear === "number") q = q.lte("year", filters.maxYear);
      if (filters.availability === "available") q = q.eq("status", "available");
      if (filters.availability === "rented") q = q.eq("status", "active");

      const { data, error, count } = await q;
      if (error) throw error;
      return {
        rows: (data ?? []) as unknown as PublicVehicleRow[],
        total: count ?? 0,
        page: pageParam as number,
      };
    },
    getNextPageParam: (last) =>
      (last.page + 1) * PUBLIC_VEHICLE_PAGE_SIZE < last.total ? last.page + 1 : undefined,
    staleTime: 60_000,
    retry: (failureCount, error) => classifyError(error).kind !== "permission" && failureCount < 2,
  });

  const rows = (query.data?.pages ?? []).flatMap((p) => p.rows);
  const total = query.data?.pages?.[0]?.total ?? 0;

  return {
    vehicles: rows,
    total,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: Boolean(query.hasNextPage),
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
    error: query.error ? classifyError(query.error) : null,
  };
};

/**
 * Single public listing, using exactly the same RLS-safe fields as the feed.
 * Returns `null` when the vehicle is not published (or does not exist).
 */
export const usePublicVehicle = (id?: string) =>
  useQuery({
    queryKey: ["public-vehicle", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("public_vehicle_listings")
        .select(await selectColumns())
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as PublicVehicleRow | null) ?? null;
    },
    staleTime: 60_000,
  });

/** Category base prices per region, used to price catalogue listings. */
export const useCategoryPrices = (region: "USA" | "NIGERIA") =>
  useQuery({
    queryKey: ["vehicle-category-prices", region],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_category_prices")
        .select("category, price, min_price, currency")
        .eq("region", region);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });
