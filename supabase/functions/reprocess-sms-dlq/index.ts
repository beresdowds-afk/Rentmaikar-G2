// Stuck-SMS reprocessor.
//
//   1. Sweep: outbound SMS/WhatsApp `messaging_events` rows that were queued
//      more than STUCK_MINUTES ago and never reached a terminal state, plus any
//      hard provider failure, are dead-lettered into `sms_dlq_retry_state`.
//   2. Retry: pending DLQ entries whose backoff has elapsed are re-sent through
//      Sent.dm. Attempts back off exponentially and pause after MAX_ATTEMPTS.
//
// Mirrors `reprocess-email-dlq` so SMS failures are never silently lost.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdminCaller } from "../_shared/guard.ts";
import { sendViaSent } from "../_shared/sent-client.ts";
import { logMessagingEvent } from "../_shared/messaging-events.ts";

const STUCK_MINUTES = 15;
const SWEEP_LOOKBACK_HOURS = 48;
const BATCH = 25;
const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MINUTES = 5;
const MAX_BACKOFF_MINUTES = 6 * 60;

type Supa = ReturnType<typeof createClient>;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const backoffMinutes = (attempts: number) =>
  Math.min(BASE_BACKOFF_MINUTES * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MINUTES);

const TERMINAL = new Set(["delivered", "read", "failed", "rejected", "blocked", "opted_out"]);

/** Find stuck / failed outbound messages and dead-letter them. */
async function sweep(supa: Supa): Promise<number> {
  const stuckBefore = new Date(Date.now() - STUCK_MINUTES * 60_000).toISOString();
  const since = new Date(Date.now() - SWEEP_LOOKBACK_HOURS * 3_600_000).toISOString();

  const { data: events } = await supa
    .from("messaging_events")
    .select(
      "id, created_at, channel, event_type, recipient, provider_message_id, user_id, region, template_name, error_message, metadata",
    )
    .eq("direction", "outbound")
    .in("channel", ["sms", "whatsapp"])
    .gte("created_at", since)
    .lte("created_at", stuckBefore)
    .order("created_at", { ascending: false })
    .limit(500);

  const rows = (events ?? []) as Array<Record<string, any>>;
  // Group by provider message id (fall back to recipient+minute) so we can tell
  // whether a queued send ever reached a terminal state.
  const byKey = new Map<string, Record<string, any>[]>();
  for (const e of rows) {
    const key = e.provider_message_id || `${e.recipient}:${String(e.created_at).slice(0, 16)}`;
    const list = byKey.get(key) ?? [];
    list.push(e);
    byKey.set(key, list);
  }

  let queued = 0;
  for (const [key, group] of byKey) {
    const hasTerminal = group.some((e) => TERMINAL.has(e.event_type));
    const failure = group.find((e) => e.event_type === "failed" || e.event_type === "rejected");
    const first = group[group.length - 1];
    const stuck = !hasTerminal;
    if (!stuck && !failure) continue;
    if (!first.recipient) continue;

    const text = (first.metadata?.body as string | undefined) ??
      (failure?.metadata?.body as string | undefined) ?? null;

    const { error } = await supa.from("sms_dlq_retry_state").upsert(
      {
        message_key: key,
        channel: first.channel,
        recipient_phone: first.recipient,
        body: text,
        template_name: first.template_name ?? null,
        user_id: first.user_id ?? null,
        region: first.region ?? null,
        last_error: failure?.error_message ?? (stuck ? "No delivery receipt received" : null),
      },
      { onConflict: "message_key", ignoreDuplicates: true },
    );
    if (!error) queued++;
  }
  return queued;
}

async function retryPending(supa: Supa) {
  const nowIso = new Date().toISOString();
  const { data: pending } = await supa
    .from("sms_dlq_retry_state")
    .select("*")
    .is("resolved_at", null)
    .eq("paused", false)
    .lte("next_attempt_at", nowIso)
    .order("next_attempt_at", { ascending: true })
    .limit(BATCH);

  let requeued = 0;
  let resolved = 0;
  let paused = 0;

  for (const entry of (pending ?? []) as Array<Record<string, any>>) {
    const attempts = (entry.attempts ?? 0) + 1;

    if (!entry.body) {
      // Nothing to resend — mark it paused so an admin can act on it instead of
      // spinning forever on a receipt-only record.
      await supa.from("sms_dlq_retry_state").update({
        attempts,
        paused: true,
        last_error: entry.last_error ?? "Original message body unavailable for retry",
      }).eq("id", entry.id);
      paused++;
      continue;
    }

    const res = await sendViaSent({
      to: entry.recipient_phone,
      channel: entry.channel === "whatsapp" ? "whatsapp" : "sms",
      text: entry.body,
      idempotencyKey: `dlq_${entry.id}_${attempts}`,
    });

    if (res.ok) {
      await supa.from("sms_dlq_retry_state").update({
        attempts,
        resolved_at: new Date().toISOString(),
        last_error: null,
      }).eq("id", entry.id);
      await logMessagingEvent(supa, {
        channel: entry.channel === "whatsapp" ? "whatsapp" : "sms",
        provider: "sent",
        event_type: "queued",
        direction: "outbound",
        recipient: entry.recipient_phone,
        user_id: entry.user_id ?? undefined,
        region: entry.region ?? undefined,
        provider_message_id: res.messageId,
        metadata: { retry_of: entry.message_key, attempt: attempts, body: entry.body },
      });
      resolved++;
      continue;
    }

    const shouldPause = attempts >= MAX_ATTEMPTS;
    await supa.from("sms_dlq_retry_state").update({
      attempts,
      paused: shouldPause,
      last_error: res.error ?? "Retry failed",
      next_attempt_at: new Date(Date.now() + backoffMinutes(attempts) * 60_000).toISOString(),
    }).eq("id", entry.id);
    if (shouldPause) paused++;
    else requeued++;
  }

  return { requeued, resolved, paused };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const caller = await requireAdminCaller(req);
  if (caller instanceof Response) return caller;

  try {
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const dead_lettered = await sweep(supa);
    const result = await retryPending(supa);
    return json({ ok: true, dead_lettered, ...result });
  } catch (e) {
    console.error("[reprocess-sms-dlq] failed", e);
    return json({ error: (e as Error).message }, 500);
  }
});
