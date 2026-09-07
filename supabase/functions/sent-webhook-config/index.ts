// Admin-only helper that inspects and configures Sent.dm webhook endpoints so
// SMS/WhatsApp delivery receipts reach the platform delivery log.
//
// Canonical receiver: `${SENT_WEBHOOK_URL}` (default
// https://staging.rentmaikar.com/api/webhooks/sent) which relays verified
// events to the `sent-status` / `sent-inbound` edge functions.
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdminCaller } from "../_shared/guard.ts";
import { sentApiKey, sentEnabled } from "../_shared/sent-client.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BASE = Deno.env.get("SENT_API_BASE_URL") || "https://api.sent.dm";

function canonicalWebhookUrl(): string {
  const base = (
    Deno.env.get("SENT_WEBHOOK_URL") ||
    `${(Deno.env.get("PUBLIC_BACKEND_URL") || "https://staging.rentmaikar.com").replace(/\/+$/, "")}/api/webhooks/sent`
  ).split("?")[0];
  // Sent.dm mints its own signing secret, so we authenticate callbacks with a
  // shared token carried in the endpoint URL instead.
  const token = Deno.env.get("SENT_WEBHOOK_SECRET");
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}


async function sentFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": sentApiKey(),
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(20000),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body } as const;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const caller = await requireAdminCaller(req);
  if (caller instanceof Response) return caller;

  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    if (!sentEnabled()) return json({ ok: false, error: "Sent.dm is not configured" }, 400);

    const { action = "ensure" } = await req.json().catch(() => ({ action: "ensure" }));
    const url = canonicalWebhookUrl();

    const list = await sentFetch("/v3/webhooks", { method: "GET" });
    if (!list.ok) {
      return json({ ok: false, step: "list", status: list.status, error: list.body }, list.status);
    }
    const existing: any[] =
      (list.body as any)?.data?.webhooks ?? (list.body as any)?.data ?? [];
    const bare = (u: string) => (u ?? "").split("?")[0].replace(/\/+$/, "");
    const match = Array.isArray(existing)
      ? existing.find((w) => bare(w?.endpoint_url) === bare(url))
      : undefined;

    if (action === "list") {
      return json({
        ok: true,
        canonical_url: url,
        configured: Boolean(match),
        signing_secret_configured: Boolean(Deno.env.get("SENT_WEBHOOK_SECRET")),
        webhooks: existing,
      });
    }

    // Pull the signing secret Sent.dm actually signs callbacks with and store
    // it so the receivers can verify them.
    if (action === "sync-secret") {
      if (!match?.id) return json({ ok: false, error: "Webhook not registered yet" }, 404);
      const detail = await sentFetch(`/v3/webhooks/${match.id}`, { method: "GET" });
      const d = (detail.body as any)?.data ?? {};
      const secret: string | undefined =
        d.signing_secret ?? d.secret ?? d.webhook_secret ?? undefined;
      if (!secret) {
        return json({
          ok: false,
          error: "Sent.dm did not return a signing secret for this webhook",
          status: detail.status,
          keys: Object.keys(d),
        }, 200);
      }
      const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { error: kvError } = await admin
        .from("platform_kv_settings")
        .upsert({ key: "sent_webhook_signing_secret", value: secret }, { onConflict: "key" });
      return json({
        ok: !kvError,
        stored: !kvError,
        error: kvError?.message,
        matches_env: secret === (Deno.env.get("SENT_WEBHOOK_SECRET") ?? ""),
      });
    }



    // Subscribe to every delivery-lifecycle event Sent exposes, plus inbound.
    const types = await sentFetch("/v3/webhooks/event-types", { method: "GET" });
    const available: string[] = ((types.body as any)?.data?.event_types ?? [])
      .map((t: any) => t?.name)
      .filter((n: unknown): n is string => typeof n === "string");
    const wanted = available.length
      ? available.filter((n) => n.startsWith("message") || n.startsWith("inbound"))
      : ["message"];
    const event_types = wanted.length ? wanted : available;

    // Register OUR signing secret with Sent so status callbacks arrive signed
    // with the same value `sent-status` / `sent-inbound` verify against.
    const localSecret = Deno.env.get("SENT_WEBHOOK_SECRET") ?? "";
    const payload: Record<string, unknown> = {
      display_name: "Rentmaikar delivery + inbound",
      endpoint_url: url,
      event_types,
      retry_count: 3,
      timeout_seconds: 15,
    };
    if (localSecret) {
      payload.signing_secret = localSecret;
      payload.secret = localSecret;
    }

    const result = match?.id
      ? await sentFetch(`/v3/webhooks/${match.id}`, { method: "PUT", body: JSON.stringify(payload) })
      : await sentFetch("/v3/webhooks", { method: "POST", body: JSON.stringify(payload) });

    if (!result.ok) {
      return json(
        { ok: false, step: match ? "update" : "create", status: result.status, error: result.body, attempted: payload },
        result.status,
      );
    }

    const data = (result.body as any)?.data ?? {};

    // Sent.dm mints its own signing secret when it will not accept ours. Persist
    // whatever it actually signs with so the receivers can verify callbacks.
    const providerSecret: string | undefined =
      typeof data.signing_secret === "string" ? data.signing_secret : undefined;
    let providerSecretStored = false;
    if (providerSecret && providerSecret !== localSecret) {
      const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { error: kvError } = await admin
        .from("platform_kv_settings")
        .upsert(
          { key: "sent_webhook_signing_secret", value: providerSecret },
          { onConflict: "key" },
        );
      if (kvError) console.error("[sent-webhook-config] secret persist failed:", kvError.message);
      else providerSecretStored = true;
    }

    return json({
      ok: true,
      action: match ? "updated" : "created",
      canonical_url: url,
      webhook_id: data.id ?? match?.id ?? null,
      event_types: data.event_types ?? event_types,
      is_active: data.is_active ?? true,
      // Signing state: either Sent accepted our secret, or we stored the one it
      // generated so inbound callbacks still verify.
      signing_secret_configured: Boolean(localSecret),
      signing_secret_registered:
        Boolean(providerSecret && providerSecret === localSecret) || providerSecretStored,
      provider_secret_stored: providerSecretStored,
      signing_secret_returned: Boolean(providerSecret),
    });

  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
