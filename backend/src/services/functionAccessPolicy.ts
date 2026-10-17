/**
 * Central server-side access policy for backend function routes.
 *
 * Enforced in the gateway BEFORE any side effect or upstream dispatch.
 * Resource-specific checks (ownership, state) remain in each handler.
 *
 *  - admin:         verified Admin / Admin Assistant session
 *  - authenticated: any verified session (identity always comes from the token)
 *  - cron_or_admin: valid X-Cron-Secret (scheduled jobs) or verified admin
 */
import { authenticateCaller, type AuthContext } from "./fileUploadService";
import { verifyCronSecret } from "./payoutRequestAuth";

export type AccessLevel = "admin" | "authenticated" | "cron_or_admin";

export const FUNCTION_ACCESS: Record<string, AccessLevel> = {
  // Device / infrastructure administration
  "traccar-admin": "admin",
  "hologram-admin": "admin",
  "hologram-sync": "admin",
  "iot-admin": "admin",
  "emqx-monitoring": "admin",
  "emqx-secret-rotation": "admin",
  "sarekon-admin": "admin",
  "billing-reconciliation": "admin",
  // Scheduled jobs
  "iot-auto-provision": "cron_or_admin",
  "iot-scheduled-sync": "cron_or_admin",
  "process-inspection-reminders": "cron_or_admin",
  "sarekon-location-worker": "cron_or_admin",
  // User-initiated operations
  "create-paypal-order": "authenticated",
  "capture-paypal-order": "authenticated",
  "create-paystack-transaction": "authenticated",
  "proxy-create-payment": "authenticated",
  "verify-paystack-transaction": "authenticated",
  "create-opay-order": "authenticated",
  "verify-opay-order": "authenticated",
  "generate-vehicle-mqtt-token": "authenticated",
  "submit-vehicle-for-review": "authenticated",
};

export class AccessDenied extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "AccessDenied";
    this.statusCode = statusCode;
  }
}

export interface AccessDecision {
  caller: AuthContext | null;
  via: "session" | "cron" | "none";
}

/** Returns null policy => no gate here (handler enforces its own auth). */
export async function enforceFunctionAccess(
  functionName: string,
  headers: Record<string, unknown>,
): Promise<AccessDecision | null> {
  const level = FUNCTION_ACCESS[functionName];
  if (!level) return null;

  if (level === "cron_or_admin" && verifyCronSecret(headers)) {
    return { caller: null, via: "cron" };
  }

  const raw = headers["authorization"];
  const header = Array.isArray(raw) ? String(raw[0] ?? "") : String(raw ?? "");
  let caller: AuthContext;
  try {
    caller = await authenticateCaller(header);
  } catch (err: any) {
    throw new AccessDenied(err?.message || "Authentication required", err?.statusCode || 401);
  }
  if (level !== "authenticated" && !caller.isAdmin) {
    throw new AccessDenied("Forbidden", 403);
  }
  return { caller, via: "session" };
}
