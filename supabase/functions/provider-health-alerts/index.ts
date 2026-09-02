// ════════════════════════════════════════════════════════════
// Scheduled provider health watchdog.
//
// Looks at the last N hours (1–6, admin configurable) of communication
// traffic and raises an alert when a provider's delivery/bounce error rate
// spikes or when webhook deliveries start failing.
//
//   Sources: messaging_events (Twilio / Termii / Resend lifecycle),
//            email_logs + email_bounces (Resend), webhook_deliveries.
//
// Alerts are written to `provider_health_alerts`, fanned out to admins via
// `admin_notifications`, emailed through send-outbound-email, and pushed to
// Slack / a generic webhook when those URLs are configured.
//
// Config lives in platform_kv_settings under `provider_alert_config`, so
// thresholds and destinations change without a redeploy.
// ════════════════════════════════════════════════════════════

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";
import { requireInternal } from "../_shared/guard.ts";

const CONFIG_KEY = "provider_alert_config";

const PROVIDERS = ["twilio", "termii", "resend"] as const;
type Provider = (typeof PROVIDERS)[number];

const PROVIDER_LABEL: Record<Provider, string> = {
  twilio: "Twilio (SMS / WhatsApp / Voice)",
  termii: "Termii (Nigeria SMS)",
  resend: "Resend (Email)",
};

interface AlertConfig {
  enabled: boolean;
  window_hours: number;          // 1–6
  min_sample: number;            // don't alert on tiny traffic
  error_rate_threshold: number;  // 0–1
  critical_rate_threshold: number;
  webhook_failure_threshold: number;
  cooldown_minutes: number;
  email_enabled: boolean;
  email_recipients: string[];    // empty => all admins
  slack_webhook_url: string | null;
  webhook_url: string | null;
}

const DEFAULT_CONFIG: AlertConfig = {
  enabled: true,
  window_hours: 1,
  min_sample: 20,
  error_rate_threshold: 0.2,
  critical_rate_threshold: 0.4,
  webhook_failure_threshold: 5,
  cooldown_minutes: 60,
  email_enabled: true,
  email_recipients: [],
  slack_webhook_url: null,
  webhook_url: null,
};

const Body = z.object({
  window_hours: z.number().int().min(1).max(6).optional(),
  notify: z.boolean().optional(),
  dry_run: z.boolean().optional(),
});

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface Metrics {
  provider: Provider;
  attempts: number;
  failures: number;
  bounces: number;
  webhookErrors: number;
  samples: string[];
}

// deno-lint-ignore no-explicit-any
type Supa = any;

