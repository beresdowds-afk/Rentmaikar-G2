// Dynamic placeholder rendering for inbox replies (edge runtime copy of
// src/lib/reply-placeholders.ts, plus a server-side value resolver).

export type PlaceholderValues = Record<string, string | null | undefined>;

const PLACEHOLDER_PATTERN = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

export function renderPlaceholders(
  template: string,
  values: PlaceholderValues,
  options: { keepUnknown?: boolean } = {},
): string {
  if (!template) return "";
  const keepUnknown = options.keepUnknown ?? false;
  return template.replace(PLACEHOLDER_PATTERN, (match, rawToken: string) => {
    const value = values?.[String(rawToken).toLowerCase()];
    if (value === undefined || value === null || value === "") {
      return keepUnknown ? match : "";
    }
    return String(value);
  });
}

export function hasPlaceholders(template: string): boolean {
  return PLACEHOLDER_PATTERN.test(template || "");
}

function formatDate(value: unknown): string {
  if (!value) return "";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Resolves placeholder values for a conversation using a service-role client.
 * Never throws — missing data simply yields blank tokens.
 */
export async function resolvePlaceholderValues(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  conversationId: string,
): Promise<PlaceholderValues> {
  const values: PlaceholderValues = {
    today: formatDate(new Date().toISOString()),
  };

  try {
    const { data: conv } = await supabase
      .from("inbox_conversations")
      .select("user_id,user_name,user_email,user_phone,region")
      .eq("id", conversationId)
      .maybeSingle();

    if (!conv) return values;

    values.region = conv.region ?? "";
    values.customer_email = conv.user_email ?? "";
    values.customer_phone = conv.user_phone ?? "";
    let fullName: string = (conv.user_name || "").trim();

    if (conv.user_id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name,email,phone,preferred_country")
        .eq("id", conv.user_id)
        .maybeSingle();

      if (profile) {
        fullName = (profile.full_name || fullName || "").trim();
        values.customer_email = profile.email || values.customer_email;
        values.customer_phone = profile.phone || values.customer_phone;
        values.region = values.region || profile.preferred_country || "";
      }

      const { data: rentals } = await supabase
        .from("rentals")
        .select(
          "vehicle_id,start_date,end_date,extended_end_date,daily_rate,currency,payment_frequency,pickup_location,status",
        )
        .eq("driver_id", conv.user_id)
        .order("start_date", { ascending: false })
        .limit(5);

      const rental = (rentals || []).find((r: any) => r.status === "active") ?? (rentals || [])[0];

      let vehicleId: string | null = null;
      if (rental) {
        vehicleId = rental.vehicle_id;
        values.booking_start = formatDate(rental.start_date);
        values.booking_end = formatDate(rental.extended_end_date || rental.end_date);
        values.daily_rate = rental.daily_rate != null ? String(rental.daily_rate) : "";
        values.currency = rental.currency || "";
        values.payment_frequency = rental.payment_frequency || "";
        values.pickup_location = rental.pickup_location || "";
      } else {
        const { data: booking } = await supabase
          .from("vehicle_booking_requests")
          .select("vehicle_id,start_date,end_date,offered_rate,offer_currency")
          .eq("driver_id", conv.user_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (booking) {
          vehicleId = booking.vehicle_id;
          values.booking_start = formatDate(booking.start_date);
          values.booking_end = formatDate(booking.end_date);
          values.daily_rate = booking.offered_rate != null ? String(booking.offered_rate) : "";
          values.currency = booking.offer_currency || "";
        }
      }

      if (vehicleId) {
        const { data: vehicle } = await supabase
          .from("vehicles")
          .select("make,model,year,license_plate,pickup_location,pickup_address")
          .eq("id", vehicleId)
          .maybeSingle();

        if (vehicle) {
          values.vehicle = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");
          values.vehicle_plate = vehicle.license_plate || "";
          values.pickup_location =
            values.pickup_location || vehicle.pickup_location || vehicle.pickup_address || "";
        }
      }
    }

    values.customer_name = fullName || "there";
    values.first_name = (fullName ? fullName.split(" ")[0] : "") || "there";
  } catch (err) {
    console.error("[reply-placeholders] resolve failed", err);
  }

  return values;
}
