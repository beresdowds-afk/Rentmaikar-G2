// Live credential verification for every third-party provider the platform
// depends on. Admins call this straight after saving a secret so they get an
// immediate pass/fail instead of discovering a bad key when a job runs.
//
// Every check performs a real, read-only API call with the stored credentials.
// Nothing sensitive is ever returned — only the provider id, a status, a short
// human message and (optionally) a masked hint such as the account name.
import { corsHeaders } from "../_shared/cors.ts";
import { getPayPalConfig, ensurePayPalConfig } from "../_shared/paypal-client.ts";
import { isCallerAdmin } from "../_shared/admin-auth.ts";
import { hologram } from "../_shared/hologram-client.ts";
import { traccar } from "../_shared/traccar-client.ts";
import { sarekon } from "../_shared/sarekon-client.ts";
import { resolveEmqxClient } from "../_shared/emqx-client.ts";

type Status = "ok" | "failed" | "not_configured";

interface Result {
  provider: string;
  label: string;
  status: Status;
  message: string;
  detail?: string;
  latency_ms: number;
  secrets: string[];
  checked_at: string;
}

const env = (k: string) => Deno.env.get(k)?.trim() || "";

async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const t = Date.now();
  const out = await fn();
  return [out, Date.now() - t];
}

function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 12_000) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
}

async function shortBody(res: Response): Promise<string> {
  try {
    const text = (await res.text()).slice(0, 300);
    try {
      const j = JSON.parse(text);
      return String(j.message ?? j.error?.message ?? j.error ?? j.detail ?? text);
    } catch {
      return text;
    }
  } catch {
    return `HTTP ${res.status}`;
  }
}

type Check = {
  provider: string;
  label: string;
  secrets: string[];
  run: () => Promise<{ status: Status; message: string; detail?: string }>;
};

