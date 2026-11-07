/**
 * Central, default-deny access policy for backend and Supabase function routes.
 * Resource ownership checks remain in the individual handlers.
 */
import crypto from "crypto";
import { ALL_EDGE_FUNCTIONS } from "./supabaseService";
import { authenticateCaller, type AuthContext } from "./fileUploadService";
import { verifyCronSecret } from "./payoutRequestAuth";

export type AccessLevel =
  | "public"
  | "authenticated"
  | "owner"
  | "driver"
  | "support"
  | "admin"
  | "cron_or_admin"
  | "service_or_admin"
  | "service"
  | "internal";

export type AccessDecision = {
  caller: AuthContext | null;
  via: "public" | "session" | "cron" | "service";
};

const policy: Record<string, AccessLevel> = Object.fromEntries(
  ALL_EDGE_FUNCTIONS.map((name) => [name, "authenticated" as const]),
);

function classify(level: AccessLevel, names: string[]): void {
  for (const name of names) policy[name] = level;
}

// Cloud Run-only routes are also exact allowlisted names.
classify("authenticated", [
  "google-sso-auth-email",
  "provision-user-account",
  "proxy-create-payment",
  "phone-otp-custom",
  "verify-phone",
  "send-2fa-code",
  "get-inspection-findings",
  "update-inspection-finding",
  "voice-twiml-dial",
  "initiate-voip-call",
  "end-voip-call",
  "get-voip-call-status",
  "process-call-recording",
  "incoming-call-forward",
  "voice-call-request",
  "voip-call-transcript-log",
  "sarekon-resync-device",
  "sarekon-sync-device-imei",
  "resync-device-imei",
  "force-resync-sarekon-device",
  "process-owner-payouts",
  "reconcile-owner-payout",
  "list-inbound-emails",
  "get-inbound-email",
  "get-inbound-attachment-url",
  "retry-inbound-email",
  "upload-file",
  "delete-file",
  "get-file-url",
  "initiate-owner-withdrawal",
  "owner-withdrawal-data",
  "submit-vehicle-for-review",
]);
classify("support", ["get-inspection-findings", "update-inspection-finding"]);
classify("public", ["phone-otp-custom", "verify-phone"]);
classify("public", ["get-vapid-public-key"]);
classify("admin", [
  "admin-create-user",
  "admin-delete-users",
  "admin-set-user-active",
  "activate-subscription",
  "create-paystack-recipient",
  "billing-reconciliation",
  "check-payment-health",
  "case-send-sms",
  "comms-test-console",
  "email-health",
  "email-lifecycle-test",
  "test-email-lifecycle",
  "emqx-monitoring",
  "emqx-secret-rotation",
  "export-user-documents",
  "generate-daily-tasks",
  "generate-vehicle-mqtt-token",
  "get-recording-url",
  "hologram-admin",
  "hologram-sync",
  "iot-admin",
  "iot-offline-alerts",
  "generate-api-key",
  "get-paypal-config",
  "get-psp-config",
  "list-inbound-emails",
  "get-inbound-email",
  "get-inbound-attachment-url",
  "retry-inbound-email",
  "process-owner-payouts",
  "process-payment-defaults",
  "process-payment-unlock",
  "process-predue-reminders",
  "persona-provision-template",
  "persona-reconcile",
  "persona-expiry-scan",
  "persona-send-reverification",
  "provider-billing-sync",
  "provider-health-alerts",
  "reconcile-payments",
  "reconcile-rental-terms",
  "reconcile-settlements",
  "reprocess-email-dlq",
  "reprocess-sms-dlq",
  "retry-event-notifications",
  "sarekon-admin",
  "send-email-reply",
  "send-agreement-email",
  "send-approval-notification",
  "send-booking-reminders",
  "send-incident-notification",
  "send-in-app-message",
  "send-inbox-reply",
  "send-outbound-email",
  "send-order-notification",
  "send-payment-notification",
  "send-price-notification",
  "send-push-notification",
  "send-reconciliation-alert",
  "send-shipping-notification",
  "send-task-notification",
  "send-transactional-email",
  "test-email-delivery",
  "test-email-forward",
  "traccar-admin",
  "twilio-test-send",
  "voice-twiml-config",
  "test-email-lifecycle",
  "reconcile-owner-payout",
  "sarekon-resync-device",
  "sarekon-sync-device-imei",
  "resync-device-imei",
  "force-resync-sarekon-device",
]);
classify("owner", [
  "initiate-owner-withdrawal",
  "owner-withdrawal-data",
  "process-owner-withdrawals",
  "initiate-paypal-payout",
  "initiate-paystack-transfer",
  "refresh-export-download-url",
]);
classify("driver", ["driver-vehicle-command", "voice-access-token"]);
classify("service_or_admin", [
  "send-email-notification",
  "send-sms-notification",
  "notify-withdrawal",
]);
classify("internal", [
  "accident-emergency-dispatch",
  "auth-email-hook",
  "dispatch-event-notifications",
  "email-webhook",
  "manychat-webhook",
  "mqtt-ingestion-worker",
  "opay-webhook",
  "paypal-webhook",
  "persona-webhook",
  "paystack-webhook",
  "recording-status-callback",
  "sent-inbound",
  "sent-status",
  "social-inbox-webhook",
  "termii-webhook",
  "twilio-webhook",
  "voip-status-callback",
  "whatchimp-webhook",
]);
classify("service", ["telemetry-ingest"]);
classify("admin", ["telemetry-dispatch"]);
classify("cron_or_admin", [
  "expire-call-ins",
  "gps-worker-watchdog",
  "iot-auto-provision",
  "iot-scheduled-sync",
  "process-expiry-notifications",
  "process-inspection-reminders",
  "send-booking-reminders",
  "notify-training-review",
  "sarekon-location-worker",
  "telemetry-health-monitor",
  "training-compliance-reminders",
]);

