/**
 * Sent.dm OpenAPI v3 client — global default CPaaS provider.
 *
 * Sent is attempted FIRST for every outbound SMS/WhatsApp/RCS message.
 * If it is not configured, the channel is disabled, or the dispatch fails,
 * callers fall back to the regional providers (Twilio for USA, Termii for
 * Nigeria, Whatchimp where a region prefers it for WhatsApp).
 *
 * WhatsApp specifics handled here:
 *  - dedicated WhatsApp business sender (`SENT_WHATSAPP_NUMBER`), since
 *    alphanumeric sender IDs are not valid on WhatsApp
 *  - approved template dispatch (required outside the 24h session window)
 *  - media attachments (image/document links)
 *  - per-channel kill switch via `SENT_CHANNELS`
 */

export type SentChannel = "sms" | "whatsapp" | "rcs";

export interface SentTemplateRef {
  /** Approved WhatsApp template name/id registered with Sent.dm */
  id: string;
  /** BCP-47 language code, e.g. "en_US" */
  language?: string;
  parameters?: Record<string, string | number>;
}

export interface SentSendRequest {
  to: string;
  channel: SentChannel;
  /** Free-form session text. Optional when `template` is supplied. */
  text?: string;
  /** WhatsApp approved template (required outside the 24h session window). */
  template?: SentTemplateRef;
  /** Public URLs for media attachments (WhatsApp/RCS only). */
  mediaUrls?: string[];
  senderId?: string;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface SentSendResult {
  ok: boolean;
  messageId?: string;
  status?: string;
  channel?: SentChannel;
  sandbox?: boolean;
  error?: string;
  skipped?: boolean; // provider or channel not enabled
}

const DEFAULT_BASE_URL = "https://api.sent.dm";
const ALL_CHANNELS: SentChannel[] = ["sms", "whatsapp", "rcs"];

export function sentApiKey(): string {
  return Deno.env.get("SENT_API_KEY") ?? "";
}

export function sentEnabled(): boolean {
  const key = sentApiKey();
  if (!key || key === "mock" || key.startsWith("demo_")) return false;
  // Explicit kill switch
  return (Deno.env.get("SENT_ENABLED") ?? "true").toLowerCase() !== "false";
}

/** Channels Sent is allowed to serve. Defaults to all three. */
export function sentChannels(): SentChannel[] {
  const raw = (Deno.env.get("SENT_CHANNELS") ?? "").trim();
  if (!raw) return [...ALL_CHANNELS];
  const parsed = raw
    .split(/[,\s]+/)
    .map((c) => c.trim().toLowerCase())
    .filter((c): c is SentChannel => (ALL_CHANNELS as string[]).includes(c));
  return parsed.length ? parsed : [...ALL_CHANNELS];
}

export function sentChannelEnabled(channel: SentChannel): boolean {
  return sentEnabled() && sentChannels().includes(channel);
}

export function sentSenderId(): string {
  return Deno.env.get("SENT_SENDER_ID") || "RENTMAIKAR";
}

/**
 * WhatsApp requires a registered business phone number as the sender —
 * alphanumeric sender IDs are rejected by the channel.
 */
export function sentWhatsappSender(): string {
  return (
    Deno.env.get("SENT_WHATSAPP_NUMBER") ||
    Deno.env.get("TWILIO_WHATSAPP_NUMBER") ||
    ""
  );
}

function senderForChannel(channel: SentChannel, recipient?: string, override?: string): string {
  if (override) return override;
  if (channel === "whatsapp") return sentWhatsappSender() || sentSenderId();
  // US carriers reject alphanumeric sender IDs — use the numeric sender.
  if (recipient && normalizeRecipient("sms", recipient).startsWith("+1")) {
    return (
      Deno.env.get("SENT_SMS_NUMBER") ||
      Deno.env.get("SENT_WHATSAPP_NUMBER") ||
      sentSenderId()
    );
  }
  return sentSenderId();
}

function sentBaseUrl(): string {
  return Deno.env.get("SENT_API_BASE_URL") || DEFAULT_BASE_URL;
}

function sandboxMode(): boolean {
  return (Deno.env.get("SENT_SANDBOX_MODE") ?? "false").toLowerCase() === "true";
}

function normalizeRecipient(channel: SentChannel, to: string): string {
  // Sent.dm expects bare E.164 — strip Twilio-style `whatsapp:` prefixes.
  const bare = to.replace(/^whatsapp:/i, "").trim();
  return bare.startsWith("+") ? bare : `+${bare.replace(/[^0-9]/g, "")}`;
}

/**
 * Free-form sends ride Sent's FREE_TEXT_SYS_TEMPLATE, whose parameter value
 * may not contain newlines, carriage returns or tabs, nor runs of more than
 * four spaces (VALIDATION_008 — "One or more template variables are invalid").
 * Multi-line admin replies therefore have to be flattened before dispatch.
 */
export function sanitizeSentText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    // Paragraph breaks read better as sentence separators than a bare space.
    .replace(/\n{2,}/g, " — ")
    .replace(/[\n\t]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}


/** Dispatch a message through Sent.dm v3. Never throws. */
export async function sendViaSent(req: SentSendRequest): Promise<SentSendResult> {
  if (!sentEnabled()) {
    return { ok: false, skipped: true, error: "SENT_API_KEY not configured" };
  }
  if (!sentChannelEnabled(req.channel)) {
    return { ok: false, skipped: true, error: `Sent.dm channel '${req.channel}' disabled` };
  }
  // Providers reject text containing unresolved {{placeholder}} tokens as
  // invalid template variables — strip anything that survived rendering.
  if (req.text && /\{\{\s*[a-z0-9_]+\s*\}\}/i.test(req.text)) {
    req = {
      ...req,
      text: req.text.replace(/\{\{\s*[a-z0-9_]+\s*\}\}/gi, "").replace(/[ \t]{2,}/g, " ").trim(),
    };
  }
  if (!req.text && !req.template) {
    return { ok: false, skipped: true, error: "Either text or template is required" };
  }

  const media = (req.mediaUrls ?? []).filter(Boolean).slice(0, 10);
  if (media.length && req.channel === "sms") {
    // SMS has no native media on Sent.dm — append the links to the body instead.
    req = { ...req, text: [req.text, ...media].filter(Boolean).join(" "), mediaUrls: [] };
  }

  // Final guard: the free-text system template rejects newlines/tabs.
  if (req.text) req = { ...req, text: sanitizeSentText(req.text) };
  if (!req.text && !req.template) {
    return { ok: false, skipped: true, error: "Message body is empty after sanitisation" };
  }

  const idempotencyKey =
    req.idempotencyKey ||
    `rm_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;


  try {
    const res = await fetch(`${sentBaseUrl()}/v3/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": sentApiKey(),
        // Sent.dm v3 expects the canonical Idempotency-Key header.
        "Idempotency-Key": idempotencyKey.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 255),
      },
      body: JSON.stringify({
        // v3 schema: { sandbox?, to: string[], channel: string[], template?, text? }
        to: [normalizeRecipient(req.channel, req.to)],
        channel: [req.channel],
        sandbox: sandboxMode(),
        ...(req.text ? { text: req.text } : {}),
        ...(req.template
          ? {
              template: {
                id: req.template.id,
                parameters: req.template.parameters ?? {},
              },
            }
          : {}),
      }),
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.json().catch(() => ({} as Record<string, unknown>));

    if (!res.ok) {
      const details = (data as any)?.error?.details;
      const message =
        [
          (data as any)?.error?.message || (data as any)?.message ||
            `Sent.dm HTTP ${res.status}`,
          details ? JSON.stringify(details) : null,
        ]
          .filter(Boolean)
          .join(" — ");
      return { ok: false, error: message, channel: req.channel };
    }

    const recipient = (data as any)?.data?.recipients?.[0];
    return {
      ok: true,
      messageId: recipient?.message_id ?? (data as any)?.id ?? `sent_${Date.now()}`,
      status: (data as any)?.data?.status ?? (data as any)?.status ?? "queued",
      channel: recipient?.channel ?? req.channel,
      sandbox: sandboxMode(),
    };

  } catch (e) {
    return {
      ok: false,
      channel: req.channel,
      error: e instanceof Error ? e.message : "Sent.dm request failed",
    };
  }
}

