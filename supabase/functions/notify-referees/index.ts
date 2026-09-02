// Sends confidential attestation invitations to every referee on an application,
// via Email + SMS + WhatsApp. Hardened with:
//   - Idempotency: repeated calls within IDEMPOTENCY_WINDOW_MIN reuse the last
//     successful send per (application_id, referee_id, channel) and return the
//     cached delivery results without re-sending.
//   - Retries: each channel send is retried with exponential backoff on transient
//     network failures and 5xx / 429 responses (up to MAX_ATTEMPTS).
//   - Detailed logs: every channel attempt is written to messaging_events with
//     status, provider, http status, latency and error text for troubleshooting.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";
import { logPipelineEvent } from "../_shared/pipeline-events.ts";
import { isOptedOut } from "../_shared/opt-out.ts";
import { twilioMessagingEnabled } from "../_shared/twilio-messaging-guard.ts";
import { resendSendEmail } from "../_shared/resend-gateway.ts";

const Body = z.object({
  application_id: z.string().uuid(),
  force: z.boolean().optional(), // bypass idempotency window
});

const PUBLIC_APP_URL = Deno.env.get("PUBLIC_APP_URL") ?? "https://rentmaikar.com";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const TWILIO_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const TWILIO_FROM = Deno.env.get("TWILIO_PHONE_NUMBER");
const TWILIO_WA_FROM = Deno.env.get("TWILIO_WHATSAPP_FROM") ?? (TWILIO_FROM ? `whatsapp:${TWILIO_FROM}` : null);
const TERMII_API_KEY = Deno.env.get("TERMII_API_KEY");
const TERMII_SENDER_ID = Deno.env.get("TERMII_SENDER_ID") ?? "Rentmaikar";

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 400;
const IDEMPOTENCY_WINDOW_MIN = 30;

type ChannelResult = {
  channel: "email" | "sms" | "whatsapp";
  provider: string;
  ok: boolean;
  skipped?: boolean;
  status?: number;
  attempts?: number;
  error?: string;
  latency_ms?: number;
  reused?: boolean;
};

function genToken() {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b).map(x => x.toString(16).padStart(2, "0")).join("");
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function withRetry<T extends { ok: boolean; status?: number; skipped?: boolean }>(
  fn: () => Promise<T>,
): Promise<T & { attempts: number }> {
  let lastErr: any = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fn();
      if (res.skipped) return { ...res, attempts: attempt };
      const retryable = !res.ok && (res.status === undefined || res.status === 429 || (res.status >= 500 && res.status <= 599));
      if (res.ok || !retryable || attempt === MAX_ATTEMPTS) {
        return { ...res, attempts: attempt };
      }
    } catch (e) {
      lastErr = e;
      if (attempt === MAX_ATTEMPTS) {
        return { ok: false, status: 0, attempts: attempt, error: String(e) } as any;
      }
    }
    await sleep(BASE_BACKOFF_MS * Math.pow(2, attempt - 1));
  }
  return { ok: false, attempts: MAX_ATTEMPTS, error: String(lastErr) } as any;
}

