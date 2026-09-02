/**
 * Production Webhook Security & Verification Helper
 * Verifies HMAC SHA-256 signatures for PayPal, Paystack, Sent.dm, and Twilio webhooks.
 */

export interface WebhookVerificationResult {
  valid: boolean;
  timestamp?: number;
  error?: string;
}

/**
 * Validates HMAC SHA-256 signatures across payment & CPaaS providers
 */
export async function verifyHmacSignature(
  rawPayload: string,
  signature: string,
  secretKey: string
): Promise<boolean> {
  if (!signature || !secretKey) return false;

  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secretKey);
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify", "sign"]
    );

    const signatureBytes = new Uint8Array(
      signature.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
    );

    return await crypto.subtle.verify(
      "HMAC",
      cryptoKey,
      signatureBytes,
      encoder.encode(rawPayload)
    );
  } catch (err) {
    console.error("[WebhookSecurity] Signature verification error:", err);
    return false;
  }
}

/**
 * Validates timestamp tolerances to prevent replay attacks (default: 5 minutes)
 */
export function isTimestampValid(
  timestampHeader: string | number,
  toleranceSeconds: number = 300
): boolean {
  const ts = typeof timestampHeader === "string" ? parseInt(timestampHeader, 10) : timestampHeader;
  if (isNaN(ts)) return false;

  const now = Math.floor(Date.now() / 1000);
  return Math.abs(now - ts) <= toleranceSeconds;
}