/** Convenience wrapper for WhatsApp dispatch. */
export function sendWhatsappViaSent(
  req: Omit<SentSendRequest, "channel">,
): Promise<SentSendResult> {
  return sendViaSent({ ...req, channel: "whatsapp" });
}

/** Lightweight health probe against GET /v3/account. */
export async function sentHealth(): Promise<{
  configured: boolean;
  healthy: boolean;
  status_code?: number;
  sandbox: boolean;
  base_url: string;
  sender_id: string;
  whatsapp_sender: string | null;
  whatsapp_ready: boolean;
  /** Whether Sent.dm itself reports the WhatsApp channel as provisioned. */
  provider_whatsapp_configured?: boolean;
  enabled_channels: SentChannel[];
  latency_ms?: number;
  account?: unknown;
  error?: string;
}> {
  const waSender = sentWhatsappSender();
  const channels = sentChannels();
  const base = {
    configured: sentEnabled(),
    sandbox: sandboxMode(),
    base_url: sentBaseUrl(),
    sender_id: sentSenderId(),
    whatsapp_sender: waSender || null,
    whatsapp_ready: sentChannelEnabled("whatsapp") && Boolean(waSender),
    enabled_channels: channels,
  };

  if (!sentEnabled()) {
    return { ...base, healthy: false, error: "SENT_API_KEY not configured" };
  }

  const started = Date.now();
  // Sent.dm exposes different read endpoints per plan; probe a few and treat the
  // first non-404 answer as authoritative. All-404 means the gateway is reachable
  // and the key was not rejected, so the provider is usable for sending.
  const probePaths = ["/v3/account", "/v3/me", "/v3/organizations", "/v3/senders"];
  let lastStatus = 0;
  try {
    for (const path of probePaths) {
      const res = await fetch(`${sentBaseUrl()}${path}`, {
        headers: { "x-api-key": sentApiKey() },
        signal: AbortSignal.timeout(10000),
      });
      lastStatus = res.status;
      if (res.status === 404) continue;
      const account = await res.json().catch(() => null);
      const providerWa = (account as any)?.data?.channels?.whatsapp?.configured;
      return {
        ...base,
        provider_whatsapp_configured:
          typeof providerWa === "boolean" ? providerWa : undefined,
        healthy: res.ok,
        status_code: res.status,
        latency_ms: Date.now() - started,
        account: res.ok ? account : undefined,
        error: res.ok
          ? undefined
          : res.status === 401 || res.status === 403
            ? `SENT_API_KEY rejected (HTTP ${res.status})`
            : `HTTP ${res.status}`,
      };
    }

    return {
      ...base,
      healthy: true,
      status_code: lastStatus,
      latency_ms: Date.now() - started,
      error: undefined,
      account: {
        note:
          "Sent.dm account endpoints are not exposed for this key; gateway reachable and credentials accepted.",
      },
    };
  } catch (e) {
    return {
      ...base,
      healthy: false,
      latency_ms: Date.now() - started,
      error: e instanceof Error ? e.message : "probe failed",
    };
  }
}

