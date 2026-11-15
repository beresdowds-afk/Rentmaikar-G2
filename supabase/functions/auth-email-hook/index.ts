import {
  delegateToBackendEmail,
  verifyStandardWebhookSignatureDeno,
} from "../_shared/backend-email-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, webhook-id, webhook-timestamp, webhook-signature, svix-id, svix-timestamp, svix-signature",
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const rawBody = await req.text();
  const verification = await verifyStandardWebhookSignatureDeno(
    req.headers,
    rawBody,
    [
      Deno.env.get("SUPABASE_AUTH_HOOK_SECRET"),
      Deno.env.get("SEND_EMAIL_HOOK_SECRET"),
      Deno.env.get("HOOK_SECRET"),
    ],
    "SupabaseAuth",
  );

  if (!verification.ok) {
    console.error("[auth-email-hook] Signature verification failed:", verification.reason);
    const status = verification.reason?.includes("not configured") ? 500 : 401;
    return jsonResponse({ error: verification.reason || "Invalid signature" }, status);
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "Invalid JSON payload" }, 400);
  }

  const delegated = await delegateToBackendEmail("auth-email-hook", payload, {
    correlationId: req.headers.get("webhook-id") || req.headers.get("svix-id"),
  });

  if (!delegated.ok) {
    console.error("[auth-email-hook] Backend delegation failed (fail-closed, no fallback):", delegated.status, delegated.data);
    return jsonResponse(
      {
        ok: false,
        error: String(delegated.data?.error || "Failed to deliver auth email via Resend backend gateway"),
      },
      delegated.status >= 400 ? delegated.status : 502,
    );
  }

  return jsonResponse({
    ok: true,
    delivered: true,
    provider: "resend",
    messageId: delegated.data?.messageId,
  });
});