classify("driver", ["driver-vehicle-command"]);

export const FUNCTION_ACCESS: Readonly<Record<string, AccessLevel>> =
  Object.freeze(policy);

export function getFunctionAccessLevel(
  functionName: string,
): AccessLevel | undefined {
  return Object.prototype.hasOwnProperty.call(FUNCTION_ACCESS, functionName)
    ? FUNCTION_ACCESS[functionName]
    : undefined;
}

export class AccessDenied extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "AccessDenied";
    this.statusCode = statusCode;
  }
}

function headerValue(headers: Record<string, unknown>, name: string): string {
  const raw = headers[name] ?? headers[name.toLowerCase()];
  return String(Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "")).trim();
}

function secretMatches(provided: string, configured: string): boolean {
  if (!provided || !configured) return false;
  const a = crypto.createHash("sha256").update(provided).digest();
  const b = crypto.createHash("sha256").update(configured).digest();
  return crypto.timingSafeEqual(a, b);
}

function hasRole(caller: AuthContext, roles: string[]): boolean {
  const callerRoles = caller.roles?.length ? caller.roles : [caller.role];
  return callerRoles.some((role) => roles.includes(role));
}

export function isAuthorizedForAccessLevel(
  level: AccessLevel,
  caller: AuthContext | null,
): boolean {
  if (level === "public") return true;
  if (!caller) return false;
  switch (level) {
    case "authenticated":
      return Boolean(caller.roles?.length || caller.role !== "unassigned");
    case "owner":
      return caller.isAdmin || hasRole(caller, ["owner"]);
    case "driver":
      return hasRole(caller, ["driver"]);
    case "support":
      return (
        caller.isAdmin || hasRole(caller, ["inspector", "driver", "owner"])
      );
    case "admin":
      return caller.isAdmin;
    case "cron_or_admin":
    case "service_or_admin":
      return caller.isAdmin;
    case "service":
    case "internal":
      return false;
  }
}

export function isResourceOwner(
  caller: AuthContext,
  resourceOwnerId: unknown,
): boolean {
  return (
    caller.isAdmin || caller.userId === String(resourceOwnerId ?? "").trim()
  );
}

export function isResourceParticipant(
  caller: AuthContext,
  resourceDriverId: unknown,
  resourceOwnerId: unknown,
): boolean {
  return (
    caller.userId === String(resourceDriverId ?? "").trim() ||
    caller.userId === String(resourceOwnerId ?? "").trim()
  );
}

