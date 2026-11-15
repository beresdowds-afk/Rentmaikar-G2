import {
  delegateToBackendEmail,
  resolveInternalBridgeSecret,
  verifyStandardWebhookSignatureDeno,
} from "../_shared/backend-email-client.ts";

function jsonResponse(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function timingSafeMatch(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const rawBody = await req.text();
  const internalSecret = resolveInternalBridgeSecret();
  const providedSecret = (req.headers.get("x-rentmaikar-internal-secret") || "").trim();

  const hasValidInternalSecret = Boolean(internalSecret && timingSafeMatch(providedSecret, internalSecret));

  if (!hasValidInternalSecret) {
    const verification = await verifyStandardWebhookSignatureDeno(
      req.headers,
      rawBody,
      [
        Deno.env.get("RESEND_WEBHOOK_SIGNING_SECRET"),
        Deno.env.get("RESEND_WEBHOOK_SECRET"),
      ],
      "SuppressionWebhook",
    );

    if (!verification.ok) {
      const status = verification.reason?.includes("not configured") ? 500 : 401;
      return jsonResponse({ error: verification.reason || "Unauthorized" }, status);
    }
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "Invalid JSON payload" }, 400);
  }

  const payload = (parsed.data && typeof parsed.data === "object"
    ? (parsed.data as Record<string, unknown>)
    : parsed);

  if (!payload.email || !payload.reason) {
    return jsonResponse({ error: "Missing required fields: email, reason" }, 400);
  }

  const delegated = await delegateToBackendEmail("handle-email-suppression", payload);
  if (!delegated.ok) {
    return jsonResponse(
      { ok: false, error: String(delegated.data?.error || "Failed to process email suppression") },
      delegated.status >= 400 ? delegated.status : 502,
    );
  }

  return jsonResponse({ success: true, ok: true });
});
