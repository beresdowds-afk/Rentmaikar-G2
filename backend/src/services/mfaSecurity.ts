import crypto from "crypto";
import { normalizeE164 } from "./phoneOtpService";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface MfaProfile {
  phone?: string | null;
  phone_verified?: boolean | null;
}

export interface MfaSettings {
  is_enabled?: boolean | null;
  phone_number?: string | null;
}

export function getVerifiedMfaPhone(
  profile: MfaProfile | null | undefined,
  requestedPhone?: unknown,
): string | null {
  if (!profile?.phone || profile.phone_verified !== true) return null;

  const phone = normalizeE164(profile.phone);
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) return null;

  if (
    requestedPhone !== undefined &&
    (typeof requestedPhone !== "string" ||
      normalizeE164(requestedPhone) !== phone)
  ) {
    return null;
  }
  return phone;
}

export function isMfaPhoneBound(
  settings: MfaSettings | null | undefined,
  verifiedPhone: string,
): boolean {
  return (
    !settings?.is_enabled ||
    (!!settings.phone_number &&
      normalizeE164(settings.phone_number) === verifiedPhone)
  );
}

export function getMfaSessionContext(authorizationHeader: string): string | null {
  const token = authorizationHeader.replace(/^Bearer\s+/i, "").trim();
  const payload = token.split(".")[1];
  if (!payload) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof claims.session_id !== "string" || !UUID_PATTERN.test(claims.session_id)) {
      return null;
    }
    return crypto.createHash("sha256").update(claims.session_id).digest("hex");
  } catch {
    return null;
  }
}

export function isMfaChallengeId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}
