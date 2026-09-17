// deno-lint-ignore-file no-explicit-any
// Resolves owner_id and vehicle_id required by payments/*_transactions inserts.
// Prefers rentals lookup, falls back to vehicles.owner_id, then to caller-provided values.

export interface PaymentContextInput {
  supabase: any;
  rentalId?: string | null;
  vehicleId?: string | null;
  ownerId?: string | null;
  purpose?: string | null;
}

export interface PaymentContext {
  rentalId: string | null;
  vehicleId: string | null;
  ownerId: string | null;
}

export async function resolvePaymentContext(
  input: PaymentContextInput,
): Promise<PaymentContext | { error: string }> {
  let vehicleId = input.vehicleId ?? null;
  let ownerId = input.ownerId ?? null;
  const rentalId = input.rentalId ?? null;
  const purpose = input.purpose ?? null;

  if (rentalId) {
    const { data: rental } = await input.supabase
      .from("rentals")
      .select("vehicle_id, owner_id")
      .eq("id", rentalId)
      .maybeSingle();
    if (rental) {
      vehicleId = vehicleId ?? rental.vehicle_id;
      ownerId = ownerId ?? rental.owner_id;
    }
  }

  if (vehicleId && !ownerId) {
    const { data: vehicle } = await input.supabase
      .from("vehicles")
      .select("owner_id")
      .eq("id", vehicleId)
      .maybeSingle();
    if (vehicle) ownerId = vehicle.owner_id;
  }

  // IoT device purchases do not require vehicle_id or rental_id
  if (purpose === "iot_device") {
    return { rentalId, vehicleId, ownerId };
  }

  if (!vehicleId || !ownerId) {
    return { error: "Unable to resolve vehicle_id/owner_id for payment context" };
  }
  return { rentalId, vehicleId, ownerId };
}