async function sendEmail(to: string, name: string, driverName: string, link: string): Promise<ChannelResult> {
  if (!RESEND_API_KEY || !to) return { channel: "email", provider: "resend", ok: false, skipped: true };
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#0A1628">
      <h2 style="color:#10B981">Confidential Referee Attestation</h2>
      <p>Hello ${name || "there"},</p>
      <p><strong>${driverName}</strong> has listed you as a referee on their Rentmaikar driver application.</p>
      <p><strong>Your response is confidential.</strong> Attesting does <strong>not</strong> place you under any financial obligation or guarantee.</p>
      <p style="margin:24px 0"><a href="${link}" style="background:#10B981;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Provide your attestation</a></p>
      <p style="color:#6b7280;font-size:12px">Link: ${link}</p>
    </div>`;
  const t0 = Date.now();
  const res = await withRetry(async () => {
    const r = await resendSendEmail({
        from: "Rentmaikar Verification <verify@rentmaikar.com>",
        to: [to], subject: `Confidential referee attestation for ${driverName}`, html,
      }, RESEND_API_KEY);
    const txt = r.ok ? "" : await r.text().catch(() => "");
    return { ok: r.ok, status: r.status, error: txt.slice(0, 300) };
  });
  return { channel: "email", provider: "resend", latency_ms: Date.now() - t0, ...res };
}

async function sendTwilio(to: string, body: string, channel: "sms" | "whatsapp"): Promise<ChannelResult> {
  if (await isOptedOut(to, channel)) {
    console.log(`[opt-out] Suppressed ${channel} to ${to}`);
    return { channel, provider: "twilio", ok: false, skipped: true };
  }

  if (!twilioMessagingEnabled() || !TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
    return { channel, provider: "twilio", ok: false, skipped: true };
  }
  const from = channel === "whatsapp" ? TWILIO_WA_FROM! : TWILIO_FROM;
  const dest = channel === "whatsapp" ? `whatsapp:${to}` : to;
  const auth = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`);
  const t0 = Date.now();
  const res = await withRetry(async () => {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: dest, From: from, Body: body, StatusCallback: `${Deno.env.get("SUPABASE_URL")}/functions/v1/twilio-webhook` }),
    });

    const txt = r.ok ? "" : await r.text().catch(() => "");
    return { ok: r.ok, status: r.status, error: txt.slice(0, 300) };
  });
  return { channel, provider: "twilio", latency_ms: Date.now() - t0, ...res };
}

async function sendTermii(to: string, body: string): Promise<ChannelResult> {
  if (!TERMII_API_KEY) return { channel: "sms", provider: "termii", ok: false, skipped: true };
  const t0 = Date.now();
  const res = await withRetry(async () => {
    const r = await fetch("https://api.ng.termii.com/api/sms/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, from: TERMII_SENDER_ID, sms: body, type: "plain", channel: "generic", api_key: TERMII_API_KEY, notify_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/termii-webhook` }),
    });

    const txt = r.ok ? "" : await r.text().catch(() => "");
    return { ok: r.ok, status: r.status, error: txt.slice(0, 300) };
  });
  return { channel: "sms", provider: "termii", latency_ms: Date.now() - t0, ...res };
}

function isNigeria(phone?: string | null) {
  return !!phone && (phone.startsWith("+234") || phone.startsWith("234"));
}

