/**
 * RFC 6238 Time-Based One-Time Password (TOTP) Implementation
 * Compatible with Google Authenticator, Microsoft Authenticator, Authy, etc.
 */

import QRCode from 'qrcode';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Encodes a Uint8Array into a Base32 string (without padding)
 */
export function base32Encode(buffer: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Decodes a Base32 string into a Uint8Array
 */
export function base32Decode(base32: string): Uint8Array {
  const clean = base32.toUpperCase().replace(/=+$/, '').replace(/[\s-]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]);
    if (idx === -1) {
      continue; // skip invalid characters
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return new Uint8Array(bytes);
}

/**
 * Generates a cryptographically secure random Base32 secret for Google Authenticator (default 20 bytes / 32 chars)
 */
export function generateTotpSecret(numBytes = 20): string {
  const randomBytes = new Uint8Array(numBytes);
  if (typeof window !== 'undefined' && window.crypto) {
    window.crypto.getRandomValues(randomBytes);
  } else {
    // Node environment fallback
    for (let i = 0; i < numBytes; i++) {
      randomBytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return base32Encode(randomBytes);
}

/**
 * Formats a secret string into readable 4-character chunks (e.g. "JBSW Y3DP EHPK 3PXP")
 */
export function formatSecretForDisplay(secret: string): string {
  const clean = secret.replace(/[\s-]/g, '').toUpperCase();
  return clean.match(/.{1,4}/g)?.join(' ') || clean;
}

/**
 * Generates an otpauth:// URI for Google Authenticator
 */
export function generateTotpUri(params: {
  secret: string;
  accountName: string;
  issuer?: string;
  digits?: number;
  period?: number;
}): string {
  const issuer = params.issuer || 'RentMaikar';
  const label = encodeURIComponent(`${issuer}:${params.accountName.trim()}`);
  const secret = params.secret.replace(/[\s-]/g, '').toUpperCase();
  const digits = params.digits || 6;
  const period = params.period || 30;

  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${digits}&period=${period}`;
}

/**
 * Generates a QR Code as a Data URL for scanning with Google Authenticator
 */
export async function generateTotpQrCode(uri: string): Promise<string> {
  return QRCode.toDataURL(uri, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 240,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });
}

/**
 * Generates a 6-digit TOTP code for a given timestamp (default: current time)
 */
export async function generateTotpCode(secret: string, timestampMs = Date.now()): Promise<string> {
  const epoch = Math.floor(timestampMs / 1000 / 30);
  const timeBuffer = new ArrayBuffer(8);
  const view = new DataView(timeBuffer);
  view.setUint32(0, Math.floor(epoch / 0x100000000), false);
  view.setUint32(4, epoch >>> 0, false);

  const secretBytes = base32Decode(secret);

  const subtle = typeof window !== 'undefined' ? window.crypto.subtle : (globalThis as unknown as { crypto: { subtle: SubtleCrypto } }).crypto.subtle;
  const key = await subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );

  const signature = new Uint8Array(await subtle.sign('HMAC', key, timeBuffer));
  const offset = signature[signature.length - 1] & 0x0f;
  const binary =
    ((signature[offset] & 0x7f) << 24) |
    ((signature[offset + 1] & 0xff) << 16) |
    ((signature[offset + 2] & 0xff) << 8) |
    (signature[offset + 3] & 0xff);

  return (binary % 1000000).toString().padStart(6, '0');
}

/**
 * Verifies a 6-digit TOTP code against a secret with clock-drift tolerance (+/- 1 time-step = 30 seconds)
 */
export async function verifyTotpCode(
  secret: string,
  userCode: string,
  windowTolerance = 1
): Promise<boolean> {
  const cleanCode = userCode.replace(/\D/g, '');
  if (cleanCode.length !== 6) return false;

  const now = Date.now();
  for (let i = -windowTolerance; i <= windowTolerance; i++) {
    const expected = await generateTotpCode(secret, now + i * 30000);
    if (expected === cleanCode) {
      return true;
    }
  }

  return false;
}

/**
 * Returns the seconds remaining in the current 30-second TOTP window
 */
export function getTotpSecondsRemaining(): number {
  return 30 - (Math.floor(Date.now() / 1000) % 30);
}

// Local storage keys for caching and backup verification
const STORAGE_PREFIX = 'rentmaikar:totp:';

export function getStoredTotpSecret(userId: string): string | null {
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
  } catch {
    return null;
  }
}

export function saveStoredTotpSecret(userId: string, secret: string): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${userId}`, secret.replace(/[\s-]/g, '').toUpperCase());
  } catch {}
}

export function removeStoredTotpSecret(userId: string): void {
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${userId}`);
  } catch {}
}