const CHECKS: Check[] = [
  {
    provider: "twilio",
    label: "Twilio (SMS, WhatsApp, Voice)",
    secrets: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_API_KEY_SID", "TWILIO_API_SECRET"],
    run: async () => {
      const sid = env("TWILIO_ACCOUNT_SID");
      if (!sid) return { status: "not_configured", message: "TWILIO_ACCOUNT_SID is not set." };
      // Try the primary auth token first, then any API key/secret pair.
      const pairs: Array<[string, string, string]> = [];
      if (env("TWILIO_AUTH_TOKEN")) pairs.push([sid, env("TWILIO_AUTH_TOKEN"), "account auth token"]);
      const keySid = env("TWILIO_API_KEY_SID") || env("TWILIO_API_KEY");
      const keySecret = env("TWILIO_API_KEY_SECRET") || env("TWILIO_API_SECRET");
      if (keySid && keySecret) pairs.push([keySid, keySecret, "API key/secret"]);
      if (!pairs.length) return { status: "not_configured", message: "No Twilio auth token or API key pair is set." };

      let last = "";
      for (const [user, pass, how] of pairs) {
        const res = await fetchWithTimeout(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
          headers: { Authorization: `Basic ${btoa(`${user}:${pass}`)}` },
        });
        if (res.ok) {
          const body = await res.json().catch(() => ({}));
          return {
            status: "ok",
            message: `Authenticated with the ${how}.`,
            detail: `Account "${body.friendly_name ?? sid}" is ${body.status ?? "active"}.`,
          };
        }
        last = `${how}: ${await shortBody(res)}`;
      }
      return { status: "failed", message: "Twilio rejected the stored credentials.", detail: last };
    },
  },
  {
    provider: "resend",
    label: "Resend (email)",
    secrets: ["RESEND_API_KEY"],
    run: async () => {
      const key = env("RESEND_API_KEY");
      if (!key) return { status: "not_configured", message: "RESEND_API_KEY is not set." };
      const res = await fetchWithTimeout("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) return { status: "failed", message: "Resend rejected the API key.", detail: await shortBody(res) };
      const body = await res.json().catch(() => ({}));
      const count = Array.isArray(body?.data) ? body.data.length : 0;
      return { status: "ok", message: "API key accepted.", detail: `${count} sending domain(s) available.` };
    },
  },
  {
    provider: "termii",
    label: "Termii (Nigeria SMS)",
    secrets: ["TERMII_API_KEY"],
    run: async () => {
      const key = env("TERMII_API_KEY");
      if (!key) return { status: "not_configured", message: "TERMII_API_KEY is not set." };
      const res = await fetchWithTimeout(
        `https://api.ng.termii.com/api/sender-list?api_key=${encodeURIComponent(key)}`,
      );
      const text = await shortBody(res);
      if (!res.ok || /invalid|unauthor/i.test(text)) {
        return { status: "failed", message: "Termii rejected the API key.", detail: text };
      }
      return { status: "ok", message: "API key accepted.", detail: "Sender list retrieved." };
    },
  },
  {
    provider: "paystack",
    label: "Paystack (Nigeria payments)",
    secrets: ["PAYSTACK_SECRET_KEY"],
    run: async () => {
      const key = env("PAYSTACK_SECRET_KEY");
      if (!key) return { status: "not_configured", message: "PAYSTACK_SECRET_KEY is not set." };
      const res = await fetchWithTimeout("https://api.paystack.co/transaction?perPage=1", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) return { status: "failed", message: "Paystack rejected the secret key.", detail: await shortBody(res) };
      return {
        status: "ok",
        message: "Secret key accepted.",
        detail: key.startsWith("sk_live") ? "Live mode key." : "Test mode key.",
      };
    },
  },
  {
    provider: "paypal",
    label: "PayPal (USA payments)",
    secrets: ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"],
    run: async () => {
      await ensurePayPalConfig();
      const ppCfg = getPayPalConfig();
      if (!ppCfg) return { status: "not_configured", message: "PayPal client ID/secret are not set." };
      const id = ppCfg.clientId;
      const secret = ppCfg.clientSecret;
      // Same resolution the runtime PayPal functions use, so a green check
      // here always means the environment checkout actually talks to.
      const live = ppCfg.mode === "live";
      const base = ppCfg.base;
      const res = await fetchWithTimeout(`${base}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      });
      if (!res.ok) {
        return { status: "failed", message: "PayPal rejected the client credentials.", detail: await shortBody(res) };
      }
      return { status: "ok", message: "Access token issued.", detail: live ? "Live environment." : "Sandbox environment." };
    },
  },
  {
    provider: "persona",
    label: "Persona (identity verification)",
    secrets: ["PERSONA_API_KEY"],
    run: async () => {
      const key = env("PERSONA_API_KEY");
      if (!key) return { status: "not_configured", message: "PERSONA_API_KEY is not set." };
      const res = await fetchWithTimeout("https://api.withpersona.com/api/v1/inquiries?page%5Bsize%5D=1", {
        headers: { Authorization: `Bearer ${key}`, "Persona-Version": "2023-01-05" },
      });
      if (!res.ok) return { status: "failed", message: "Persona rejected the API key.", detail: await shortBody(res) };
      return { status: "ok", message: "API key accepted.", detail: "Inquiry list readable." };
    },
  },
  {
    provider: "elevenlabs",
    label: "ElevenLabs (voice)",
    secrets: ["ELEVENLABS_API_KEY"],
    run: async () => {
      const key = env("ELEVENLABS_API_KEY") || env("ELEVEN_LABS_API_KEY");
      if (!key) return { status: "not_configured", message: "ELEVENLABS_API_KEY is not set." };
      const res = await fetchWithTimeout("https://api.elevenlabs.io/v1/user", { headers: { "xi-api-key": key } });
      if (!res.ok) return { status: "failed", message: "ElevenLabs rejected the API key.", detail: await shortBody(res) };
      return { status: "ok", message: "API key accepted.", detail: "User profile readable." };
    },
  },
  {
    provider: "hologram",
    label: "Hologram (IoT SIMs)",
    secrets: ["HOLOGRAM_API_KEY", "HOLOGRAM_ORG_ID"],
    run: async () => {
      await hologram.ensureReady();
      if (!hologram.isConfigured()) return { status: "not_configured", message: "Hologram credentials are not set." };
      const r = await hologram.me() as { ok: boolean; status?: number; error?: string };
      if (!r.ok) {
        return { status: "failed", message: "Hologram rejected the API key.", detail: r.error ?? `HTTP ${r.status ?? "?"}` };
      }
      return {
        status: "ok",
        message: "API key accepted.",
        detail: `Source: ${hologram.configSource()}${hologram.orgId() ? ` · org ${hologram.orgId()}` : ""}.`,
      };
    },
  },
  {
    provider: "traccar",
    label: "Traccar (telemetry)",
    secrets: ["TRACCAR_BASE_URL", "TRACCAR_API_TOKEN", "TRACCAR_EMAIL", "TRACCAR_PASSWORD"],
    run: async () => {
      await traccar.ensureReady();
      if (!traccar.isConfigured()) return { status: "not_configured", message: "Traccar credentials are not set." };
      const r = await traccar.ping() as { ok: boolean; status?: number; error?: string };
      if (!r.ok) {
        return { status: "failed", message: "Traccar rejected the credentials.", detail: r.error ?? `HTTP ${r.status ?? "?"}` };
      }
      return { status: "ok", message: "Server reachable and authenticated.", detail: `${traccar.baseUrl()} (${traccar.configSource()}).` };
    },
  },
  {
    provider: "sarekon",
    label: "GPSANDTRACK (telemetry)",
    secrets: ["SAREKON_USER_ID", "SAREKON_PASSWORD", "SAREKON_BASE_URL"],
    run: async () => {
      await sarekon.ensureReady();
      if (!sarekon.isConfigured()) return { status: "not_configured", message: "GPSANDTRACK credentials are not set." };
      await sarekon.resetSession();
      const r = await sarekon.ping() as { ok: boolean; status?: number; error?: string };
      if (!r.ok) {
        return { status: "failed", message: "GPSANDTRACK rejected the credentials.", detail: r.error ?? `HTTP ${r.status ?? "?"}` };
      }
      return { status: "ok", message: "Session created.", detail: `${sarekon.baseUrl()} (${sarekon.configSource()}).` };
    },
  },
  {
    provider: "emqx",
    label: "EMQX (MQTT broker)",
    secrets: ["EMQX_API_KEY", "EMQX_API_SECRET", "EMQX_API_URL"],
    run: async () => {
      // Uses the vault-backed rotation credential when present, env secrets otherwise,
      // and probes /clients (allowed on every plan) rather than the cluster-only /nodes.
      const { client, config, unavailable } = await resolveEmqxClient();
      if (!client) {
        return { status: "not_configured", message: unavailable!.hint, detail: String(config.api_url) };
      }
      const probe = await client.ping();
      if (!probe.ok) {
        return {
          status: "failed",
          message: probe.status === 401 || probe.status === 403
            ? "EMQX rejected the management credentials."
            : "The EMQX management API could not be reached.",
          detail: `${client.apiUrl} → ${probe.detail}`,
        };
      }
      return {
        status: "ok",
        message: "Management API authenticated.",
        detail: `${client.apiUrl} (via /${probe.via}, credentials: ${config.credentials_source}).`,
      };
    },

  },
  {
    provider: "meta",
    label: "Meta (ads & conversions)",
    secrets: ["META_CAPI_ACCESS_TOKEN", "META_PIXEL_ID"],
    run: async () => {
      const token = env("META_CAPI_ACCESS_TOKEN");
      if (!token) return { status: "not_configured", message: "META_CAPI_ACCESS_TOKEN is not set." };
      const res = await fetchWithTimeout(
        `https://graph.facebook.com/v19.0/me?access_token=${encodeURIComponent(token)}`,
      );
      if (!res.ok) return { status: "failed", message: "Meta rejected the access token.", detail: await shortBody(res) };
      return { status: "ok", message: "Access token accepted.", detail: "Graph API reachable." };
    },
  },
];

