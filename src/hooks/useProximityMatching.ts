import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  calculateDistanceInMiles,
  usaLocationCoordinates,
  nigeriaCityCoordinates,
  getNigeriaParentCity,
} from "@/lib/geo-utils";

/** Default matching radius (miles), still bounded by city limits in Nigeria. */
export const PROXIMITY_DEFAULT_RADIUS_MILES = 25;

export interface ProximityVehicle {
  id: string;
  make: string | null;
  model: string | null;
  year: number | null;
  status: string | null;
  is_public: boolean | null;
  pickup_city: string | null;
  pickup_location: string | null;
  pickup_address: string | null;
  owner_id: string | null;
}

export interface ProximityDriver {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  street_address: string | null;
  preferred_country: string | null;
}

export interface Match<T> {
  item: T;
  distanceMiles: number;
  /** True when both sides sit inside the same city boundary (Nigeria rule). */
  sameCity: boolean;
}

export interface VehicleWithDrivers {
  vehicle: ProximityVehicle;
  location: string | null;
  country: "USA" | "Nigeria" | null;
  drivers: Match<ProximityDriver>[];
}

export interface DriverWithVehicles {
  driver: ProximityDriver;
  location: string | null;
  country: "USA" | "Nigeria" | null;
  vehicles: Match<ProximityVehicle>[];
}

interface Resolved {
  location: string;
  country: "USA" | "Nigeria";
  city: string;
  coords: { lat: number; lng: number };
}

/** Resolve a free-text city/location into a country, canonical city and coordinates. */
export const resolveLocation = (
  ...candidates: (string | null | undefined)[]
): Resolved | null => {
  for (const raw of candidates) {
    const value = raw?.trim();
    if (!value) continue;

    const ngCity = getNigeriaParentCity(value);
    if (ngCity && nigeriaCityCoordinates[ngCity]) {
      return { location: value, country: "Nigeria", city: ngCity, coords: nigeriaCityCoordinates[ngCity] };
    }

    const usKey = Object.keys(usaLocationCoordinates).find(
      (k) => k.toLowerCase() === value.toLowerCase(),
    );
    if (usKey) {
      return { location: value, country: "USA", city: usKey, coords: usaLocationCoordinates[usKey] };
    }

    // Loose match: "Silver Spring, MD" or "Lekki, Lagos"
    const loose = Object.keys(usaLocationCoordinates).find((k) =>
      value.toLowerCase().includes(k.toLowerCase()),
    );
    if (loose) {
      return { location: value, country: "USA", city: loose, coords: usaLocationCoordinates[loose] };
    }
    const looseNg = Object.keys(nigeriaCityCoordinates).find((k) =>
      value.toLowerCase().includes(k.toLowerCase()),
    );
    if (looseNg) {
      return { location: value, country: "Nigeria", city: looseNg, coords: nigeriaCityCoordinates[looseNg] };
    }
  }
  return null;
};

const matches = (a: Resolved, b: Resolved, radiusMiles: number) => {
  if (a.country !== b.country) return null;
  const distanceMiles = calculateDistanceInMiles(a.coords.lat, a.coords.lng, b.coords.lat, b.coords.lng);
  const sameCity = a.city === b.city;
  // Nigeria matching is bounded by the city's geographical boundary.
  if (a.country === "Nigeria") return sameCity ? { distanceMiles, sameCity } : null;
  if (distanceMiles > radiusMiles) return null;
  return { distanceMiles, sameCity };
};

const fetchProximityData = async () => {
  // The provisioned vehicles list (IoT auto-provisioning) is the source of truth:
  // only vehicles that passed provisioning and are ready for matching participate.
  const { data: readyRows, error: readyError } = await supabase
    .from("iot_provisioning_state")
    .select("vehicle_id")
    .eq("stage", "ready");
  if (readyError) throw readyError;

  const readyVehicleIds = Array.from(
    new Set((readyRows ?? []).map((r) => r.vehicle_id).filter(Boolean) as string[]),
  );

  const [vehiclesRes, rolesRes] = await Promise.all([
    readyVehicleIds.length
      ? supabase
          .from("vehicles")
          .select("id, make, model, year, status, is_public, pickup_city, pickup_location, pickup_address, owner_id")
          .in("id", readyVehicleIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null } as const),
    supabase.from("user_roles").select("user_id").eq("role", "driver"),
  ]);

  if (vehiclesRes.error) throw vehiclesRes.error;
  if (rolesRes.error) throw rolesRes.error;

  const driverIds = Array.from(new Set((rolesRes.data ?? []).map((r) => r.user_id))).filter(Boolean);
  let drivers: ProximityDriver[] = [];

  if (driverIds.length) {
    const { data, error } = await supabase
      .from("profiles")
      .select("user_id, full_name, email, phone, city, street_address, preferred_country")
      .in("user_id", driverIds);
    if (error) throw error;
    drivers = (data ?? []) as ProximityDriver[];
  }

  return {
    vehicles: (vehiclesRes.data ?? []) as ProximityVehicle[],
    drivers,
    readyVehicleCount: readyVehicleIds.length,
  };
};


export const useProximityMatching = (radiusMiles: number = PROXIMITY_DEFAULT_RADIUS_MILES) => {
  const query = useQuery({
    queryKey: ["proximity-matching"],
    queryFn: fetchProximityData,
    staleTime: 60_000,
  });

  const { vehiclesWithDrivers, driversWithVehicles } = useMemo(() => {
    const vehicles = query.data?.vehicles ?? [];
    const drivers = query.data?.drivers ?? [];

    const vehicleLoc = vehicles.map((vehicle) => ({
      vehicle,
      resolved: resolveLocation(vehicle.pickup_city, vehicle.pickup_location, vehicle.pickup_address),
    }));
    const driverLoc = drivers.map((driver) => ({
      driver,
      resolved: resolveLocation(driver.city, driver.street_address),
    }));

    const vehiclesWithDrivers: VehicleWithDrivers[] = vehicleLoc.map(({ vehicle, resolved }) => ({
      vehicle,
      location: resolved?.location ?? vehicle.pickup_city ?? null,
      country: resolved?.country ?? null,
      drivers: resolved
        ? driverLoc
            .flatMap(({ driver, resolved: dr }) => {
              if (!dr) return [];
              const m = matches(resolved, dr, radiusMiles);
              return m ? [{ item: driver, ...m }] : [];
            })
            .sort((a, b) => a.distanceMiles - b.distanceMiles)
        : [],
    }));

    const driversWithVehicles: DriverWithVehicles[] = driverLoc.map(({ driver, resolved }) => ({
      driver,
      location: resolved?.location ?? driver.city ?? null,
      country: resolved?.country ?? null,
      vehicles: resolved
        ? vehicleLoc
            .flatMap(({ vehicle, resolved: vr }) => {
              if (!vr) return [];
              const m = matches(resolved, vr, radiusMiles);
              return m ? [{ item: vehicle, ...m }] : [];
            })
            .sort((a, b) => a.distanceMiles - b.distanceMiles)
        : [],
    }));

    return { vehiclesWithDrivers, driversWithVehicles };
  }, [query.data, radiusMiles]);

  return {
    ...query,
    vehiclesWithDrivers,
    driversWithVehicles,
    readyVehicleCount: query.data?.readyVehicleCount ?? 0,
  };
};
