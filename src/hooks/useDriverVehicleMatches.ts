import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MatchStatus =
  | "assigned"
  | "agreement_initiated"
  | "agreement_signed"
  | "accredited"
  | "picked_up"
  | "cancelled";

export interface MatchParty {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
}

export interface MatchVehicle {
  id: string;
  make: string | null;
  model: string | null;
  year: number | null;
  pickup_city: string | null;
  pickup_location: string | null;
  owner_id: string | null;
}

export interface DriverVehicleMatch {
  id: string;
  vehicle_id: string;
  driver_id: string;
  owner_id: string | null;
  status: MatchStatus;
  distance_miles: number | null;
  agreement_id: string | null;
  assigned_at: string;
  agreement_initiated_at: string | null;
  agreement_signed_at: string | null;
  accredited_at: string | null;
  picked_up_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  referee_count: number;
  vehicle: MatchVehicle | null;
  driver: MatchParty | null;
  owner: MatchParty | null;
}

export interface MatchEvent {
  id: string;
  match_id: string;
  stage: string;
  message: string | null;
  created_at: string;
}

export const MATCH_STAGE_ORDER: MatchStatus[] = [
  "assigned",
  "agreement_initiated",
  "agreement_signed",
  "accredited",
  "picked_up",
];

export const MATCH_STAGE_LABEL: Record<MatchStatus, string> = {
  assigned: "Assigned",
  agreement_initiated: "Agreement initiated",
  agreement_signed: "Agreement signed",
  accredited: "Accredited",
  picked_up: "Vehicle picked up",
  cancelled: "Cancelled",
};

export const vehicleLabel = (v: MatchVehicle | null) =>
  [v?.year, v?.make, v?.model].filter(Boolean).join(" ") || "Vehicle";

export const partyLabel = (p: MatchParty | null) => p?.full_name ?? p?.email ?? "Unknown";

/** Admin pipeline of driver ↔ provisioned-vehicle matches, with their stage log. */
export const useDriverVehicleMatches = () => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["driver-vehicle-matches"],
    queryFn: async (): Promise<{ matches: DriverVehicleMatch[]; events: MatchEvent[] }> => {
      const { data: rows, error } = await supabase
        .from("driver_vehicle_matches")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const matches = rows ?? [];
      const vehicleIds = [...new Set(matches.map((m) => m.vehicle_id))];
      const userIds = [
        ...new Set(matches.flatMap((m) => [m.driver_id, m.owner_id]).filter(Boolean) as string[]),
      ];

      const [vehiclesRes, profilesRes, eventsRes] = await Promise.all([
        vehicleIds.length
          ? supabase
              .from("vehicles")
              .select("id, make, model, year, pickup_city, pickup_location, owner_id")
              .in("id", vehicleIds)
          : Promise.resolve({ data: [], error: null } as const),
        userIds.length
          ? supabase.from("profiles").select("user_id, full_name, email, phone").in("user_id", userIds)
          : Promise.resolve({ data: [], error: null } as const),
        matches.length
          ? supabase
              .from("driver_vehicle_match_events")
              .select("id, match_id, stage, message, created_at")
              .in(
                "match_id",
                matches.map((m) => m.id),
              )
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null } as const),
      ]);
      if (vehiclesRes.error) throw vehiclesRes.error;
      if (profilesRes.error) throw profilesRes.error;
      if (eventsRes.error) throw eventsRes.error;

      const vehicleById = new Map<string, MatchVehicle>(
        (vehiclesRes.data ?? []).map((v) => [v.id, v as MatchVehicle] as const),
      );
      const partyById = new Map<string, MatchParty>(
        (profilesRes.data ?? []).map((p) => [p.user_id, p as unknown as MatchParty] as const),
      );

      return {
        matches: matches.map((m) => ({
          ...(m as unknown as DriverVehicleMatch),
          vehicle: vehicleById.get(m.vehicle_id) ?? null,
          driver: partyById.get(m.driver_id) ?? null,
          owner: m.owner_id ? partyById.get(m.owner_id) ?? null : null,
        })),
        events: (eventsRes.data ?? []) as MatchEvent[],
      };
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["driver-vehicle-matches"] });
    queryClient.invalidateQueries({ queryKey: ["proximity-matching"] });
  };

  return {
    matches: query.data?.matches ?? [],
    events: query.data?.events ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
    invalidate,
  };
};

export const assignDriverToVehicle = async (
  vehicleId: string,
  driverId: string,
  distanceMiles?: number | null,
) => {
  const { data, error } = await supabase.rpc("admin_assign_driver_to_vehicle", {
    _vehicle_id: vehicleId,
    _driver_id: driverId,
    _distance_miles: distanceMiles ?? null,
  });
  if (error) throw error;
  return data as string;
};

export const initiateMatchAgreement = async (matchId: string, agreementId?: string | null) => {
  const { error } = await supabase.rpc("admin_initiate_match_agreement", {
    _match_id: matchId,
    _agreement_id: agreementId ?? null,
  });
  if (error) throw error;
};

export const markMatchAgreementSigned = async (matchId: string) => {
  const { error } = await supabase.rpc("admin_mark_match_agreement_signed", { _match_id: matchId });
  if (error) throw error;
};

export const accreditMatch = async (matchId: string) => {
  const { error } = await supabase.rpc("admin_accredit_match", { _match_id: matchId });
  if (error) throw error;
};

export const markMatchPickedUp = async (matchId: string) => {
  const { error } = await supabase.rpc("admin_mark_match_picked_up", { _match_id: matchId });
  if (error) throw error;
};

export const cancelMatch = async (matchId: string, reason?: string) => {
  const { error } = await supabase.rpc("admin_cancel_match", {
    _match_id: matchId,
    _reason: reason ?? null,
  });
  if (error) throw error;
};

export const fetchDriverAccreditation = async (driverId: string) => {
  const { data, error } = await supabase.rpc("driver_accreditation_status", { _driver_id: driverId });
  if (error) throw error;
  return (data ?? {}) as {
    licence_document_id?: string | null;
    licence_status?: string | null;
    referee_count?: number;
  };
};
