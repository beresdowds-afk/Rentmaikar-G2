// Phone verification is NOT required to send or receive SMS/WhatsApp messages,
// but it IS compulsory before any owner withdrawal can move money.
// deno-lint-ignore-file no-explicit-any

export interface VerifiedPhoneCheck {
  ok: boolean;
  status?: number;
  error?: string;
  phone?: string | null;
}

export async function requireVerifiedPhone(
  supabase: any,
  userId: string,
): Promise<VerifiedPhoneCheck> {
  const { data, error } = await supabase
    .from("profiles")
    .select("phone, phone_verified")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return { ok: false, status: 500, error: error.message };
  if (!data?.phone) {
    return {
      ok: false,
      status: 428,
      error: "Add and verify a phone number before withdrawing funds",
    };
  }
  if (!data.phone_verified) {
    return {
      ok: false,
      status: 428,
      error: "Verify your phone number before withdrawing funds",
      phone: data.phone,
    };
  }
  return { ok: true, phone: data.phone };
}
