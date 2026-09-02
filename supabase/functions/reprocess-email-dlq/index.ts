// Automatic dead-letter reprocessor for the email queues.
//
// Runs on a schedule (and can be triggered manually by an admin from the email
// delivery monitor). Each run is bounded, single-flighted through a lease row,
// records per-message progress in `email_dlq_retry_state`, and backs off
// exponentially. After MAX_ATTEMPTS the entry is paused and the team alerted
// instead of the job looping forever.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const QUEUES = ["auth_emails", "transactional_emails"] as const;
const BATCH_PER_QUEUE = 10;
const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MINUTES = 5;
const MAX_BACKOFF_MINUTES = 6 * 60;
const LEASE_KEY = "email_dlq_worker_lease";
const LEASE_SECONDS = 120;

type Supa = ReturnType<typeof createClient>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const p = parts[1].replaceAll("-", "+").replaceAll("_", "/")
      .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
    return JSON.parse(atob(p)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function backoffMinutes(attempts: number): number {
  return Math.min(BASE_BACKOFF_MINUTES * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MINUTES);
}

/** Single-flight lease: only one reprocessor run at a time. */
async function acquireLease(supa: Supa): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const expires = new Date(Date.now() + LEASE_SECONDS * 1000).toISOString();

  const { data: existing } = await supa
    .from("platform_kv_settings")
    .select("value")
    .eq("key", LEASE_KEY)
    .maybeSingle();

  if (!existing) {
    const { error } = await supa
      .from("platform_kv_settings")
      .insert({ key: LEASE_KEY, value: { expires_at: expires } });
    return !error;
  }

  const currentExpiry = (existing.value as { expires_at?: string } | null)?.expires_at;
  if (currentExpiry && currentExpiry > nowIso) return false;

  const { data: claimed } = await supa
    .from("platform_kv_settings")
    .update({ value: { expires_at: expires }, updated_at: nowIso })
    .eq("key", LEASE_KEY)
    .or(`value->>expires_at.is.null,value->>expires_at.lt.${nowIso}`)
    .select("key");

  return !!claimed?.length;
}

async function releaseLease(supa: Supa) {
  await supa
    .from("platform_kv_settings")
    .update({ value: { expires_at: new Date(0).toISOString() } })
    .eq("key", LEASE_KEY);
}

