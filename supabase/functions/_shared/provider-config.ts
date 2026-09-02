// Admin-rotatable provider configuration (limitation #9).
//
// Resolution order for every provider credential/setting:
//   1. Vault-backed credential version written from the admin panel
//      (public.provider_read_credentials), plus non-secret settings stored in
//      platform_kv_settings (`hologram_config` / `traccar_config`).
//   2. Environment secrets (HOLOGRAM_API_KEY, TRACCAR_BASE_URL, ...).
//   3. Nothing -> the client reports `not_configured` and the UI degrades
//      gracefully instead of throwing.
//
// Nothing here throws: a failed lookup silently falls back to the env layer so
// an unreachable database can never take the integrations offline.

export type ManagedProvider = "hologram" | "traccar" | "sarekon" | "opay" | "paypal";

type Bag = Record<string, string>;

interface Entry {
  values: Bag;
  source: "settings" | "env" | "none";
  loadedAt: number;
}

const TTL_MS = 60_000;
const cache = new Map<ManagedProvider, Entry>();
const inflight = new Map<ManagedProvider, Promise<Entry>>();

const KV_KEY: Record<ManagedProvider, string> = {
  hologram: "hologram_config",
  traccar: "traccar_config",
  sarekon: "sarekon_config",
  opay: "opay_config",
  paypal: "paypal_config",
};

/** Non-secret keys that may live in platform_kv_settings. */
const PUBLIC_KEYS: Record<ManagedProvider, string[]> = {
  hologram: ["org_id", "base_url"],
  traccar: ["base_url", "email"],
  sarekon: ["base_url", "username", "user_id"],
  // Opay/PayPal: the non-secret half of the config, including the sandbox vs
  // live switch the admin settings page writes.
  opay: ["merchant_id", "public_key", "environment"],
  paypal: ["client_id", "mode", "webhook_id"],
};

function restHeaders() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return null;
  return { url, headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" } };
}

async function fetchSettings(provider: ManagedProvider): Promise<Bag> {
  const ctx = restHeaders();
  if (!ctx) return {};
  try {
    const res = await fetch(
      `${ctx.url}/rest/v1/platform_kv_settings?key=eq.${KV_KEY[provider]}&select=value`,
      { headers: ctx.headers },
    );
    if (!res.ok) return {};
    const rows = await res.json();
    const v = Array.isArray(rows) ? rows[0]?.value : null;
    if (!v || typeof v !== "object") return {};
    const out: Bag = {};
    for (const k of PUBLIC_KEYS[provider]) {
      if (typeof v[k] === "string" && v[k].trim()) out[k] = String(v[k]).trim();
    }
    return out;
  } catch {
    return {};
  }
}

async function fetchVault(provider: ManagedProvider): Promise<Bag> {
  const ctx = restHeaders();
  if (!ctx) return {};
  try {
    const res = await fetch(`${ctx.url}/rest/v1/rpc/provider_read_credentials`, {
      method: "POST",
      headers: ctx.headers,
      body: JSON.stringify({ _provider: provider }),
    });
    if (!res.ok) return {};
    const body = await res.json();
    if (!body || typeof body !== "object") return {};
    const out: Bag = {};
    for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) out[k] = v.trim();
    }
    return out;
  } catch {
    return {};
  }
}

async function load(provider: ManagedProvider): Promise<Entry> {
  const [settings, vault] = await Promise.all([fetchSettings(provider), fetchVault(provider)]);
  const values = { ...settings, ...vault };
  const entry: Entry = {
    values,
    source: Object.keys(values).length ? "settings" : "none",
    loadedAt: Date.now(),
  };
  cache.set(provider, entry);
  return entry;
}

/** Warm the override cache. Call once per request before using the sync getters. */
export async function ensureProviderConfig(provider: ManagedProvider): Promise<void> {
  const cached = cache.get(provider);
  if (cached && Date.now() - cached.loadedAt < TTL_MS) return;
  let p = inflight.get(provider);
  if (!p) {
    p = load(provider).finally(() => inflight.delete(provider));
    inflight.set(provider, p);
  }
  await p;
}

/** Drop the cache so a freshly rotated credential is picked up immediately. */
export function invalidateProviderConfig(provider?: ManagedProvider) {
  if (provider) cache.delete(provider);
  else cache.clear();
}

/** Admin override for a single key, or null when only env secrets exist. */
export function providerOverride(provider: ManagedProvider, key: string): string | null {
  return cache.get(provider)?.values[key] ?? null;
}

/** Where the currently-resolved config came from (for the admin status panel). */
export function providerConfigSource(provider: ManagedProvider): "settings" | "env" | "none" {
  const entry = cache.get(provider);
  if (entry && Object.keys(entry.values).length) return "settings";
  return "env";
}