async function runCheck(check: Check): Promise<Result> {
  const started = new Date().toISOString();
  try {
    const [outcome, ms] = await timed(check.run);
    return {
      provider: check.provider,
      label: check.label,
      status: outcome.status,
      message: outcome.message,
      detail: outcome.detail,
      latency_ms: ms,
      secrets: check.secrets,
      checked_at: started,
    };
  } catch (e) {
    const err = e as Error;
    return {
      provider: check.provider,
      label: check.label,
      status: "failed",
      message: /timeout|abort/i.test(err.message ?? "") ? "The provider did not respond in time." : "The check could not complete.",
      detail: err.message,
      latency_ms: 0,
      secrets: check.secrets,
      checked_at: started,
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  if (!(await isCallerAdmin(req))) return json({ error: "Admin access required" }, 403);

  let requested: string[] | null = null;
  try {
    const body = req.method === "POST" ? await req.json() : {};
    if (Array.isArray(body?.providers) && body.providers.length) {
      requested = body.providers.filter((p: unknown) => typeof p === "string").map((p: string) => p.toLowerCase());
    }
  } catch { /* no body – verify everything */ }

  const checks = requested ? CHECKS.filter((c) => requested!.includes(c.provider)) : CHECKS;
  if (!checks.length) return json({ error: "No known provider matched the request" }, 400);

  const results = await Promise.all(checks.map(runCheck));
  const summary = {
    ok: results.filter((r) => r.status === "ok").length,
    failed: results.filter((r) => r.status === "failed").length,
    not_configured: results.filter((r) => r.status === "not_configured").length,
  };

  return json({ results, summary, verified_at: new Date().toISOString() });
});
