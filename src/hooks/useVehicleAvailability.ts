import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AvailabilityConflict {
  kind: "request" | "rental";
  start_date: string;
  end_date: string | null;
}

export interface AvailabilityResult {
  available: boolean;
  reason?: string;
  conflicts: AvailabilityConflict[];
}

/**
 * Server-side availability check for a vehicle over a date range.
 * Mirrors the database trigger that blocks overlapping booking requests.
 */
export const useVehicleAvailability = (
  vehicleId: string | undefined,
  startDate: string,
  endDate: string,
  enabled = true,
) =>
  useQuery({
    queryKey: ["vehicle-availability", vehicleId, startDate, endDate],
    enabled: Boolean(enabled && vehicleId && startDate && endDate && endDate >= startDate),
    staleTime: 15_000,
    queryFn: async (): Promise<AvailabilityResult> => {
      const { data, error } = await supabase.rpc("check_vehicle_booking_availability", {
        _vehicle_id: vehicleId as string,
        _start: startDate,
        _end: endDate,
      });
      if (error) throw error;
      const result = (data ?? {}) as any;
      return {
        available: Boolean(result.available),
        reason: result.reason,
        conflicts: (result.conflicts ?? []) as AvailabilityConflict[],
      };
    },
  });

/** Turns a database overlap error into a message a driver can act on. */
export const describeBookingError = (message?: string | null) => {
  if (!message) return "Please try again.";
  if (message.includes("BOOKING_DATES_UNAVAILABLE")) {
    const detail = message.split("BOOKING_DATES_UNAVAILABLE:")[1]?.trim();
    return `Those dates aren't available — ${detail || "the vehicle is already booked for part of that period."} Please pick different dates.`;
  }
  return message;
};

export const formatConflicts = (conflicts: AvailabilityConflict[]) =>
  conflicts
    .map((c) => `${c.kind === "rental" ? "Rented" : "Requested"} ${c.start_date} → ${c.end_date ?? "open-ended"}`)
    .join(", ");
