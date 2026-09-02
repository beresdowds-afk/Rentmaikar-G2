// deno-lint-ignore-file no-explicit-any
// Fan-out reconciliation alerts to admins via:
//   1. Email (Resend)      2. SMS (Twilio US / Termii NG)      3. In-app banner (already inserted upstream)
//
// Called by reconcile-payments; also callable manually by an admin.

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireInternal } from "../_shared/guard.ts";
import { isOptedOut } from "../_shared/opt-out.ts";
import { twilioMessagingEnabled } from "../_shared/twilio-messaging-guard.ts";
import { resendSendEmail } from "../_shared/resend-gateway.ts";

interface AlertPayload {
  alert_type: string;
  severity: string;
  psp: string | null;
  message: string;
  details: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Internal-only endpoint: cron secret or service-role bearer required.
  const denied = requireInternal(req);
  if (denied) return denied;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let payload: { run_id?: string; alerts: AlertPayload[] };
  try { payload = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  if (!payload?.alerts?.length) return json({ error: "no alerts" }, 400);

  // Load admin recipients
  const { data: admins } = await supabase
    .from("user_roles").select("user_id").eq("role", "admin");
  const adminIds = (admins ?? []).map((r: any) => r.user_id);
  if (!adminIds.length) return json({ warning: "no admins configured" });

  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, email, full_name, phone, country_code, region")
    .in("user_id", adminIds);

  const subject = `[Rentmaikar] Reconciliation alert${payload.alerts.length > 1 ? `s (${payload.alerts.length})` : ""}`;
  const bodyHtml = renderEmail(payload.alerts, payload.run_id);
  const smsText = renderSms(payload.alerts);

  const emailResults: unknown[] = [];
  const smsResults: unknown[] = [];

  // Email via Resend
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (resendKey) {
    for (const p of profiles ?? []) {
      if (!p.email) continue;
      try {
        const r = await resendSendEmail({
            from: "Rentmaikar Alerts <alerts@rentmaikar.com>",
            to: [p.email],
            subject,
            html: bodyHtml,
          }, resendKey);
        emailResults.push({ to: p.email, status: r.status });
      } catch (e) {
        emailResults.push({ to: p.email, error: String(e) });
      }
    }
  }

  // SMS: Twilio for US, Termii for NG
  const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const twilioToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const twilioFrom = Deno.env.get("TWILIO_PHONE_NUMBER");
  const termiiKey = Deno.env.get("TERMII_API_KEY");
  const termiiSender = Deno.env.get("TERMII_SENDER_ID");

  for (const p of profiles ?? []) {
    if (!p.phone) continue;
    if (await isOptedOut(p.phone, "sms")) { smsResults.push({ to: p.phone, provider: "suppressed", status: 0 }); continue; }
    const isNg = (p.country_code ?? p.region ?? "").toString().toUpperCase().startsWith("NG");
    try {
      if (isNg && termiiKey) {
        const r = await fetch("https://api.ng.termii.com/api/sms/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: p.phone, from: termiiSender ?? "Rentmaikar", sms: smsText,
            type: "plain", channel: "generic", api_key: termiiKey,
          }),
        });
        smsResults.push({ to: p.phone, provider: "termii", status: r.status });
      } else if (twilioMessagingEnabled() && twilioSid && twilioToken && twilioFrom) {
        const r = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
          {
            method: "POST",
            headers: {
              Authorization: "Basic " + btoa(`${twilioSid}:${twilioToken}`),
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ To: p.phone, From: twilioFrom, Body: smsText }),
          },
        );
        smsResults.push({ to: p.phone, provider: "twilio", status: r.status });
      }
    } catch (e) {
      smsResults.push({ to: p.phone, error: String(e) });
    }
  }

  return json({ ok: true, email: emailResults, sms: smsResults });
});

function renderEmail(alerts: AlertPayload[], runId?: string): string {
  const items = alerts.map((a) => `
    <div style="margin:12px 0;padding:12px;border-left:4px solid ${a.severity === "critical" ? "#DC2626" : "#F59E0B"};background:#0F172A;color:#E2E8F0;border-radius:6px;">
      <div style="font-weight:600;color:#10B981">${escape(a.alert_type)} · ${escape(a.severity)}${a.psp ? " · " + escape(a.psp) : ""}</div>
      <div style="margin-top:6px">${escape(a.message)}</div>
    </div>`).join("");
  return `<!doctype html><html><body style="font-family:Inter,Arial,sans-serif;background:#F8FAFC;padding:24px">
    <h2 style="color:#0A1628">Reconciliation alert</h2>
    <p>Run ID: <code>${escape(runId ?? "n/a")}</code></p>
    ${items}
    <p style="margin-top:20px;font-size:12px;color:#64748B">Open the Reconciliation Logs page in the Admin console for full details.</p>
  </body></html>`;
}

function renderSms(alerts: AlertPayload[]): string {
  const first = alerts[0];
  const more = alerts.length > 1 ? ` (+${alerts.length - 1} more)` : "";
  return `Rentmaikar: ${first.alert_type} ${first.severity}. ${first.message}${more}`.slice(0, 300);
}

function escape(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
