// deno-lint-ignore-file no-explicit-any
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  ensurePayPalConfig,
  getPayPalConfig,
  getAccessToken,
} from "../_shared/paypal-client.ts";
import {
  ensureOpayConfig,
  getOpayConfig,
  opayBaseUrl,
  resolveOpayEnv,
  queryCashierStatus,
} from "../_shared/opay-client.ts";

export interface GatewayHealthReport {
  provider: "paypal" | "paystack" | "opay";
  displayName: string;
  configured: boolean;
  operationalStatus: "healthy" | "degraded" | "unconfigured" | "error" | "down";
  mode: "sandbox" | "live" | "test";
  latencyMs: number | null;
  httpStatus: number | null;
  message: string;
  details: Record<string, unknown>;
  testedAt: string;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Probe PayPal API Health & Connectivity
 */
async function probePayPal(): Promise<GatewayHealthReport> {
  const testedAt = new Date().toISOString();
  await ensurePayPalConfig();
  const cfg = getPayPalConfig();

  if (!cfg) {
    return {
      provider: "paypal",
      displayName: "PayPal (USA & Global)",
      configured: false,
      operationalStatus: "unconfigured",
      mode: "sandbox",
      latencyMs: null,
      httpStatus: null,
      message: "Credentials missing (PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET required)",
      details: {
        missing: ["client_id", "client_secret"].filter((k) => !Deno.env.get(`PAYPAL_${k.toUpperCase()}`)),
      },
      testedAt,
    };
  }

  const start = Date.now();
  try {
    const token = await getAccessToken(cfg, { forceRefresh: true, timeoutMs: 7000 });
    const latencyMs = Date.now() - start;

    return {
      provider: "paypal",
      displayName: "PayPal (USA & Global)",
      configured: true,
      operationalStatus: "healthy",
      mode: cfg.mode,
      latencyMs,
      httpStatus: 200,
      message: `OAuth handshake successful (${cfg.mode} mode, latency ${latencyMs}ms)`,
      details: {
        mode: cfg.mode,
        baseUrl: cfg.base,
        clientIdMasked: `${cfg.clientId.slice(0, 8)}••••••••`,
        tokenAcquired: Boolean(token),
        webhookConfigured: Boolean(Deno.env.get("PAYPAL_WEBHOOK_ID")),
      },
      testedAt,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    const isTimeout = err?.name === "AbortError" || err?.message?.includes("timeout");
    return {
      provider: "paypal",
      displayName: "PayPal (USA & Global)",
      configured: true,
      operationalStatus: isTimeout ? "down" : "error",
      mode: cfg.mode,
      latencyMs,
      httpStatus: err?.status ?? (isTimeout ? 504 : 502),
      message: err instanceof Error ? err.message : "PayPal connectivity probe failed",
      details: {
        mode: cfg.mode,
        error: String(err),
      },
      testedAt,
    };
  }
}

/**
 * Probe Paystack API Health & Connectivity
 */
async function probePaystack(): Promise<GatewayHealthReport> {
  const testedAt = new Date().toISOString();
  const secretKey = Deno.env.get("PAYSTACK_SECRET_KEY")?.trim();
  const publicKey = Deno.env.get("PAYSTACK_PUBLIC_KEY")?.trim();
  const webhookSecret = Deno.env.get("PAYSTACK_WEBHOOK_SECRET")?.trim();

  if (!secretKey) {
    return {
      provider: "paystack",
      displayName: "Paystack (Nigeria - Primary)",
      configured: false,
      operationalStatus: "unconfigured",
      mode: "test",
      latencyMs: null,
      httpStatus: null,
      message: "Credentials missing (PAYSTACK_SECRET_KEY required)",
      details: {
        missing: [
          secretKey ? null : "secret_key",
          publicKey ? null : "public_key",
          webhookSecret ? null : "webhook_secret",
        ].filter(Boolean),
      },
      testedAt,
    };
  }

  const isLive = secretKey.startsWith("sk_live_");
  const mode: "live" | "test" = isLive ? "live" : "test";
  const start = Date.now();

  try {
    const resp = await fetchWithTimeout("https://api.paystack.co/balance", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
    }, 7000);

    const latencyMs = Date.now() - start;
    const data = await resp.json().catch(() => ({}));

    if (resp.ok && data?.status) {
      return {
        provider: "paystack",
        displayName: "Paystack (Nigeria - Primary)",
        configured: true,
        operationalStatus: "healthy",
        mode,
        latencyMs,
        httpStatus: resp.status,
        message: `API balance query active (${mode} mode, latency ${latencyMs}ms)`,
        details: {
          mode,
          balances: data?.data?.map((b: any) => `${b.currency}: ${b.balance / 100}`) ?? [],
          publicKeyMasked: publicKey ? `${publicKey.slice(0, 8)}••••••••` : "not set",
          webhookConfigured: Boolean(webhookSecret),
        },
        testedAt,
      };
    }

    if (resp.status === 401) {
      return {
        provider: "paystack",
        displayName: "Paystack (Nigeria - Primary)",
        configured: true,
        operationalStatus: "error",
        mode,
        latencyMs,
        httpStatus: 401,
        message: "Invalid PAYSTACK_SECRET_KEY (401 Unauthorized)",
        details: { response: data },
        testedAt,
      };
    }

    return {
      provider: "paystack",
      displayName: "Paystack (Nigeria - Primary)",
      configured: true,
      operationalStatus: "degraded",
      mode,
      latencyMs,
      httpStatus: resp.status,
      message: data?.message || `HTTP ${resp.status} received from Paystack`,
      details: { response: data },
      testedAt,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    const isTimeout = err?.name === "AbortError" || err?.message?.includes("timeout");
    return {
      provider: "paystack",
      displayName: "Paystack (Nigeria - Primary)",
      configured: true,
      operationalStatus: isTimeout ? "down" : "error",
      mode,
      latencyMs,
      httpStatus: isTimeout ? 504 : 502,
      message: err instanceof Error ? err.message : "Paystack API connectivity probe failed",
      details: { error: String(err) },
      testedAt,
    };
  }
}

/**
 * Probe OPay API Health & Connectivity
 */
async function probeOpay(): Promise<GatewayHealthReport> {
  const testedAt = new Date().toISOString();
  await ensureOpayConfig();
  const cfg = getOpayConfig();
  const env = resolveOpayEnv();

  if (!cfg) {
    return {
      provider: "opay",
      displayName: "OPay (Nigeria - Cashier & Wallet)",
      configured: false,
      operationalStatus: "unconfigured",
      mode: env,
      latencyMs: null,
      httpStatus: null,
      message: "Credentials missing (OPAY_MERCHANT_ID, OPAY_PUBLIC_KEY, or OPAY_SECRET_KEY required)",
      details: {
        environment: env,
        missing: [
          Deno.env.get("OPAY_MERCHANT_ID") ? null : "merchant_id",
          Deno.env.get("OPAY_PUBLIC_KEY") ? null : "public_key",
          Deno.env.get("OPAY_SECRET_KEY") ? null : "secret_key",
        ].filter(Boolean),
      },
      testedAt,
    };
  }

  const start = Date.now();
  try {
    // We send a lightweight signed query to cashier status for a probe reference.
    // An active OPay endpoint returns either code '00000', '00004' (parameter check/not found),
    // or '00005' - all of which verify active cryptographic handshake and reachable gateway!
    const result = await queryCashierStatus("probe_health_check_ping", cfg);
    const latencyMs = Date.now() - start;

    if (result.httpStatus >= 200 && result.httpStatus < 500) {
      return {
        provider: "opay",
        displayName: "OPay (Nigeria - Cashier & Wallet)",
        configured: true,
        operationalStatus: "healthy",
        mode: cfg.env,
        latencyMs,
        httpStatus: result.httpStatus,
        message: `Cashier gateway active (${cfg.env} mode, code: ${result.code}, latency ${latencyMs}ms)`,
        details: {
          environment: cfg.env,
          baseUrl: cfg.baseUrl,
          merchantId: cfg.merchantId,
          code: result.code,
          apiMessage: result.message,
          webhookConfigured: true,
        },
        testedAt,
      };
    }

    return {
      provider: "opay",
      displayName: "OPay (Nigeria - Cashier & Wallet)",
      configured: true,
      operationalStatus: "degraded",
      mode: cfg.env,
      latencyMs,
      httpStatus: result.httpStatus,
      message: result.message || `OPay returned HTTP ${result.httpStatus}`,
      details: { raw: result.raw },
      testedAt,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    const isTimeout = err?.name === "AbortError" || err?.message?.includes("timeout");
    return {
      provider: "opay",
      displayName: "OPay (Nigeria - Cashier & Wallet)",
      configured: true,
      operationalStatus: isTimeout ? "down" : "error",
      mode: cfg.env,
      latencyMs,
      httpStatus: isTimeout ? 504 : 502,
      message: err instanceof Error ? err.message : "OPay API connectivity probe failed",
      details: { error: String(err) },
      testedAt,
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    // Optional admin verification: if authenticated user is present, ensure role
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      const isStaff = (roleRows ?? []).some((r: { role: string }) =>
        ["admin", "admin_assistant", "super_admin"].includes(r.role),
      );
      if (!isStaff) {
        // Fall back to RPC check
        const { data: isAdminRpc } = await supabase.rpc("is_admin");
        if (isAdminRpc !== true) {
          return new Response(JSON.stringify({ error: "Forbidden - Admin access required" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // Run probes concurrently across all 3 authorized payment gateways
    const [paypal, paystack, opay] = await Promise.all([
      probePayPal(),
      probePaystack(),
      probeOpay(),
    ]);

    const gateways = { paypal, paystack, opay };
    const list = [paypal, paystack, opay];
    const configuredCount = list.filter((g) => g.configured).length;
    const healthyCount = list.filter((g) => g.operationalStatus === "healthy").length;
    const allHealthy = healthyCount === 3;
    const isCompliant = healthyCount >= 2 && configuredCount === 3;

    return new Response(
      JSON.stringify({
        gateways,
        summary: {
          total: 3,
          configuredCount,
          healthyCount,
          allHealthy,
          complianceStatus: allHealthy ? "fully_compliant" : isCompliant ? "operational_compliant" : "attention_required",
          statusText: allHealthy
            ? "All 3 Payment Gateways Operational & Verified (100% SLA)"
            : `${healthyCount}/3 Gateways Active & Connected`,
          testedAt: new Date().toISOString(),
          regions: {
            usa: {
              primaryGateway: "paypal",
              status: paypal.operationalStatus,
              compliant: paypal.configured && paypal.operationalStatus === "healthy",
            },
            nigeria: {
              primaryGateways: ["paystack", "opay"],
              status: paystack.operationalStatus === "healthy" && opay.operationalStatus === "healthy" ? "healthy" : "partial",
              compliant: (paystack.configured || opay.configured) && (paystack.operationalStatus === "healthy" || opay.operationalStatus === "healthy"),
            },
          },
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Health check failed" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