async function readConfig(supa: Supa): Promise<AlertConfig> {
  try {
    const { data } = await supa
      .from("platform_kv_settings")
      .select("value")
      .eq("key", CONFIG_KEY)
      .maybeSingle();
    const raw = (data?.value ?? {}) as Partial<AlertConfig>;
    const cfg = { ...DEFAULT_CONFIG, ...raw };
    cfg.window_hours = Math.min(6, Math.max(1, Number(cfg.window_hours) || 1));
    return cfg;
  } catch {
    return DEFAULT_CONFIG;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Internal-only endpoint. Accept the standard internal guard (service-role
  // bearer / env cron secret) or a scheduler token verified against the value
  // stored in the database vault, so scheduled runs keep working even if the
  // environment copy of the token drifts.
  if (requireInternal(req)) {
    const token = req.headers.get("x-cron-secret") ?? req.headers.get("x-internal-secret");
    const { data: tokenOk } = await supa.rpc("verify_cron_token", { _token: token ?? "" });
    if (tokenOk !== true) {
      return json(401, { error: "Unauthorized" });
    }
  }


  let body: z.infer<typeof Body> = {};
  try {
    const raw = await req.json();
    const parsed = Body.safeParse(raw ?? {});
    if (!parsed.success) return json(400, { error: parsed.error.flatten() });
    body = parsed.data;
  } catch {
    body = {};
  }

  const cfg = await readConfig(supa);
  const windowHours = body.window_hours ?? cfg.window_hours;
  const since = new Date(Date.now() - windowHours * 3600_000).toISOString();
  const notify = (body.notify ?? true) && cfg.enabled && !body.dry_run;

  const [events, emails, bounces, hooks] = await Promise.all([
    supa.from("messaging_events")
      .select("provider, channel, event_type, error_code, error_message, created_at")
      .gte("created_at", since).limit(5000),
    supa.from("email_logs")
      .select("status, error, created_at").gte("created_at", since).limit(5000),
    supa.from("email_bounces")
      .select("bounce_type, bounced_at").gte("bounced_at", since).limit(2000),
    supa.from("webhook_deliveries")
      .select("status, response_status, error_message, event_type, created_at")
      .gte("created_at", since).limit(2000),
  ]);

  const metrics: Record<Provider, Metrics> = {
    twilio: { provider: "twilio", attempts: 0, failures: 0, bounces: 0, webhookErrors: 0, samples: [] },
    termii: { provider: "termii", attempts: 0, failures: 0, bounces: 0, webhookErrors: 0, samples: [] },
    resend: { provider: "resend", attempts: 0, failures: 0, bounces: 0, webhookErrors: 0, samples: [] },
  };

  for (const e of events.data ?? []) {
    const p = String(e.provider ?? "").toLowerCase() as Provider;
    if (!(p in metrics)) continue;
    const m = metrics[p];
    const type = String(e.event_type ?? "");
    if (["sent", "delivered", "failed", "undelivered", "bounced"].includes(type)) m.attempts += 1;
    if (type === "failed" || type === "undelivered") m.failures += 1;
    if (type === "bounced") m.bounces += 1;
    if (e.error_message && m.samples.length < 5) {
      m.samples.push(`${e.channel ?? "?"}: ${e.error_code ? `[${e.error_code}] ` : ""}${e.error_message}`);
    }
  }

  for (const l of emails.data ?? []) {
    const m = metrics.resend;
    if (["sent", "delivered", "failed", "bounced"].includes(String(l.status))) m.attempts += 1;
    if (l.status === "failed") {
      m.failures += 1;
      if (l.error && m.samples.length < 5) m.samples.push(`email: ${l.error}`);
    }
    if (l.status === "bounced") m.bounces += 1;
  }

  metrics.resend.bounces += (bounces.data ?? []).length;

  // Webhook health — failed callback deliveries (any provider integration).
  let webhookFailures = 0;
  const webhookSamples: string[] = [];
  for (const h of hooks.data ?? []) {
    const failed = h.status === "failed" || (h.response_status && Number(h.response_status) >= 400);
    if (!failed) continue;
    webhookFailures += 1;
    if (webhookSamples.length < 5) {
      webhookSamples.push(`${h.event_type ?? "webhook"} → ${h.response_status ?? "error"}: ${h.error_message ?? "no response"}`);
    }
  }

  interface PendingAlert {
    provider: string;
    channel: string | null;
    alert_type: string;
    severity: string;
    error_rate: number | null;
    sample_size: number;
    failures: number;
    message: string;
    details: Record<string, unknown>;
    dedupe_key: string;
  }

  const pending: PendingAlert[] = [];

  for (const p of PROVIDERS) {
    const m = metrics[p];
    const bad = m.failures + m.bounces;
    if (m.attempts < cfg.min_sample || bad === 0) continue;
    const rate = bad / m.attempts;
    if (rate < cfg.error_rate_threshold) continue;
    pending.push({
      provider: p,
      channel: p === "resend" ? "email" : null,
      alert_type: "delivery_error_spike",
      severity: rate >= cfg.critical_rate_threshold ? "critical" : "warning",
      error_rate: Number(rate.toFixed(4)),
      sample_size: m.attempts,
      failures: bad,
      message: `${PROVIDER_LABEL[p]}: ${(rate * 100).toFixed(1)}% delivery errors (${bad}/${m.attempts}) in the last ${windowHours}h`,
      details: {
        window_hours: windowHours,
        failures: m.failures,
        bounces: m.bounces,
        attempts: m.attempts,
        samples: m.samples,
        threshold: cfg.error_rate_threshold,
      },
      dedupe_key: `delivery_error_spike:${p}`,
    });
  }

  if (webhookFailures >= cfg.webhook_failure_threshold) {
    pending.push({
      provider: "webhooks",
      channel: "webhook",
      alert_type: "webhook_failures",
      severity: webhookFailures >= cfg.webhook_failure_threshold * 3 ? "critical" : "warning",
      error_rate: null,
      sample_size: (hooks.data ?? []).length,
      failures: webhookFailures,
      message: `${webhookFailures} webhook delivery failure(s) in the last ${windowHours}h`,
      details: { window_hours: windowHours, samples: webhookSamples, threshold: cfg.webhook_failure_threshold },
      dedupe_key: "webhook_failures:all",
    });
  }

  // Cooldown — skip anything already alerted inside the cooldown window.
  const cooldownSince = new Date(Date.now() - cfg.cooldown_minutes * 60_000).toISOString();
  const { data: recent } = await supa
    .from("provider_health_alerts")
    .select("dedupe_key")
    .gte("created_at", cooldownSince);
  const recentKeys = new Set((recent ?? []).map((r: { dedupe_key: string | null }) => r.dedupe_key));
  const fresh = pending.filter((a) => !recentKeys.has(a.dedupe_key));

  const summary = {
    ok: true,
    window_hours: windowHours,
    metrics: Object.values(metrics),
    webhook_failures: webhookFailures,
    candidates: pending.length,
    raised: 0,
    suppressed_by_cooldown: pending.length - fresh.length,
    notified: [] as string[],
  };

  if (!fresh.length || !notify) return json(200, summary);

  const dashboardUrl =
    `${Deno.env.get("APP_URL") ?? "https://rentmaikar.lovable.app"}/admin?tab=contact-settings`;

  // Recipients: explicit list, else every admin with an email on file.
  let recipients = cfg.email_recipients.filter(Boolean);
  const { data: adminRoles } = await supa
    .from("user_roles").select("user_id").eq("role", "admin");
  const adminIds = [...new Set((adminRoles ?? []).map((r: { user_id: string }) => r.user_id))];
  if (!recipients.length && adminIds.length) {
    const { data: profs } = await supa
      .from("profiles").select("email").in("id", adminIds);
    recipients = (profs ?? [])
      .map((p: { email: string | null }) => p.email)
      .filter((e: string | null): e is string => !!e);
  }

  for (const alert of fresh) {
    const channels: string[] = [];

    // In-app admin notifications
    if (adminIds.length) {
      await supa.from("admin_notifications").insert(
        adminIds.map((recipient_id: string) => ({
          recipient_id,
          kind: "provider_health_alert",
          title: `Provider alert: ${alert.provider}`,
          body: alert.message,
          metadata: { ...alert.details, alert_type: alert.alert_type, severity: alert.severity },
        })) as never,
      );
      channels.push("in_app");
    }

    // Email
    if (cfg.email_enabled && recipients.length) {
      const lines = [
        alert.message,
        ...(Array.isArray(alert.details.samples) ? (alert.details.samples as string[]) : []),
      ];
      for (const to of recipients.slice(0, 20)) {
        await supa.functions.invoke("send-outbound-email", {
          body: {
            action: "send",
            to,
            templateName: "provider_health_alert",
            category: "notification",
            priority: "high",
            data: {
              provider: alert.provider,
              severity: alert.severity,
              windowHours: windowHours,
              headline: alert.message,
              lines,
              dashboardUrl,
            },
          },
        }).catch(() => undefined);
      }
      channels.push("email");
    }

    // Slack
    if (cfg.slack_webhook_url) {
      await fetch(cfg.slack_webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `${alert.severity === "critical" ? ":rotating_light:" : ":warning:"} *Rentmaikar provider alert* — ${alert.message}`,
        }),
      }).catch(() => undefined);
      channels.push("slack");
    }

    // Generic webhook
    if (cfg.webhook_url) {
      await fetch(cfg.webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "provider_health_alert", ...alert }),
      }).catch(() => undefined);
      channels.push("webhook");
    }

    await supa.from("provider_health_alerts").insert({
      provider: alert.provider,
      channel: alert.channel,
      alert_type: alert.alert_type,
      severity: alert.severity,
      window_hours: windowHours,
      error_rate: alert.error_rate,
      sample_size: alert.sample_size,
      failures: alert.failures,
      message: alert.message,
      details: alert.details,
      notified_channels: channels,
      dedupe_key: alert.dedupe_key,
    } as never);

    summary.raised += 1;
    summary.notified = [...new Set([...summary.notified, ...channels])];
  }

  return json(200, summary);
});
