import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface PlatformCountry {
  id: string;
  code: string;
  name: string;
  flag: string;
  currency_code: string;
  currency_symbol: string;
  phone_prefix: string;
  payment_gateway: string;
  timezone: string;
  is_active: boolean;
  display_order: number;
}

export interface PlatformRegion {
  id: string;
  country_id: string;
  code: string;
  name: string;
  center_lat: number | null;
  center_lng: number | null;
  map_zoom: number | null;
  requires_police_report: boolean;
  is_active: boolean;
  display_order: number;
  forwarding_sms: string | null;
  forwarding_whatsapp: string | null;
  forwarding_notes: string | null;
}

export interface PlatformCity {
  id: string;
  region_id: string;
  name: string;
  center_lat: number | null;
  center_lng: number | null;
  search_radius_miles: number | null;
  is_active: boolean;
  display_order: number;
}

export interface PlatformFeature {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string;
  is_global_default: boolean;
}

export interface FeatureOverride {
  id: string;
  feature_id: string;
  scope: "country" | "region" | "city";
  country_id: string | null;
  region_id: string | null;
  city_id: string | null;
  is_enabled: boolean;
  notes: string | null;
}

export const useRegionalOperations = () => {
  const [countries, setCountries] = useState<PlatformCountry[]>([]);
  const [regions, setRegions] = useState<PlatformRegion[]>([]);
  const [cities, setCities] = useState<PlatformCity[]>([]);
  const [features, setFeatures] = useState<PlatformFeature[]>([]);
  const [overrides, setOverrides] = useState<FeatureOverride[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [countriesRes, regionsRes, citiesRes, featuresRes, overridesRes] = await Promise.all([
        supabase.from("platform_countries").select("*").order("display_order"),
        supabase.from("platform_regions").select("*").order("display_order"),
        supabase.from("platform_cities").select("*").order("display_order"),
        supabase.from("platform_features").select("*").order("category, name"),
        supabase.from("platform_feature_overrides").select("*"),
      ]);

      if (countriesRes.data) setCountries(countriesRes.data as PlatformCountry[]);
      if (regionsRes.data) setRegions(regionsRes.data as PlatformRegion[]);
      if (citiesRes.data) setCities(citiesRes.data as PlatformCity[]);
      if (featuresRes.data) setFeatures(featuresRes.data as PlatformFeature[]);
      if (overridesRes.data) setOverrides(overridesRes.data as FeatureOverride[]);
    } catch (err) {
      console.error("Failed to fetch regional operations:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const toggleCountry = async (id: string, is_active: boolean) => {
    const { error } = await supabase.from("platform_countries").update({ is_active }).eq("id", id);
    if (error) { toast.error("Failed to update country"); return; }
    setCountries(prev => prev.map(c => c.id === id ? { ...c, is_active } : c));
    toast.success(`Country ${is_active ? "activated" : "deactivated"}`);
  };

  const toggleRegion = async (id: string, is_active: boolean) => {
    const { error } = await supabase.from("platform_regions").update({ is_active }).eq("id", id);
    if (error) { toast.error("Failed to update region"); return; }
    setRegions(prev => prev.map(r => r.id === id ? { ...r, is_active } : r));
    toast.success(`Region ${is_active ? "activated" : "deactivated"}`);
  };

  const toggleCity = async (id: string, is_active: boolean) => {
    const { error } = await supabase.from("platform_cities").update({ is_active }).eq("id", id);
    if (error) { toast.error("Failed to update city"); return; }
    setCities(prev => prev.map(c => c.id === id ? { ...c, is_active } : c));
    toast.success(`City ${is_active ? "activated" : "deactivated"}`);
  };

  const addCountry = async (data: Partial<PlatformCountry>) => {
    const { error } = await supabase.from("platform_countries").insert(data as any);
    if (error) { toast.error("Failed to add country: " + error.message); return; }
    toast.success("Country added");
    fetchAll();
  };

  const addRegion = async (data: Partial<PlatformRegion>) => {
    const { error } = await supabase.from("platform_regions").insert(data as any);
    if (error) { toast.error("Failed to add region: " + error.message); return; }
    toast.success("Region added");
    fetchAll();
  };

  const addCity = async (data: Partial<PlatformCity>) => {
    const { error } = await supabase.from("platform_cities").insert(data as any);
    if (error) { toast.error("Failed to add city: " + error.message); return; }
    toast.success("City added");
    fetchAll();
  };

  const setFeatureOverride = async (
    featureId: string,
    scope: "country" | "region" | "city",
    locationId: string,
    isEnabled: boolean
  ) => {
    const payload: any = {
      feature_id: featureId,
      scope,
      is_enabled: isEnabled,
      country_id: scope === "country" ? locationId : null,
      region_id: scope === "region" ? locationId : null,
      city_id: scope === "city" ? locationId : null,
    };

    // Check if override exists
    const existing = overrides.find(
      o => o.feature_id === featureId && 
        ((scope === "country" && o.country_id === locationId) ||
         (scope === "region" && o.region_id === locationId) ||
         (scope === "city" && o.city_id === locationId))
    );

    if (existing) {
      const { error } = await supabase.from("platform_feature_overrides")
        .update({ is_enabled: isEnabled })
        .eq("id", existing.id);
      if (error) { toast.error("Failed to update override"); return; }
      setOverrides(prev => prev.map(o => o.id === existing.id ? { ...o, is_enabled: isEnabled } : o));
    } else {
      const { data, error } = await supabase.from("platform_feature_overrides")
        .insert(payload)
        .select()
        .single();
      if (error) { toast.error("Failed to set override"); return; }
      if (data) setOverrides(prev => [...prev, data as FeatureOverride]);
    }
  };

  const removeFeatureOverride = async (overrideId: string) => {
    const { error } = await supabase.from("platform_feature_overrides").delete().eq("id", overrideId);
    if (error) { toast.error("Failed to remove override"); return; }
    setOverrides(prev => prev.filter(o => o.id !== overrideId));
  };

  const getEffectiveFeatureState = (
    featureId: string,
    countryId?: string,
    regionId?: string,
    cityId?: string
  ): boolean => {
    const feature = features.find(f => f.id === featureId);
    if (!feature) return false;

    // City override takes priority
    if (cityId) {
      const cityOverride = overrides.find(o => o.feature_id === featureId && o.city_id === cityId);
      if (cityOverride) return cityOverride.is_enabled;
    }
    // Then region
    if (regionId) {
      const regionOverride = overrides.find(o => o.feature_id === featureId && o.region_id === regionId);
      if (regionOverride) return regionOverride.is_enabled;
    }
    // Then country
    if (countryId) {
      const countryOverride = overrides.find(o => o.feature_id === featureId && o.country_id === countryId);
      if (countryOverride) return countryOverride.is_enabled;
    }

    return feature.is_global_default;
  };

  const deleteCountry = async (id: string) => {
    const { error } = await supabase.from("platform_countries").delete().eq("id", id);
    if (error) { toast.error("Failed to delete country"); return; }
    toast.success("Country deleted");
    fetchAll();
  };

  const deleteRegion = async (id: string) => {
    const { error } = await supabase.from("platform_regions").delete().eq("id", id);
    if (error) { toast.error("Failed to delete region"); return; }
    toast.success("Region deleted");
    fetchAll();
  };

  const deleteCity = async (id: string) => {
    const { error } = await supabase.from("platform_cities").delete().eq("id", id);
    if (error) { toast.error("Failed to delete city"); return; }
    toast.success("City deleted");
    fetchAll();
  };

  const updateRegionForwarding = async (id: string, updates: { forwarding_sms?: string | null; forwarding_whatsapp?: string | null; forwarding_notes?: string | null }) => {
    const { error } = await supabase.from("platform_regions").update(updates).eq("id", id);
    if (error) { toast.error("Failed to update forwarding"); return; }
    setRegions(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
    toast.success("Forwarding numbers updated");
  };

  return {
    countries, regions, cities, features, overrides,
    isLoading, refetch: fetchAll,
    toggleCountry, toggleRegion, toggleCity,
    addCountry, addRegion, addCity,
    deleteCountry, deleteRegion, deleteCity,
    setFeatureOverride, removeFeatureOverride,
    getEffectiveFeatureState,
    updateRegionForwarding,
  };
};
