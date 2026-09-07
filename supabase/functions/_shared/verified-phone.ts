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

  let phone = data?.phone;
  let phoneVerified = data?.phone_verified;

  // If profile is missing phone or verification flag, check auth.users directly
  if (!phone || !phoneVerified) {
    try {
      const { data: authData } = await supabase.auth.admin.getUserById(userId);
      const authUser = authData?.user;
      if (authUser?.phone) {
        phone = authUser.phone;
        if (authUser.phone_confirmed_at || authUser.user_metadata?.phone_verified) {
          phoneVerified = true;
          // Sync back to profile to avoid future desyncs
          await supabase
            .from("profiles")
            .update({ phone: authUser.phone, phone_verified: true })
            .eq("user_id", userId);
        }
      }
    } catch {
      // Ignore admin lookup failure
    }
  }

  // Admin bypass
  try {
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (roles?.some((r: any) => r.role === "admin")) {
      return { ok: true, phone: phone || "admin" };
    }
  } catch {
    // Continue with normal check
  }

  if (!phone) {
    return {
      ok: false,
      status: 428,
      error: "Add and verify a phone number before withdrawing funds",
    };
  }
  if (!phoneVerified) {
    return {
      ok: false,
      status: 428,
      error: "Verify your phone number before withdrawing funds",
      phone: phone,
    };
  }
  return { ok: true, phone: phone };
}