async function alertPaused(
  supa: Supa,
  entry: { queue: string; recipient: string | null; template: string | null; error: string | null },
) {
  const message =
    `Email to ${entry.recipient ?? "unknown recipient"} (${entry.template ?? entry.queue}) ` +
    `failed ${MAX_ATTEMPTS} retry attempts and is paused. Last error: ${entry.error ?? "unknown"}`;

  const { data: admins } = await supa.from("user_roles").select("user_id").eq("role", "admin");
  if (admins?.length) {
    await supa.from("admin_notifications").insert(
      admins.slice(0, 50).map((a: { user_id: string }) => ({
        recipient_id: a.user_id,
        kind: "provider_health_alert",
        title: "Email retries exhausted",
        body: message,
        metadata: {
          provider: "email_queue",
          queue: entry.queue,
          recipient_email: entry.recipient,
          template_name: entry.template,
          last_error: entry.error,
        },
      })) as never,
    );
  }

  const { data: cfgRow } = await supa
    .from("platform_kv_settings")
    .select("value")
    .eq("key", "provider_alert_config")
    .maybeSingle();
  const cfg = (cfgRow?.value ?? {}) as Record<string, unknown>;
  if (typeof cfg.slack_webhook_url === "string") {
    await fetch(cfg.slack_webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `:warning: *Rentmaikar email* — ${message}` }),
    }).catch(() => undefined);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return json({ error: "Server configuration error" }, 500);

    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const token = auth.slice(7).trim();

    const supa = createClient(url, serviceKey);
    const claims = parseJwtClaims(token);
    let manual = false;

    if (claims?.role !== "service_role") {
      // Allow an admin to trigger a retry sweep from the monitoring page.
      const { data: u } = await supa.auth.getUser(token);
      if (!u?.user) return json({ error: "Unauthorized" }, 401);
      const { data: isAdmin } = await supa.rpc("is_admin", { _user_id: u.user.id });
      if (!isAdmin) return json({ error: "Forbidden" }, 403);
      manual = true;
    }

    if (!(await acquireLease(supa))) {
      return json({ skipped: true, reason: "another_run_in_progress" });
    }

    const summary = {
      requeued: 0,
      deferred: 0,
      paused: 0,
      inspected: 0,
      manual,
      queues: {} as Record<string, { requeued: number; deferred: number; paused: number }>,
    };

    try {
      for (const queue of QUEUES) {
        const dlq = `${queue}_dlq`;
        const perQueue = { requeued: 0, deferred: 0, paused: 0 };

        const { data: messages, error: readErr } = await supa.rpc("read_email_batch", {
          queue_name: dlq,
          batch_size: BATCH_PER_QUEUE,
          vt: 60,
        });
        if (readErr) {
          console.error("dlq read failed", { dlq, message: readErr.message });
          continue;
        }
        if (!messages?.length) {
          summary.queues[dlq] = perQueue;
          continue;
        }

        for (const msg of messages) {
          summary.inspected++;
          const payload = (msg.message ?? {}) as Record<string, unknown>;
          const messageKey = String(payload.message_id ?? payload.idempotency_key ?? msg.msg_id);
          const recipient = typeof payload.to === "string" ? payload.to : null;
          const template = typeof payload.label === "string" ? payload.label : null;

          const { data: state } = await supa
            .from("email_dlq_retry_state")
            .select("id, attempts, next_attempt_at, paused")
            .eq("queue_name", dlq)
            .eq("message_key", messageKey)
            .maybeSingle();

          if (state?.paused) {
            perQueue.paused++;
            summary.paused++;
            continue;
          }
          if (state?.next_attempt_at && new Date(state.next_attempt_at) > new Date() && !manual) {
            perQueue.deferred++;
            summary.deferred++;
            continue;
          }

          const attempts = (state?.attempts ?? 0) + 1;
          const lastError = typeof payload.last_error === "string" ? payload.last_error : null;

          if (attempts > MAX_ATTEMPTS) {
            await supa.from("email_dlq_retry_state").upsert({
              queue_name: dlq,
              message_key: messageKey,
              recipient_email: recipient,
              template_name: template,
              attempts,
              paused: true,
              last_error: lastError,
              alerted_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }, { onConflict: "queue_name,message_key" });
            await alertPaused(supa, { queue: dlq, recipient, template, error: lastError });
            perQueue.paused++;
            summary.paused++;
            continue;
          }

          // Re-queue with a fresh message id + queued_at so the main worker's
          // TTL and failed-attempt counters start clean for this retry.
          const retryPayload = {
            ...payload,
            message_id: `${messageKey}:r${attempts}`,
            queued_at: new Date().toISOString(),
            metadata: {
              ...(typeof payload.metadata === "object" && payload.metadata
                ? payload.metadata as Record<string, unknown>
                : {}),
              dlq_retry_of: messageKey,
              dlq_retry_attempt: attempts,
            },
          };

          const { error: enqErr } = await supa.rpc("enqueue_email", {
            queue_name: queue,
            payload: retryPayload,
          });
          if (enqErr) {
            console.error("dlq requeue failed", { dlq, messageKey, message: enqErr.message });
            continue;
          }

          await supa.rpc("delete_email", { queue_name: dlq, message_id: msg.msg_id });

          await supa.from("email_dlq_retry_state").upsert({
            queue_name: dlq,
            message_key: messageKey,
            recipient_email: recipient,
            template_name: template,
            attempts,
            last_error: lastError,
            paused: false,
            next_attempt_at: new Date(
              Date.now() + backoffMinutes(attempts) * 60 * 1000,
            ).toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: "queue_name,message_key" });

          await supa.from("email_send_log").insert({
            message_id: retryPayload.message_id,
            template_name: template ?? queue,
            recipient_email: recipient,
            status: "pending",
            error_message: null,
            metadata: { dlq_retry_of: messageKey, attempt: attempts },
          });

          perQueue.requeued++;
          summary.requeued++;
        }

        summary.queues[dlq] = perQueue;
      }
    } finally {
      await releaseLease(supa);
    }

    return json({ ok: true, ...summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("reprocess-email-dlq crashed", message);
    return json({ error: "DLQ reprocessing failed", detail: message.slice(0, 500) }, 500);
  }
});
