import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

export class PhoneValidationError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'PhoneValidationError';
    this.code = code;
  }
}

export function normalizeToE164(phone: string, defaultCountry: CountryCode = 'US'): string {
  if (!phone) {
    throw new PhoneValidationError('Phone number is required', 'REQUIRED');
  }
  const parsed = parsePhoneNumberFromString(phone, defaultCountry);
  if (!parsed || !parsed.isValid()) {
    throw new PhoneValidationError('Invalid phone number format', 'INVALID_FORMAT');
  }
  return parsed.number;
}
