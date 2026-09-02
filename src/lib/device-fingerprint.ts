/**
 * Lightweight, privacy-preserving device fingerprint used for withdrawal
 * risk scoring. It is a stable hash of coarse device characteristics plus a
 * locally-persisted random salt — no tracking across sites, no PII.
 */
const STORAGE_KEY = "rentmaikar_device_salt";

function getSalt(): string {
  try {
    let salt = localStorage.getItem(STORAGE_KEY);
    if (!salt) {
      salt = crypto.randomUUID();
      localStorage.setItem(STORAGE_KEY, salt);
    }
    return salt;
  } catch {
    return "no-storage";
  }
}

async function sha256(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function getDeviceFingerprint(): Promise<string> {
  const parts = [
    getSalt(),
    navigator.userAgent,
    navigator.language,
    String(screen.width),
    String(screen.height),
    String(screen.colorDepth),
    String(new Date().getTimezoneOffset()),
    String(navigator.hardwareConcurrency ?? 0),
  ];
  try {
    return (await sha256(parts.join("|"))).slice(0, 40);
  } catch {
    return getSalt();
  }
}

export function getUserAgentSummary(): string {
  return navigator.userAgent.slice(0, 200);
}
