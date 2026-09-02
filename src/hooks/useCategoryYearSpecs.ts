import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Country } from "@/contexts/RegionContext";

export type CategoryYearSpec = {
  id: string;
  category: string;
  region: string;
  min_year: number;
  max_year: number;
  label: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
};

const VISIBILITY_KEY = "rentmaikar_year_specs_visibility";

const readVisibility = (): Record<string, boolean> => {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(VISIBILITY_KEY) || "{}");
  } catch {
    return {};
  }
};

export const setRegionYearSpecsVisibility = (region: string, visible: boolean) => {
  const current = readVisibility();
  current[region.toUpperCase()] = visible;
  localStorage.setItem(VISIBILITY_KEY, JSON.stringify(current));
  window.dispatchEvent(new StorageEvent("storage", { key: VISIBILITY_KEY }));
};

export const isRegionYearSpecsVisible = (region: string): boolean => {
  const map = readVisibility();
  const key = region.toUpperCase();
  return map[key] !== false; // default visible
};

const regionToDbKey = (country?: Country | string) => {
  if (!country) return null;
  return country.toString().toUpperCase() === "NIGERIA" ? "NIGERIA" : "USA";
};

export const useCategoryYearSpecs = (country?: Country | string) => {
  const region = regionToDbKey(country);
  const [visibleTick, setVisibleTick] = useState(0);

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === VISIBILITY_KEY) setVisibleTick((n) => n + 1);
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const query = useQuery({
    queryKey: ["category-year-specs", region ?? "ALL"],
    queryFn: async () => {
      let q = supabase
        .from("vehicle_category_year_specs")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (region) q = q.eq("region", region);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CategoryYearSpec[];
    },
  });

  const visible = region ? isRegionYearSpecsVisible(region) : true;
  // touch tick so the returned value reacts to visibility toggles
  void visibleTick;

  const grouped = (query.data ?? []).reduce<Record<string, CategoryYearSpec[]>>(
    (acc, spec) => {
      (acc[spec.category] = acc[spec.category] || []).push(spec);
      return acc;
    },
    {},
  );

  const getForCategory = (category: string): CategoryYearSpec | undefined => {
    const bucket = grouped[category];
    if (!bucket || bucket.length === 0) return undefined;
    return [...bucket].sort((a, b) => a.sort_order - b.sort_order)[0];
  };

  const formatRange = (spec?: CategoryYearSpec) =>
    spec ? `${spec.min_year} - ${spec.max_year}` : "";

  return {
    ...query,
    specs: query.data ?? [],
    grouped,
    getForCategory,
    formatRange,
    visible,
    region,
  };
};
