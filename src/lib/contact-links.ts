/**
 * Contact link helpers — hardened E.164 phone-number handling for
 * WhatsApp (wa.me) and SMS (sms:+) deep links.
 *
 * Rules:
 * - Digits only, optional leading `+` on input.
 * - E.164: 8–15 digits, no leading zero after country code.
 * - wa.me: no `+`, digits only, optional URL-encoded prefilled text.
 * - sms:+: keep the `+` for cross-device (iOS/Android/desktop) reliability.
 * - Returns `null` for invalid input so callers can render a disabled state
 *   instead of a broken link (never silently fall back to the old design).
 */

const MIN_E164_DIGITS = 8;
const MAX_E164_DIGITS = 15;
const MAX_PREFILL_LENGTH = 1000;

export function normalizeE164Digits(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < MIN_E164_DIGITS || digits.length > MAX_E164_DIGITS) return null;
  if (digits.startsWith("0")) return null; // country code cannot start with 0
  return digits;
}

export function toE164(raw: string | null | undefined): string | null {
  const digits = normalizeE164Digits(raw);
  return digits ? `+${digits}` : null;
}

export function isValidE164(raw: string | null | undefined): boolean {
  return normalizeE164Digits(raw) !== null;
}

export function buildWhatsAppLink(
  raw: string | null | undefined,
  prefill?: string,
): string | null {
  const digits = normalizeE164Digits(raw);
  if (!digits) return null;
  const base = `https://wa.me/${digits}`;
  if (!prefill) return base;
  const clean = prefill.trim().slice(0, MAX_PREFILL_LENGTH);
  if (!clean) return base;
  return `${base}?text=${encodeURIComponent(clean)}`;
}

export function buildSmsLink(raw: string | null | undefined): string | null {
  const e164 = toE164(raw);
  return e164 ? `sms:${e164}` : null;
}
