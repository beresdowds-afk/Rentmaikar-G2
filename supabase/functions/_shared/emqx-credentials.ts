// Resolves EMQX API credentials.
// Priority: active vault-backed rotation version -> environment secrets.
// Keeps every existing EMQX_* env deployment working unchanged.

export interface EmqxCredentials {
  url: string;
  key: string;
  secret: string;
  source: "vault" | "env";
  versionId: string | null;
}

const DEFAULT_URL = "https://broker.rentmaikar.com:18083/api/v5";

export async function readCredentialVersion(
  versionId: string | null = null,
): Promise<{ id: string; api_key: string; api_secret: string; status: string } | null> {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return null;
  try {
    const res = await fetch(`${url}/rest/v1/rpc/emqx_read_credentials`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ _version_id: versionId }),
    });
    if (!res.ok) return null;
    const rows = await res.json();
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row?.api_key || !row?.api_secret) return null;
    return row;
  } catch {
    return null;
  }
}

export async function getEmqxCredentials(): Promise<EmqxCredentials | null> {
  const { getEmqxManagementConfig } = await import("./emqx-config.ts");
  const cfg = await getEmqxManagementConfig();
  const url = cfg.apiUrl || Deno.env.get("EMQX_API_URL") || DEFAULT_URL;
  const active = await readCredentialVersion(null);
  if (active) {
    return { url, key: active.api_key, secret: active.api_secret, source: "vault", versionId: active.id };
  }
  const key = Deno.env.get("EMQX_API_KEY");
  const secret = Deno.env.get("EMQX_API_SECRET");
  if (!key || !secret) return null;
  return { url, key, secret, source: "env", versionId: null };
}

/**
 * Live probe against the EMQX management API.
 * Serverless plans forbid /stats (403), so fall back to /clients?limit=1, which
 * the spec exposes on every deployment type. 401/403 on /clients is authoritative.
 */
export async function probeEmqx(
  url: string,
  key: string,
  secret: string,
): Promise<{ ok: boolean; status: number | null; detail: string; stats?: unknown }> {
  const base = url.replace(/\/$/, "");
  const auth = "Basic " + btoa(`${key}:${secret}`);
  const call = async (path: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      return await fetch(`${base}${path}`, {
        headers: { Authorization: auth, Accept: "application/json" },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    const stats = await call("/stats");
    if (stats.ok) {
      return { ok: true, status: stats.status, detail: "EMQX management API reachable", stats: await stats.json() };
    }
    if (stats.status === 401) {
      return { ok: false, status: 401, detail: (await stats.text()).slice(0, 300) || "Unauthorized" };
    }
    // 403/404 => plan-restricted cluster endpoint, not a bad credential.
    const clients = await call("/clients?limit=1");
    if (clients.ok) {
      return {
        ok: true,
        status: clients.status,
        detail: "EMQX management API reachable (cluster metrics restricted on this plan)",
        stats: await clients.json(),
      };
    }
    return { ok: false, status: clients.status, detail: (await clients.text()).slice(0, 300) };
  } catch (e) {
    return { ok: false, status: null, detail: String(e).slice(0, 300) };
  }
}

