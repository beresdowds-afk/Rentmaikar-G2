/**
 * Single source of truth for home-address rules.
 *
 * These mirror the database triggers `enforce_driver_address_required` and
 * `enforce_profile_address_rules`:
 *   - drivers  -> required, trimmed length between 5 and 200 characters
 *   - owners   -> optional, but capped at 200 characters when supplied
 *   - placeholders ("N/A", "none", "nil", "test") are rejected outright
 *
 * Every registration/profile surface imports from here — including the
 * Capacitor iOS/Android shells, which render the very same React screens — so
 * the rules can never drift between platforms.
 */
import * as z from "zod";

export const ADDRESS_MIN = 5;
export const ADDRESS_MAX = 200;

const PLACEHOLDER_RE = /^(n\/?a|none|nil|test)$/i;

export type AddressTone = "error" | "warn" | "ok";

export interface AddressHint {
  tone: AddressTone;
  msg: string;
}

/** Returns an error message, or `null` when the value is acceptable. */
export function validateAddress(value: string, isDriver: boolean): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return isDriver ? "Home address is required for drivers." : null;
  }
  if (trimmed.length < ADDRESS_MIN) {
    const missing = ADDRESS_MIN - trimmed.length;
    return `Add ${missing} more character${missing === 1 ? "" : "s"} — include your street and house number.`;
  }
  if (trimmed.length > ADDRESS_MAX) {
    return `Too long by ${trimmed.length - ADDRESS_MAX} characters.`;
  }
  if (PLACEHOLDER_RE.test(trimmed)) {
    return "Enter your real residential address — placeholders are rejected.";
  }
  return null;
}

/**
 * Live hint for the input's `aria-live` region: errors, soft warnings and the
 * success confirmation. Returns `null` before the field has been touched.
 */
export function addressHint(
  value: string,
  { isDriver, touched }: { isDriver: boolean; touched: boolean },
): AddressHint | null {
  const trimmed = (value ?? "").trim();
  if (!touched) return null;

  const error = validateAddress(trimmed, isDriver);
  if (error) return { tone: "error", msg: error };

  if (!trimmed) {
    return { tone: "ok", msg: "Optional for owners — add it to speed up handover." };
  }
  if (!/\d/.test(trimmed)) {
    return {
      tone: "warn",
      msg: "Tip: include your house or apartment number so handover isn’t delayed.",
    };
  }
  return {
    tone: "ok",
    msg: "Looks good — this address will be used for verification and handover.",
  };
}

/** Zod field for surfaces where the address is mandatory (drivers). */
export const requiredAddressSchema = z
  .string()
  .trim()
  .min(ADDRESS_MIN, `Home address is required (at least ${ADDRESS_MIN} characters)`)
  .max(ADDRESS_MAX, `Address must be less than ${ADDRESS_MAX} characters`)
  .refine(
    (v) => !PLACEHOLDER_RE.test(v),
    "Enter your real residential address — placeholders are rejected.",
  );

/** Zod field for surfaces where the address is optional (owners). */
export const optionalAddressSchema = z
  .string()
  .trim()
  .max(ADDRESS_MAX, `Address must be less than ${ADDRESS_MAX} characters`)
  .refine(
    (v) => !v || !PLACEHOLDER_RE.test(v),
    "Enter your real residential address — placeholders are rejected.",
  )
  .optional()
  .or(z.literal(""));