function auditAccess(
  functionName: string,
  decision: "allow" | "deny",
  outcome: string,
  callerId: string | null,
  correlationId: string,
): void {
  console.info(
    JSON.stringify({
      type: "function_access_audit",
      actor: callerId,
      function: functionName,
      decision,
      correlationId,
      outcome,
    }),
  );
}

/**
 * Resolves the session from the verified Supabase JWT; identity is never read
 * from the request body. Unknown function names are denied by default.
 */
export async function enforceFunctionAccess(
  functionName: string,
  headers: Record<string, unknown>,
  authenticate: typeof authenticateCaller = authenticateCaller,
): Promise<AccessDecision> {
  const correlationId =
    headerValue(headers, "x-correlation-id") ||
    headerValue(headers, "x-request-id") ||
    crypto.randomUUID();
  const level = getFunctionAccessLevel(functionName);
  if (!level) {
    auditAccess(functionName, "deny", "unknown_function", null, correlationId);
    throw new AccessDenied("Unknown or unauthorized function", 404);
  }

  if (level === "public") {
    auditAccess(functionName, "allow", "public", "public", correlationId);
    return { caller: null, via: "public" };
  }

  if (level === "internal") {
    const secret = headerValue(headers, "x-rentmaikar-internal-secret");
    const configured = process.env.RENTMAIKAR_INTERNAL_SERVICE_SECRET || "";
    if (!secretMatches(secret, configured)) {
      auditAccess(
        functionName,
        "deny",
        "internal_identity_required",
        "unauthenticated",
        correlationId,
      );
      throw new AccessDenied("Internal service authentication required", 401);
    }
    auditAccess(
      functionName,
      "allow",
      "internal_service",
      "internal-service",
      correlationId,
    );
    return { caller: null, via: "service" };
  }

  if (level === "cron_or_admin" && verifyCronSecret(headers)) {
    auditAccess(functionName, "allow", "cron", "cron", correlationId);
    return { caller: null, via: "cron" };
  }

  if (level === "service") {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    const presented = headerValue(headers, "authorization")
      .replace(/^Bearer\s+/i, "")
      .trim();
    if (secretMatches(presented, serviceKey)) {
      auditAccess(functionName, "allow", "service", "service", correlationId);
      return { caller: null, via: "service" };
    }

    const internalSecret = headerValue(headers, "x-rentmaikar-internal-secret");
    if (
      secretMatches(
        internalSecret,
        process.env.RENTMAIKAR_INTERNAL_SERVICE_SECRET || "",
      )
    ) {
      auditAccess(
        functionName,
        "allow",
        "internal_service",
        "internal-service",
        correlationId,
      );
      return { caller: null, via: "service" };
    }

    auditAccess(
      functionName,
      "deny",
      "service_identity_required",
      "unauthenticated",
      correlationId,
    );
    throw new AccessDenied("Service authentication required", 401);
  }

  if (level === "service_or_admin") {
    const serviceSecret = headerValue(headers, "x-rentmaikar-internal-secret");
    if (
      secretMatches(
        serviceSecret,
        process.env.RENTMAIKAR_INTERNAL_SERVICE_SECRET || "",
      )
    ) {
      auditAccess(
        functionName,
        "allow",
        "internal_service",
        "internal-service",
        correlationId,
      );
      return { caller: null, via: "service" };
    }
  }

  let caller: AuthContext;
  try {
    caller = await authenticate(headerValue(headers, "authorization"));
  } catch (error: any) {
    auditAccess(
      functionName,
      "deny",
      "authentication_failed",
      null,
      correlationId,
    );
    throw new AccessDenied(
      "Authentication required",
      [403, 503].includes(error?.statusCode) ? error.statusCode : 401,
    );
  }

  if (!isAuthorizedForAccessLevel(level, caller)) {
    auditAccess(
      functionName,
      "deny",
      "role_not_authorized",
      caller.userId,
      correlationId,
    );
    throw new AccessDenied("Forbidden", 403);
  }

  auditAccess(functionName, "allow", "session", caller.userId, correlationId);
  return { caller, via: "session" };
}

export function auditFunctionOutcome(
  functionName: string,
  decision: "allow" | "deny",
  outcome: string,
  actor: string | null,
  correlationId: string,
): void {
  auditAccess(functionName, decision, outcome, actor, correlationId);
}
