// deno-lint-ignore-file no-explicit-any
import { corsHeaders } from "../_shared/cors.ts";
import {
  ensureOpayConfig,
  getOpayConfig,
  isOpayConfigured,
  opayConfigSource,
  opayBaseUrl,
  resolveOpayEnv,
} from "../_shared/opay-client.ts";
import { ensurePayPalConfig, getPayPalConfig } from "../_shared/paypal-client.ts";

/**
 * Public PSP capability probe used by checkout components *and* by the admin
 * payment-settings screen ("recheck configuration"). Only non-secret values are
 * ever returned: merchant/public/client IDs, the resolved environment and where
 * that configuration came from (admin panel vs deployed secret).
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  await Promise.all([ensureOpayConfig(), ensurePayPalConfig()]);

  const paystackPublic = Deno.env.get("PAYSTACK_PUBLIC_KEY") ?? "";
  const opay = getOpayConfig();
  const opayEnv = resolveOpayEnv();
  const paypal = getPayPalConfig();

  return new Response(
    JSON.stringify({
      paystack: {
        configured: Boolean(paystackPublic && Deno.env.get("PAYSTACK_SECRET_KEY")),
        publicKey: paystackPublic,
      },
      opay: {
        configured: isOpayConfigured(),
        merchantId: opay?.merchantId ?? "",
        publicKey: opay?.publicKey ?? "",
        environment: opayEnv,
        testMode: opayEnv !== "live",
        baseUrl: opayBaseUrl(opayEnv),
        source: opayConfigSource(),
        missing: [
          opay?.merchantId ? null : "merchant_id",
          opay?.publicKey ? null : "public_key",
          opay?.secretKey ? null : "secret_key",
        ].filter(Boolean),
      },
      paypal: {
        configured: Boolean(paypal),
        clientId: paypal?.clientId ?? "",
        mode: paypal?.mode ?? "sandbox",
        testMode: (paypal?.mode ?? "sandbox") !== "live",
        baseUrl: paypal?.base ?? "",
        webhookConfigured: Boolean(Deno.env.get("PAYPAL_WEBHOOK_ID")),
      },
      checkedAt: new Date().toISOString(),
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
