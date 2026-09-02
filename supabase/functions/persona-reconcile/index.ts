/**
 * Reconciliation worker — recovers from missed / failed Persona webhooks.
 *
 * Polls Persona for every inquiry that is still non-terminal (or was recently
 * updated) and re-applies the authoritative status to our database. Safe to
 * run on a schedule (pg_cron) and idempotent: identical statuses are no-ops.
 */
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuthenticated } from "../_shared/guard.ts";

const PERSONA_BASE = "https://withpersona.com/api/v1";
const PERSONA_VERSION = "2023-01-05";

const STATUS_MAP: Record<string, string> = {
  approved: "approved",
  completed: "approved",
  declined: "declined",
  failed: "declined",
  needs_review: "needs_review",
  pending: "pending",
  created: "pending",
  expired: "expired",
};

const TERMINAL = new Set(["approved", "declined", "expired"]);

async function fetchInquiry(apiKey: string, inquiryId: string, attempt = 1): Promise<Response> {
  const res = await fetch(`${PERSONA_BASE}/inquiries/${inquiryId}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Persona-Version": PERSONA_VERSION,
      Accept: "application/json",
    },
  });
  // Retry transient provider failures with backoff.
  if ((res.status === 429 || res.status >= 500) && attempt < 3) {
    const retryAfter = Number(res.headers.get("retry-after") ?? 0) * 1000;
    await new Promise((r) => setTimeout(r, retryAfter || 500 * 2 ** (attempt - 1)));
    return fetchInquiry(apiKey, inquiryId, attempt + 1);
  }
  return res;
}

function collectMismatches(attrs: Record<string, unknown>): Record<string, unknown> {
  const mm: Record<string, unknown> = {};
  const checks = (attrs?.checks ?? []) as Array<Record<string, unknown>>;
  if (Array.isArray(checks)) {
    for (const c of checks) {
      const inner = (c?.attributes ?? {}) as Record<string, unknown>;
      const st = (c?.status ?? inner.status) as string | undefined;
      if (st && st !== "passed") {
        mm[(c?.name ?? inner.name ?? "unknown") as string] = { status: st, reasons: c?.reasons ?? inner.reasons };
      }
    }
  }
  const dr = attrs?.["decision-reason"] ?? attrs?.decision_reason;
  if (dr) mm._decision_reason = dr;
  return mm;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Signed-in users may reconcile their own verification; cron/service callers
  // run the scheduled sweep.
  const caller = await requireAuthenticated(req);
  if (caller instanceof Response) return caller;

  const correlationId = req.headers.get("x-correlation-id") ?? `reconcile-${crypto.randomUUID()}`;
  const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const log = (step: string, outcome: string, extra: Record<string, unknown> = {}) =>
    supa.from("verification_event_log").insert({
      correlation_id: correlationId,
      stage: "identity",
      step,
      outcome,
      provider: "persona",
      context: extra,
    }).then(() => {}, () => {});

  try {
    const apiKey = Deno.env.get("PERSONA_API_KEY");
    if (!apiKey) {
      await log("reconcile", "skipped", { reason: "persona_invalid_api_key" });
      return new Response(JSON.stringify({ ok: false, error: "persona_not_configured" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: { inquiry_id?: string; limit?: number; max_age_hours?: number } = {};
    if (req.method === "POST") body = await req.json().catch(() => ({}));

    const limit = Math.min(body.limit ?? 100, 500);
    const maxAgeHours = body.max_age_hours ?? 24 * 14;

    let query = supa
      .from("persona_inquiries")
      .select("id, inquiry_id, user_id, status, subject_type, subject_ref, updated_at")
      .not("inquiry_id", "is", null)
      .order("updated_at", { ascending: true })
      .limit(limit);

    // Least privilege: non-admin callers may only reconcile their own
    // inquiries. Internal/cron and admin callers run the full sweep.
    const privileged = caller.internal ||
      caller.roles.some((r) => r === "admin" || r === "admin_assistant");
    if (!privileged) query = query.eq("user_id", caller.userId);

    if (body.inquiry_id) {
      query = query.eq("inquiry_id", body.inquiry_id);
    } else {
      // Anything not yet terminal, updated within the retention window.
      query = query
        .in("status", ["created", "pending", "submitted", "needs_review"])
        .gte("updated_at", new Date(Date.now() - maxAgeHours * 3600_000).toISOString());
    }

    const { data: rows, error } = await query;
    if (error) throw error;

    let checked = 0, updated = 0, failed = 0;
    const changes: Array<{ inquiry_id: string; from: string; to: string }> = [];

    for (const row of rows ?? []) {
      checked++;
      try {
        const res = await fetchInquiry(apiKey, row.inquiry_id as string);
        if (res.status === 404) {
          await log("reconcile_inquiry", "failed", { inquiry_id: row.inquiry_id, reason: "inquiry_not_found" });
          failed++;
          continue;
        }
        if (!res.ok) {
          failed++;
          await log("reconcile_inquiry", "failed", { inquiry_id: row.inquiry_id, http_status: res.status });
          continue;
        }
        const payload = await res.json();
        const attrs = (payload?.data?.attributes ?? {}) as Record<string, unknown>;
        const remote = STATUS_MAP[String(attrs.status ?? "")] ?? "pending";
        if (remote === row.status) continue;

        const mismatch = collectMismatches(attrs);
        const nowIso = new Date().toISOString();

        const { error: upErr } = await supa
          .from("persona_inquiries")
          .update({
            status: remote,
            verified_at: remote === "approved" ? nowIso : null,
            mismatch_fields: mismatch,
            raw_payload: payload,
          })
          .eq("id", row.id);
        if (upErr) throw upErr;

        if (row.subject_type === "self" && row.user_id) {
          await supa.from("profiles").update({
            identity_verification_status: remote,
            identity_verified_at: remote === "approved" ? nowIso : null,
            identity_verified_inquiry_id: remote === "approved" ? row.inquiry_id : null,
          }).eq("user_id", row.user_id);

          // Tell the user only about meaningful (terminal) recoveries.
          if (TERMINAL.has(remote)) {
            await supa.from("inbox_messages").insert({
              user_id: row.user_id,
              direction: "inbound",
              channel: "system",
              subject: remote === "approved" ? "Identity verified" : "Verification update",
              body: `Your identity verification status is now "${remote}". Open your verification status page for details.`,
              status: "unread",
            }).then(() => {}, () => {});
          }
        }

        updated++;
        changes.push({ inquiry_id: row.inquiry_id as string, from: row.status as string, to: remote });
        await supa.from("verification_event_log").insert({
          user_id: row.user_id,
          correlation_id: correlationId,
          stage: "identity",
          step: "reconcile_inquiry",
          outcome: "succeeded",
          provider: "persona",
          context: { inquiry_id: row.inquiry_id, from: row.status, to: remote, recovered_missed_webhook: true },
        }).then(() => {}, () => {});
      } catch (e) {
        failed++;
        await log("reconcile_inquiry", "failed", { inquiry_id: row.inquiry_id, error: String(e) });
      }
    }

    await log("reconcile", "succeeded", { checked, updated, failed });

    return new Response(JSON.stringify({ ok: true, correlation_id: correlationId, checked, updated, failed, changes }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    await log("reconcile", "failed", { error: String(e) });
    return new Response(JSON.stringify({ ok: false, error: String(e), correlation_id: correlationId }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
