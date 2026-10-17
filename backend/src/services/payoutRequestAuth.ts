/**
 * Caller authentication for money-moving payout entry points.
 *
 * - Self-withdrawals: the caller must present a valid Supabase session and may
 *   only withdraw for themselves. The client-supplied owner id is never trusted.
 * - Weekly worker / scheduled operations: the caller must present the
 *   CRON_SECRET (constant-time compare). Missing configuration denies access.
 *   The cron secret proves the caller is the scheduler only; it grants no
 *   business approval, which remains an admin decision stored on the payout.
 */

import crypto from "crypto";
import { authenticateCaller } from "./fileUploadService";
import { PayoutError } from "./ownerPayoutWorkflow";

function headerValue(
  headers: Record<string, unknown> | undefined,
  name: string,
): string {
  const h = headers || {};
  const v = h[name] ?? h[name.toLowerCase()];
  return String(Array.isArray(v) ? v[0] ?? "" : v ?? "").trim();
}

export function verifyCronSecret(
  headers: Record<string, unknown> | undefined,
): boolean {
  const configured = (process.env.CRON_SECRET || "").trim();
  const provided = headerValue(headers, "x-cron-secret");
  if (!configured || !provided) return false;
  const a = crypto.createHash("sha256").update(provided).digest();
  const b = crypto.createHash("sha256").update(configured).digest();
  return crypto.timingSafeEqual(a, b);
}

export async function authenticateSelfWithdrawalCaller(
  headers: Record<string, unknown> | undefined,
  requestedOwnerId: unknown,
): Promise<{ ownerId: string }> {
  let caller;
  try {
    caller = await authenticateCaller(headerValue(headers, "authorization"));
  } catch (err: any) {
    throw new PayoutError(
      "unauthenticated",
      err?.message || "Authentication required",
      err?.statusCode || 401,
    );
  }

  const requested = String(requestedOwnerId ?? "").trim();
  if (requested && requested !== caller.userId) {
    throw new PayoutError(
      "forbidden",
      "Owner identity mismatch",
      403,
    );
  }
  return { ownerId: caller.userId };
}

export async function requireAdminCaller(
  headers: Record<string, unknown> | undefined,
): Promise<{ userId: string }> {
  let caller;
  try {
    caller = await authenticateCaller(headerValue(headers, "authorization"));
  } catch (err: any) {
    throw new PayoutError("unauthenticated", err?.message || "Authentication required", err?.statusCode || 401);
  }
  if (!caller.isAdmin) throw new PayoutError("forbidden", "Admin role required", 403);
  return { userId: caller.userId };
}
