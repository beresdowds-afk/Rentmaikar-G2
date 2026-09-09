// Translates raw Postgres/edge-function errors raised while saving a phone
// number into clear, user-facing messages. The `profiles_phone_unique`
// constraint means the same number is already attached to another account.

const DUPLICATE_PHONE_MESSAGE =
  'That phone number is already linked to another account. Use a different number, or contact support if it belongs to you.';

const DUPLICATE_EMAIL_MESSAGE =
  'That email address is already linked to another account. Use a different email, or contact support if it belongs to you.';

export function friendlyPhoneError(err: unknown): string | null {
  const anyErr = err as { code?: string; message?: string; details?: string } | null;
  const raw = `${anyErr?.message ?? ''} ${anyErr?.details ?? ''}`;

  if (/profiles_phone_unique|phone.*already (in use|linked|registered)/i.test(raw)) {
    return DUPLICATE_PHONE_MESSAGE;
  }
  if (/profiles_email_unique/i.test(raw)) {
    return DUPLICATE_EMAIL_MESSAGE;
  }
  if (anyErr?.code === '23505' && /phone/i.test(raw)) {
    return DUPLICATE_PHONE_MESSAGE;
  }
  if (anyErr?.code === '23505' && /email/i.test(raw)) {
    return DUPLICATE_EMAIL_MESSAGE;
  }
  return null;
}

export const DUPLICATE_PHONE_TEXT = DUPLICATE_PHONE_MESSAGE;
