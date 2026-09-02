import { Router, Request, Response } from "express";
import crypto from "crypto";

export const webhooksRouter = Router();

const SENT_WEBHOOK_SECRET = process.env.SENT_WEBHOOK_SECRET || "";
const PUBLIC_BACKEND_URL = process.env.PUBLIC_BACKEND_URL || "https://staging.rentmaikar.com";

/**
 * Canonical Sent.dm webhook URL:
 * `${PUBLIC_BACKEND_URL}/api/webhooks/sent`
 * (default: https://staging.rentmaikar.com/api/webhooks/sent)
 *
 * Verify a Sent.dm webhook signature.
 *
 * Sent.dm may sign using one of these common patterns:
 * 1. `x-sent-signature` or `x-webhook-signature` equals the raw secret (token mode)
 * 2. Header is a hex HMAC-SHA256 of the raw request body
 * 3. Stripe-style `t=<timestamp>,v1=<hex>` where v1 is HMAC-SHA256 of body
 *
 * If no secret is configured, the request is accepted but logged as unverified.
 */
function verifySentSignature(req: Request): { ok: boolean; reason?: string } {
  const signature =
    (req.headers["x-sent-signature"] as string | undefined) ||
    (req.headers["x-webhook-signature"] as string | undefined);

  if (!SENT_WEBHOOK_SECRET) {
    return { ok: true, reason: "SENT_WEBHOOK_SECRET not configured; accepting unverified" };
  }

  if (!signature) {
    return { ok: false, reason: "Missing signature header" };
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));

  // Token mode: header equals secret
  if (signature === SENT_WEBHOOK_SECRET) {
    return { ok: true };
  }

  const expectedHmac = crypto
    .createHmac("sha256", SENT_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  // Plain hex HMAC mode
  if (signature === expectedHmac) {
    return { ok: true };
  }

  // Stripe-style `t=...,v1=...` mode
  const parts = signature.split(",").reduce<Record<string, string>>((acc, part) => {
    const [key, value] = part.split("=");
    if (key && value) acc[key.trim()] = value.trim();
    return acc;
  }, {});

  if (parts.v1 && parts.v1 === expectedHmac) {
    return { ok: true };
  }

  return { ok: false, reason: "Signature mismatch" };
}

/** Relay a verified Sent.dm payload to the given edge function (non-blocking). */
function relayToEdgeFunction(fn: string, rawBody: string, req: Request) {
  const url = process.env.SUPABASE_URL
    ? `${process.env.SUPABASE_URL}/functions/v1/${fn}`
    : null;
  if (!url) {
    console.warn(`[Webhook][Sent.dm] SUPABASE_URL not set — event not relayed to ${fn}`);
    return;
  }
  const signature =
    (req.headers["x-sent-signature"] as string | undefined) ||
    (req.headers["x-webhook-signature"] as string | undefined);
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(signature ? { "x-sent-signature": signature } : {}),
    },
    body: rawBody,
  })
    .then(async (r) => {
      if (!r.ok) {
        console.error(`[Webhook][Sent.dm] Relay to ${fn} failed [${r.status}]:`, await r.text());
      }
    })
    .catch((e) => console.error(`[Webhook][Sent.dm] Relay to ${fn} error:`, e));
}

/** True when the payload is a delivery receipt rather than a customer message. */
function isStatusEvent(event: Record<string, any>): boolean {
  const payload = event?.data ?? event?.message ?? event ?? {};
  const type = String(event?.type ?? event?.event ?? "").toLowerCase();
  if (type.includes("inbound") || type.includes("received")) return false;
  if (type.includes("status") || type.includes("delivery") || type.includes("dlr")) return true;
  const hasBody = Boolean(payload.text || payload.body || payload.message || payload.media_url);
  return Boolean(payload.status ?? payload.state) && !hasBody;
}

function handleSentWebhook(req: Request, res: Response, force?: "status" | "inbound") {
  const verification = verifySentSignature(req);

  if (!verification.ok) {
    console.error("[Webhook][Sent.dm] Signature verification failed:", verification.reason);
    return res.status(401).json({
      received: false,
      error: "Invalid signature",
      timestamp: new Date().toISOString(),
    });
  }

  if (verification.reason) {
    console.warn("[Webhook][Sent.dm]", verification.reason);
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body);
  let event: Record<string, any> = {};
  try {
    event = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return res.status(400).json({ received: false, error: "Invalid JSON" });
  }

  const kind = force ?? (isStatusEvent(event) ? "status" : "inbound");
  console.log(`[Webhook][Sent.dm] ${kind} event received:`, event);

  relayToEdgeFunction(kind === "status" ? "sent-status" : "sent-inbound", rawBody, req);

  // Acknowledge receipt immediately (200 OK)
  return res.status(200).json({ received: true, kind, timestamp: new Date().toISOString() });
}

/**
 * POST /api/webhooks/sent
 *
 * Single Sent.dm endpoint for both customer messages and delivery receipts.
 * Inbound messages are relayed to `sent-inbound` (routing to the Master
 * Communications Endpoint); delivery/status callbacks are relayed to
 * `sent-status`, which records them in `messaging_events` so the admin
 * delivery log shows the final outcome. Relaying never blocks the 200 OK.
 */
webhooksRouter.post("/sent", (req: Request, res: Response) => handleSentWebhook(req, res));

/**
 * POST /api/webhooks/sent/status
 * Explicit delivery-status endpoint, for providers configured with a separate
 * status callback URL.
 */
webhooksRouter.post("/sent/status", (req: Request, res: Response) =>
  handleSentWebhook(req, res, "status"),
);



/**
 * POST /api/webhooks/twilio
 * Twilio status callback webhook
 */
webhooksRouter.post("/twilio", (req: Request, res: Response) => {
  console.log("[Webhook][Twilio] Callback:", req.body);
  return res.status(200).send("<Response></Response>");
});

/**
 * POST /api/webhooks/termii
 * Termii delivery callback webhook
 */
webhooksRouter.post("/termii", (req: Request, res: Response) => {
  console.log("[Webhook][Termii] Callback:", req.body);
  return res.status(200).json({ status: "success" });
});
