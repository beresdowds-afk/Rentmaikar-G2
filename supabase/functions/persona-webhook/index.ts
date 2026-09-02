// Public webhook — signature-verified with PERSONA_WEBHOOK_SECRET.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function hmac(secret: string, body: string) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const STATUS_MAP: Record<string, string> = {
  approved: "approved",
  declined: "declined",
  needs_review: "needs_review",
  pending: "pending",
  expired: "expired",
};

function collectMismatches(attrs: any): Record<string, unknown> {
  const mm: Record<string, unknown> = {};
  const checks = attrs?.checks ?? attrs?.["checks"] ?? [];
  if (Array.isArray(checks)) {
    for (const c of checks) {
      const st = c?.status ?? c?.attributes?.status;
      if (st && st !== "passed") {
        mm[c?.name ?? c?.attributes?.name ?? "unknown"] = {
          status: st,
          reasons: c?.reasons ?? c?.attributes?.reasons,
        };
      }
    }
  }
  const dr = attrs?.["decision-reason"] ?? attrs?.decision_reason;
  if (dr) mm._decision_reason = dr;
  return mm;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405, headers: corsHeaders });
  try {
    const secret = Deno.env.get("PERSONA_WEBHOOK_SECRET");
    const raw = await req.text();
    if (secret) {
      const provided = req.headers.get("persona-signature") ?? "";
      const v1 = provided.split(",").find((p) => p.trim().startsWith("v1="))?.split("=")[1] ?? provided;
      const expected = await hmac(secret, raw);
      if (v1 !== expected) {
        return new Response("invalid signature", { status: 401, headers: corsHeaders });
      }
    }
    const evt = JSON.parse(raw);
    const inquiry = evt?.data?.attributes?.payload?.data ?? evt?.data;
    const inquiryId = inquiry?.id ?? inquiry?.attributes?.["inquiry-id"];
    const attrs = inquiry?.attributes ?? {};
    const status = STATUS_MAP[attrs?.status] ?? "pending";
    if (!inquiryId) return new Response("missing inquiry id", { status: 400, headers: corsHeaders });

    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const mismatch = collectMismatches(attrs);

    const { data: row } = await supa
      .from("persona_inquiries")
      .update({
        status,
        verified_at: status === "approved" ? new Date().toISOString() : null,
        mismatch_fields: mismatch,
        raw_payload: evt,
      })
      .eq("inquiry_id", inquiryId)
      .select()
      .maybeSingle();

    if (row) {
      // Self approval → mark profile
      if (row.subject_type === "self") {
        await supa.from("profiles").update({
          identity_verification_status: status,
          identity_verified_at: status === "approved" ? new Date().toISOString() : null,
          identity_verified_inquiry_id: status === "approved" ? inquiryId : null,
        }).eq("user_id", row.user_id);

        // Notify user (in-app inbox + email) about the status change.
        try {
          const { data: prof } = await supa
            .from("profiles")
            .select("email, full_name, persona_notification_frequency")
            .eq("user_id", row.user_id)
            .maybeSingle();

          const statusLabels: Record<string, string> = {
            submitted: "Verification submitted",
            pending: "Verification in progress",
            needs_review: "Verification needs your attention",
            approved: "Identity verified",
            declined: "Verification could not be completed",
            expired: "Verification session expired",
          };
          const label = statusLabels[status] ?? `Verification update: ${status}`;
          const mismatchNote = (attrs?.["decision-reason"] as string | undefined) ??
            (Object.keys(mismatch).length ? "Some checks need review — see your verification page." : undefined);

          // In-app inbox (drives realtime toast + notifications badge) — always sent.
          await supa.from("inbox_messages").insert({
            user_id: row.user_id,
            direction: "inbound",
            channel: "system",
            subject: label,
            body: `Your Rentmaikar identity verification status changed to "${status}".${mismatchNote ? ` ${mismatchNote}` : ""} Open your verification status page for details.`,
            status: "unread",
          }).then(() => {}, () => {});

          // Email cadence honours the user's preference.
          const freq = (prof as { persona_notification_frequency?: string } | null)?.persona_notification_frequency ?? "realtime";
          if (prof?.email && freq === "realtime") {
            const firstName = (prof.full_name as string | null)?.split(" ")[0] ?? "";
            const statusUrl = `${Deno.env.get("APP_URL") ?? "https://rentmaikar.lovable.app"}/onboarding/verification-status`;
            await supa.functions.invoke("send-outbound-email", {
              body: {
                action: "send",
                to: prof.email,
                templateName: "persona_status_update",
                category: "verification",
                priority: status === "approved" || status === "declined" ? "high" : "normal",
                data: { firstName, status, statusUrl, mismatchNote },
              },
            }).catch(() => null);
          } else if (freq === "daily_digest") {
            // Buffer the event; a scheduled worker sends one summary email per day.
            await supa.from("persona_status_digest_queue").insert({
              user_id: row.user_id,
              inquiry_id: inquiryId,
              status,
              note: mismatchNote ?? null,
            }).then(() => {}, () => {});
          }
          // freq === "off": in-app only, no email at all.
        } catch (_notifyErr) { /* best-effort */ }
      }


      // Referee cascade
      if (row.subject_type === "referee" && row.subject_ref) {
        const newStatus = status === "approved" ? "verified"
          : status === "declined" ? "action_required"
          : status === "needs_review" ? "mismatch"
          : "running";
        const { data: refRow } = await supa
          .from("referee_verifications")
          .update({
            status: newStatus,
            mismatch_reason: status === "approved" ? null : (attrs?.["decision-reason"] ?? null),
            verified_at: status === "approved" ? new Date().toISOString() : null,
          })
          .eq("id", row.subject_ref)
          .select("application_id, user_id, full_name, referee_index")
          .maybeSingle();

        if (refRow && newStatus !== "verified") {
          await supa.from("inbox_messages").insert({
            user_id: refRow.user_id,
            direction: "inbound",
            channel: "system",
            subject: "Referee verification issue",
            body: `Referee #${refRow.referee_index + 1} (${refRow.full_name}) could not be verified. Please review and update this referee's details in your application.`,
            status: "unread",
          }).then(() => {}, () => {});
          await supa.from("applications")
            .update({ referees_verification_status: "action_required" })
            .eq("id", refRow.application_id);
        }
      }

      // Proxy billing: identity result drives consent link + status transitions
      if (row.subject_type === "proxy" && row.subject_ref) {
        const nextIdentity = status === "approved" ? "verified"
          : status === "declined" ? "failed"
          : "submitted";
        const { data: proxyRow } = await supa
          .from("driver_proxy_billing_accounts")
          .update({
            identity_status: nextIdentity,
            identity_verified_at: status === "approved" ? new Date().toISOString() : null,
            persona_inquiry_id: inquiryId,
          })
          .eq("id", row.subject_ref)
          .select("id, driver_id, proxy_email, proxy_phone, proxy_full_name, consent_token, consent_channels, notification_prefs")
          .maybeSingle();

        if (proxyRow) {
          await supa.from("proxy_billing_audit_log").insert({
            proxy_account_id: proxyRow.id, driver_id: proxyRow.driver_id, actor_id: null,
            actor_role: "system", action: "persona_webhook",
            details: { persona_status: status, inquiry_id: inquiryId },
            new_state: { identity_status: nextIdentity },
          }).then(() => {}, () => {});

          if (status === "approved") {
            const link = `${Deno.env.get("APP_URL") ?? "https://rentmaikar.lovable.app"}/proxy/consent?token=${proxyRow.consent_token}`;
            const message = `${proxyRow.proxy_full_name}, your identity is verified. Please sign the proxy billing consent form: ${link}`;
            const prefs: any = proxyRow.notification_prefs ?? {};
            const events = prefs.events ?? {};
            const prefChannels = prefs.channels ?? {};
            const base: string[] = (proxyRow.consent_channels as string[] | null) ?? ["email"];
            const channels: string[] = events.identity_result === false
              ? []
              : base.filter((c) => prefChannels[c] !== false);
            const jobs: Promise<any>[] = [];
            if (channels.includes("email")) {
              jobs.push(supa.functions.invoke("send-transactional-email", {
                body: {
                  templateName: "generic-notice", recipientEmail: proxyRow.proxy_email,
                  idempotencyKey: `proxy-verified-${proxyRow.id}`,
                  templateData: {
                    subject: "Identity verified — please sign the consent form",
                    body: message, ctaLabel: "Sign consent", ctaUrl: link,
                  },
                },
              }).catch(() => null));
            }
            if (channels.includes("sms") && proxyRow.proxy_phone) {
              jobs.push(supa.functions.invoke("send-sms",
                { body: { to: proxyRow.proxy_phone, message } }).catch(() => null));
            }
            if (channels.includes("whatsapp") && proxyRow.proxy_phone) {
              jobs.push(supa.functions.invoke("send-whatsapp",
                { body: { to: proxyRow.proxy_phone, message } }).catch(() => null));
            }
            await Promise.all(jobs);
          }
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
