type SupabaseClientLike = any;

export type CanonicalRegion = string | null;

export async function resolveCanonicalRegion(
  supabase: SupabaseClientLike,
  phone: string,
): Promise<CanonicalRegion> {
  const normalized = (phone || "")
    .replace("whatsapp:", "")
    .replace(/[\s()-]/g, "");

  if (!normalized) return null;

  const { data, error } =
    await supabase.rpc("get_allowed_regions");

  if (error || !Array.isArray(data)) {
    console.warn(
      "[region-routing] get_allowed_regions failed:",
      error,
    );
    return null;
  }

  const match = data
    .filter((row: any) => {
      const prefix = String(row?.phone_prefix || "").trim();
      return prefix && normalized.startsWith(prefix);
    })
    .sort(
      (a: any, b: any) =>
        String(b?.phone_prefix || "").length -
        String(a?.phone_prefix || "").length,
    )[0];

  return match?.value
    ? String(match.value).trim()
    : null;
}

export async function resolveConfiguredMessagingFallback(
  supabase: SupabaseClientLike,
  phone: string,
  channel: "sms" | "whatsapp",
): Promise<"twilio" | "termii" | null> {
  const normalized = (phone || "")
    .replace("whatsapp:", "")
    .replace(/[\s()-]/g, "");

  if (!normalized) return null;

  const { data: regions, error: regionError } =
    await supabase.rpc("get_allowed_regions");

  if (regionError || !Array.isArray(regions)) {
    return null;
  }

  const match = regions
    .filter((row: any) => {
      const prefix = String(row?.phone_prefix || "").trim();
      return prefix && normalized.startsWith(prefix);
    })
    .sort(
      (a: any, b: any) =>
        String(b?.phone_prefix || "").length -
        String(a?.phone_prefix || "").length,
    )[0];

  if (!match?.phone_prefix) {
    return null;
  }

  const { data: provider, error: providerError } =
    await supabase
      .from("communication_providers")
      .select("sms_provider, whatsapp_provider, is_active")
      .eq("country_code_prefix", String(match.phone_prefix).trim())
      .eq("is_active", true)
      .maybeSingle();

  if (providerError || !provider) {
    return null;
  }

  const configured =
    channel === "whatsapp"
      ? provider.whatsapp_provider
      : provider.sms_provider;

  if (configured === "twilio" || configured === "termii") {
    return configured;
  }

  return null;
}
