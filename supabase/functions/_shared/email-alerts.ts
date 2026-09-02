/**
 * Alerting for Resend authorization failures (401 / 403).
 *
 * A 401 means the configured key is wrong for the endpoint we called; a 403
 * means the workspace/domain is not allowed to send. Both are terminal: every
 * subsequent email from that function fails the same way, so the team has to
 * be told immediately — with the failing recipient and the payload that was
 * rejected.
 *
 * Every alert is recorded in `public.email_provider_alerts` and fanned out to
 * admins (in-app) plus the Slack/webhook targets configured in
 * `platform_kv_settings.provider_alert_config`.
 */

const ALERT_COOLDOWN_MS = 10 * 60 * 1000;
const lastAlertAt = new Map<string, number>();

export type ResendAuthFailure = {
  functionName: string;
  status: number;
  recipient?: string | null;
  subject?: string | null;
  /** Body that was posted to Resend — trimmed before storage. */
  payload?: Record<string, unknown>;
  providerResponse?: string | null;
};

/** Strip huge/HTML fields so alerts stay readable and cheap to store. */
function excerptPayload(payload?: Record<string, unknown>): Record<string, unknown> {
  if (!payload) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (typeof v === "string") out[k] = v.length > 400 ? `${v.slice(0, 400)}…` : v;
    else if (Array.isArray(v)) out[k] = v.slice(0, 10);
    else if (v && typeof v === "object") out[k] = "[object]";
    else out[k] = v;
  }
  return out;
}

async function restInsert(table: string, rows: unknown): Promise<void> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return;
  await fetch(`${url}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify(rows),
  }).catch(() => undefined);
}

async function restSelect(path: string): Promise<unknown[]> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return [];
  try {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return [];
    return (await res.json()) as unknown[];
  } catch {
    return [];
  }
}

/**
 * Records and fans out a Resend 401/403. Never throws — alerting must never
 * take down the caller that is already failing to send.
 */
export async function reportResendAuthFailure(failure: ResendAuthFailure): Promise<void> {
  try {
    const key = `${failure.functionName}:${failure.status}`;
    const now = Date.now();
    const previous = lastAlertAt.get(key) ?? 0;
    const throttled = now - previous < ALERT_COOLDOWN_MS;
    lastAlertAt.set(key, now);

    const message =
      `Resend returned ${failure.status} in ${failure.functionName}` +
      (failure.recipient ? ` for ${failure.recipient}` : "");

    console.error("resend auth failure", {
      function: failure.functionName,
      status: failure.status,
      recipient: failure.recipient,
      response: failure.providerResponse?.slice(0, 300),
    });

    // Always persist — the monitoring page reads this table.
    await restInsert("email_provider_alerts", {
      function_name: failure.functionName,
      status: failure.status,
      recipient_email: failure.recipient ?? null,
      subject: failure.subject ?? null,
      payload_excerpt: excerptPayload(failure.payload),
      provider_response: (failure.providerResponse ?? "").slice(0, 2000),
    });

    // Fan-out is throttled per function+status so a bad key cannot spam admins.
    if (throttled) return;

    const admins = (await restSelect(
      "user_roles?select=user_id&role=eq.admin",
    )) as Array<{ user_id: string }>;
    if (admins.length) {
      await restInsert(
        "admin_notifications",
        admins.slice(0, 50).map((a) => ({
          recipient_id: a.user_id,
          kind: "provider_health_alert",
          title: `Email blocked: Resend ${failure.status}`,
          body: message,
          metadata: {
            provider: "resend",
            status: failure.status,
            function_name: failure.functionName,
            recipient_email: failure.recipient ?? null,
            subject: failure.subject ?? null,
            payload_excerpt: excerptPayload(failure.payload),
          },
        })),
      );
    }

    const cfgRows = (await restSelect(
      "platform_kv_settings?select=value&key=eq.provider_alert_config",
    )) as Array<{ value?: Record<string, unknown> }>;
    const cfg = cfgRows[0]?.value ?? {};
    const slack = typeof cfg.slack_webhook_url === "string" ? cfg.slack_webhook_url : null;
    const hook = typeof cfg.webhook_url === "string" ? cfg.webhook_url : null;

    if (slack) {
      await fetch(slack, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `:rotating_light: *Rentmaikar email* — ${message}` }),
      }).catch(() => undefined);
    }
    if (hook) {
      await fetch(hook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "resend_auth_failure",
          function_name: failure.functionName,
          status: failure.status,
          recipient_email: failure.recipient ?? null,
          subject: failure.subject ?? null,
          payload_excerpt: excerptPayload(failure.payload),
          provider_response: (failure.providerResponse ?? "").slice(0, 500),
        }),
      }).catch(() => undefined);
    }
  } catch (e) {
    console.error("reportResendAuthFailure failed", (e as Error)?.message ?? e);
  }
}
