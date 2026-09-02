import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

export interface NormalizedPhone {
  /** E.164 formatted number, e.g. "+2348012345678". */
  e164: string;
  /** ISO 3166-1 alpha-2 country code parsed from the number. */
  country: CountryCode;
}

export class PhoneValidationError extends Error {
  code: 'invalid' | 'region_mismatch' | 'empty';
  constructor(code: 'invalid' | 'region_mismatch' | 'empty', message: string) {
    super(message);
    this.code = code;
    this.name = 'PhoneValidationError';
  }
}

/**
 * Parses a user-entered phone number and returns it in E.164 form together
 * with the country the number was parsed against. Callers should use this
 * before writing `profiles.phone` (or any other phone column) so every saved
 * value satisfies the DB `is_valid_e164` check.
 *
 * @param raw          User input; may or may not include the leading `+`.
 * @param expectedCountry Optional ISO country. When provided, the parsed
 *                     number's country must match — this prevents users
 *                     saving e.g. a Nigerian number while their selected
 *                     region is USA.
 */
export function normalizeToE164(
  raw: string | null | undefined,
  expectedCountry?: CountryCode | null,
): NormalizedPhone {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) {
    throw new PhoneValidationError('empty', 'Please enter a phone number.');
  }
  const withPlus = trimmed.startsWith('+') ? trimmed : `+${trimmed.replace(/[^\d]/g, '')}`;
  const parsed = parsePhoneNumberFromString(withPlus, expectedCountry ?? undefined);
  if (!parsed || !parsed.isValid()) {
    throw new PhoneValidationError(
      'invalid',
      'Enter a valid international phone number (e.g. +14155551234).',
    );
  }
  if (expectedCountry && parsed.country && parsed.country !== expectedCountry) {
    throw new PhoneValidationError(
      'region_mismatch',
      `Phone number country (${parsed.country}) does not match the selected region (${expectedCountry}).`,
    );
  }
  return {
    e164: parsed.number,
    country: (parsed.country ?? expectedCountry ?? 'US') as CountryCode,
  };
}

/** Safe wrapper that returns null instead of throwing. */
export function tryNormalizeToE164(
  raw: string | null | undefined,
  expectedCountry?: CountryCode | null,
): NormalizedPhone | null {
  try {
    return normalizeToE164(raw, expectedCountry ?? null);
  } catch {
    return null;
  }
}
