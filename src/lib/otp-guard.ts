/**
 * OTP / verification-code content guard.
 *
 * One-time passcodes must NEVER be delivered through the in-app messaging
 * channel (app inbox + web push). They are only valid over SMS, WhatsApp,
 * voice or email, where possession of the endpoint is what proves identity.
 * An in-app message is delivered to an already-authenticated session, so it
 * would defeat the purpose of the second factor.
 */

const OTP_PATTERNS: RegExp[] = [
  /\b(otp|one[-\s]?time (pass)?code|one[-\s]?time password)\b/i,
  /\b(verification|security|auth(entication)?|login|sign[-\s]?in|confirmation)\s+code\b/i,
  /\bcode\s*[:#-]?\s*\d{4,8}\b/i,
  /\b\d{4,8}\s+is\s+your\b/i,
  /\byour\s+(code|pin)\b/i,
  /\b2fa\b/i,
  /\btwo[-\s]?factor\b/i,
];

const OTP_CATEGORIES = ['otp', '2fa', 'verification', 'auth', 'security_code'];

export function looksLikeOtpMessage(text?: string | null, category?: string | null): boolean {
  if (category && OTP_CATEGORIES.includes(category.trim().toLowerCase())) return true;
  const value = (text ?? '').trim();
  if (!value) return false;
  return OTP_PATTERNS.some((re) => re.test(value));
}

export const OTP_IN_APP_BLOCK_MESSAGE =
  'One-time passcodes cannot be sent through in-app messaging. Use SMS, WhatsApp or email for verification codes.';
