import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireCronSecretAsync } from "../_shared/cron-auth.ts";
import { renderEventCopy, resolveEventTemplate } from "../_shared/event-template-map.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const BATCH_SIZE = 25;
const MAX_ATTEMPTS = 5;
/** Per-request timeout for every downstream call (email/push/slack/webhook). */
const FETCH_TIMEOUT_MS = 10_000;
/** Wall-clock budget: stop pulling new rows before the edge runtime kills us (502). */
const MAX_RUNTIME_MS = 40_000;

/** fetch with a hard timeout so one hanging destination cannot stall the run. */
async function fetchWithTimeout(input: string, init: RequestInit) {
  try {
    return await fetch(input, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (e) {
    const name = (e as Error)?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      throw new Error(`Request timed out after ${FETCH_TIMEOUT_MS}ms`);
    }
    throw e;
  }
}

interface OutboxRow {
  id: string;
  recipient_id: string;
  channel: "email" | "slack" | "webhook" | "push";
  category: string;
  kind: string;
  title: string;
  body: string | null;
  source_table: string | null;
  record_id: string | null;
  deep_link: string | null;
  destination: string | null;
  payload: Record<string, unknown>;
  attempts: number;
}

/** HMAC-SHA256 hex signature over `${timestamp}.${body}`. */
async function signPayload(secret: string, timestamp: string, body: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authError = await requireCronSecretAsync(req);
  if (authError) return authError;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const startedAt = Date.now();
  const results = { processed: 0, sent: 0, failed: 0, skipped: 0, deferred: 0 };

  try {
    const { data: rows, error } = await supabase
      .from("event_notification_outbox")
      .select("*")
      .eq("status", "pending")
      .lt("attempts", MAX_ATTEMPTS)
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (error) throw error;

    for (const row of (rows ?? []) as OutboxRow[]) {
      if (Date.now() - startedAt > MAX_RUNTIME_MS) {
        // Leave the rest pending; the next scheduled run picks them up.
        results.deferred++;
        continue;
      }
      results.processed++;
      let status = "sent";
      let lastError: string | null = null;

      const eventStatus = (row.payload?.status as string) ?? null;
      const mapping = resolveEventTemplate(row.kind, eventStatus);

      try {
        if (row.channel === "email") {
          const { data: profile } = await supabase
            .from("profiles")
            .select(
              "email, full_name, phone, preferred_country, notification_sms, notification_whatsapp",
            )
            .eq("user_id", row.recipient_id)
            .maybeSingle();

          const vars = {
            first_name: (profile?.full_name ?? "").split(" ")[0] || "there",
            status: eventStatus ?? "",
            record_id: row.record_id ?? "",
            deep_link: row.deep_link ?? "https://rentmaikar.com",
          };

          const to = profile?.email;
          if (!to) {
            status = "skipped";
            lastError = "No email address on profile";
          } else {
            const res = await fetchWithTimeout(`${supabaseUrl}/functions/v1/send-outbound-email`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${serviceKey}`,
              },
              body: JSON.stringify({
                action: "send",
                to,
                templateName: mapping?.emailTemplate ?? "event_notification",
                category: "notification",
                country: profile?.preferred_country ?? undefined,
                data: {
                  title: mapping ? renderEventCopy(mapping.emailSubject, vars) : row.title,
                  body: mapping ? renderEventCopy(mapping.emailBody, vars) : (row.body ?? ""),
                  category: row.category,
                  status: eventStatus ?? undefined,
                  recordId: row.record_id ?? undefined,
                  deepLink: vars.deep_link,
                },
              }),
            });
            if (!res.ok) {
              status = "failed";
              lastError = `[${res.status}] ${await res.text()}`;
            }
          }

          // Companion SMS / WhatsApp leg (email stays mandatory, plus one
          // messaging channel when the event map declares it).
          if (mapping && profile?.phone) {
            const wantsWhatsapp =
              mapping.channels.includes("whatsapp") && profile.notification_whatsapp !== false;
            const wantsSms =
              mapping.channels.includes("sms") && profile.notification_sms !== false;
            const channel = wantsWhatsapp ? "whatsapp" : wantsSms ? "sms" : null;

            if (channel) {
              try {
                const copy = renderEventCopy(
                  channel === "whatsapp" ? mapping.whatsapp : mapping.sms,
                  vars,
                );
                const res = await fetchWithTimeout(
                  `${supabaseUrl}/functions/v1/send-sms-notification`,
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${serviceKey}`,
                    },
                    body: JSON.stringify({
                      phone: profile.phone,
                      channel,
                      notificationType: mapping.smsNotificationType,
                      name: vars.first_name,
                      customMessage: copy,
                    }),
                  },
                );
                if (!res.ok) {
                  console.error(
                    `event ${row.kind} ${channel} leg failed [${res.status}]: ${await res.text()}`,
                  );
                }
              } catch (e) {
                console.error(
                  `event ${row.kind} messaging leg error:`,
                  e instanceof Error ? e.message : String(e),
                );
              }
            }
          }
        } else if (row.channel === "push") {
          const pushVars = {
            first_name: "there",
            status: eventStatus ?? "",
            record_id: row.record_id ?? "",
            deep_link: row.deep_link ?? "https://rentmaikar.com",
          };
          const res = await fetchWithTimeout(`${supabaseUrl}/functions/v1/send-push-notification`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              user_id: row.recipient_id,
              event: row.kind,
              title: mapping ? renderEventCopy(mapping.pushTitle, pushVars) : row.title,
              body: mapping
                ? renderEventCopy(mapping.pushBody, pushVars)
                : (row.body ?? row.title),
              data: {
                category: row.category,
                url: pushVars.deep_link,
                record_id: row.record_id ?? "",
              },
            }),
          });

          if (!res.ok) {
            status = "failed";
            lastError = `[${res.status}] ${await res.text()}`;
          }
        } else if (row.channel === "slack") {
          const res = await fetchWithTimeout(row.destination!, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: `*${row.title}*\n${row.body ?? ""}\n<${row.deep_link}|Open record>`,
            }),
          });
          if (!res.ok) {
            status = "failed";
            lastError = `[${res.status}] ${await res.text()}`;
          }
        } else {
          // Signed outbound webhook
          const { data: pref } = await supabase
            .from("event_notification_preferences")
            .select("webhook_secret")
            .eq("user_id", row.recipient_id)
            .eq("category", row.category)
            .maybeSingle();

          const timestamp = Math.floor(Date.now() / 1000).toString();
          const payload = {
            id: row.id,
            type: row.kind,
            category: row.category,
            created_at: new Date().toISOString(),
            title: row.title,
            message: row.body,
            record: {
              table: row.source_table,
              id: row.record_id,
              status: row.payload?.status ?? null,
              previous_status: row.payload?.previous_status ?? null,
              operation: row.payload?.operation ?? null,
              url: row.deep_link,
            },
          };
          const bodyText = JSON.stringify(payload);
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "X-Rentmaikar-Event": row.kind,
            "X-Rentmaikar-Timestamp": timestamp,
          };
          if (pref?.webhook_secret) {
            headers["X-Rentmaikar-Signature"] = `sha256=${await signPayload(
              pref.webhook_secret,
              timestamp,
              bodyText,
            )}`;
          }

          const res = await fetchWithTimeout(row.destination!, {
            method: "POST",
            headers,
            body: bodyText,
          });
          if (!res.ok) {
            status = "failed";
            lastError = `[${res.status}] ${await res.text()}`;
          }
        }
      } catch (e) {
        status = "failed";
        lastError = e instanceof Error ? e.message : String(e);
      }

      const attempts = row.attempts + 1;
      const finalStatus =
        status === "failed" && attempts < MAX_ATTEMPTS ? "pending" : status;

      await supabase
        .from("event_notification_outbox")
        .update({
          status: finalStatus,
          attempts,
          last_error: lastError,
          delivered_at: status === "sent" ? new Date().toISOString() : null,
        })
        .eq("id", row.id);

      if (status === "sent") results.sent++;
      else if (status === "skipped") results.skipped++;
      else results.failed++;
    }

    return new Response(JSON.stringify({ success: true, ...results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("dispatch-event-notifications failed:", message);
    return new Response(JSON.stringify({ error: message, ...results }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
