// Admin-only helper that inspects and configures Sent.dm webhook endpoints so
// SMS/WhatsApp delivery receipts reach the platform delivery log.
//
// Canonical receiver: `${SENT_WEBHOOK_URL}` (default
// https://staging.rentmaikar.com/api/webhooks/sent) which relays verified
// events to the `sent-status` / `sent-inbound` edge functions.
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdminCaller } from "../_shared/guard.ts";
import { sentApiKey, sentEnabled } from "../_shared/sent-client.ts";

const BASE = Deno.env.get("SENT_API_BASE_URL") || "https://api.sent.dm";

function canonicalWebhookUrl(): string {
  return (
    Deno.env.get("SENT_WEBHOOK_URL") ||
    `${(Deno.env.get("PUBLIC_BACKEND_URL") || "https://staging.rentmaikar.com").replace(/\/+$/, "")}/api/webhooks/sent`
  );
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
    const match = Array.isArray(existing)
      ? existing.find((w) => (w?.endpoint_url ?? "").replace(/\/+$/, "") === url.replace(/\/+$/, ""))
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
    return json({
      ok: true,
      action: match ? "updated" : "created",
      canonical_url: url,
      webhook_id: data.id ?? match?.id ?? null,
      event_types: data.event_types ?? event_types,
      is_active: data.is_active ?? true,
      // Signing secret state: `registered` means Sent now signs callbacks with
      // the same SENT_WEBHOOK_SECRET the receivers verify against.
      signing_secret_configured: Boolean(localSecret),
      signing_secret_registered: Boolean(localSecret) &&
        (data.signing_secret === localSecret || data.signing_secret === undefined
          ? Boolean(localSecret)
          : false),
      signing_secret_returned: Boolean(data.signing_secret),
    });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