async function logEvent(supa: any, refereeId: string, applicationId: string, r: ChannelResult) {
  try {
    await supa.from("messaging_events").insert({
      event_type: `referee_notify_${r.channel}`,
      channel: r.channel,
      provider: r.provider,
      status: r.skipped ? "skipped" : r.ok ? "sent" : "failed",
      http_status: r.status ?? null,
      attempts: r.attempts ?? 1,
      latency_ms: r.latency_ms ?? null,
      error_message: r.error ?? null,
      related_id: refereeId,
      related_type: "referee_verification",
      metadata: { application_id: applicationId, reused: !!r.reused },
    });
  } catch { /* messaging_events schema tolerant; do not fail send on log */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let appId: string | null = null;
  let actorId: string | null = null;
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    appId = parsed.data.application_id;
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const auth = req.headers.get("authorization") ?? "";
    const jwt = auth.replace(/^Bearer\s+/i, "");
    const { data: userData } = jwt ? await supa.auth.getUser(jwt) : { data: { user: null } as any };
    if (!userData?.user) {
      await logPipelineEvent({ application_id: appId, event_type: "notify_referees", status: "error", message: "unauthorized" });
      return new Response(JSON.stringify({ error: "unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    actorId = userData.user.id;
    await logPipelineEvent({ application_id: appId, event_type: "notify_referees", status: "started", actor_id: actorId });

    const { data: app } = await supa.from("applications").select("id,user_id,first_name,last_name")
      .eq("id", parsed.data.application_id).maybeSingle();
    if (!app) {
      await logPipelineEvent({ application_id: appId, event_type: "notify_referees", status: "error", message: "application not found", actor_id: actorId });
      return new Response(JSON.stringify({ error: "application not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const isOwner = app.user_id === userData.user.id;
    if (!isOwner) {
      const { data: role } = await supa.from("user_roles").select("role")
        .eq("user_id", userData.user.id).in("role", ["admin", "admin_assistant"] as any).maybeSingle();
      if (!role) {
        await logPipelineEvent({ application_id: appId, event_type: "notify_referees", status: "error", message: "forbidden", actor_id: actorId });
        return new Response(JSON.stringify({ error: "forbidden" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const composedName = [(app as any).first_name, (app as any).last_name].filter(Boolean).join(" ").trim();
    const driverName = composedName || "A Rentmaikar driver";

    const { data: refs } = await supa.from("referee_verifications").select("*")
      .eq("application_id", app.id).order("referee_index");
    if (!refs || refs.length === 0) {
      await logPipelineEvent({ application_id: appId, event_type: "notify_referees", status: "success", message: "no referees", actor_id: actorId, details: { sent: 0 } });
      return new Response(JSON.stringify({ ok: true, sent: 0, message: "no referees" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const cutoff = Date.now() - IDEMPOTENCY_WINDOW_MIN * 60 * 1000;
    const results: any[] = [];

    for (const r of refs) {
      // Idempotency: skip full send if we sent successfully within window
      const lastSentAt = (r as any).attestation_sent_at ? Date.parse((r as any).attestation_sent_at) : 0;
      const alreadyNotified = (r as any).notified_channels?.length > 0;
      if (!parsed.data.force && alreadyNotified && lastSentAt > cutoff) {
        results.push({
          referee_index: r.referee_index, referee_id: r.id,
          reused: true, channels: (r as any).notified_channels,
          message: "idempotent: within window",
        });
        continue;
      }

      const token = (r as any).attestation_token ?? genToken();
      const link = `${PUBLIC_APP_URL}/referee-attest?token=${token}`;
      const smsBody = `Hi ${r.full_name || "there"}, ${driverName} listed you as a referee on Rentmaikar. Please confirm their suitability (confidential, no financial obligation): ${link}`;

      const channelResults: ChannelResult[] = [];
      if (r.email) channelResults.push(await sendEmail(r.email, r.full_name, driverName, link));
      if (r.phone) {
        channelResults.push(
          isNigeria(r.phone)
            ? await sendTermii(r.phone, smsBody)
            : await sendTwilio(r.phone, smsBody, "sms"),
        );
        channelResults.push(await sendTwilio(r.phone, smsBody, "whatsapp"));
      }

      // Log each attempt
      for (const cr of channelResults) await logEvent(supa, r.id, app.id, cr);

      const successful = channelResults.filter(c => c.ok).map(c => c.channel);
      const failures = channelResults.filter(c => !c.ok && !c.skipped);

      await supa.from("referee_verifications").update({
        attestation_token: token,
        attestation_status: successful.length ? "sent" : (r as any).attestation_status ?? "not_sent",
        attestation_sent_at: new Date().toISOString(),
        notified_channels: successful,
      }).eq("id", r.id);

      results.push({
        referee_index: r.referee_index, referee_id: r.id,
        channels: successful, failures: failures.length,
        details: channelResults,
      });
    }

    const summary = {
      total: results.length,
      reused: results.filter(r => r.reused).length,
      any_failures: results.some(r => r.failures > 0),
    };
    await logPipelineEvent({
      application_id: appId, event_type: "notify_referees",
      status: summary.any_failures ? "error" : "success",
      message: summary.any_failures ? `${results.filter(r=>r.failures>0).length} referee(s) had channel failures` : `Sent to ${results.length} referee(s)`,
      actor_id: actorId, details: summary,
    });

    return new Response(JSON.stringify({ ok: true, application_id: app.id, sent: results.length, summary, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    await logPipelineEvent({ application_id: appId, event_type: "notify_referees", status: "error", message: String(e).slice(0, 500), actor_id: actorId });
    return new Response(JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
