// Hardened EMQX v5 HTTP Management API client.
// Spec: https://docs.emqx.com/en/emqx/latest/admin/api.html
//
// What this adds over ad-hoc fetch calls:
//  - Basic auth with API key/secret (EMQX v5 requirement) + optional Bearer.
//  - Correct handling of 204/202/empty bodies (DELETE + /publish never return JSON reliably).
//  - Structured EMQX error surface ({ code, message }) instead of raw text.
//  - Jittered retries with backoff honouring Retry-After for 408/429/5xx.
//  - Request timeouts via AbortController (edge functions must never hang).
//  - Spec-correct pagination (page/limit, meta.hasnext) with a paged "list all" helper.
//  - EMQX 5.4+ /actions + /sources + /connectors with legacy /bridges fallback.

import { classifyManagementFailure, getEmqxManagementConfig } from "./emqx-config.ts";
import { getEmqxCredentials } from "./emqx-credentials.ts";

export const EMQX_MAX_LIMIT = 10000;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRIES = 2;
const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

export class EmqxApiError extends Error {
  constructor(
    public httpStatus: number | null,
    public detail: string,
    public code: string | null = null,
  ) {
    super(detail);
    this.name = "EmqxApiError";
  }

  get classified() {
    return classifyManagementFailure(this.httpStatus, this.detail);
  }
}

export interface EmqxRequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, unknown> | undefined;
  timeoutMs?: number;
  retries?: number;
  /** Treat these statuses as a normal (non-throwing) result. */
  tolerate?: number[];
}

export interface EmqxPage<T> {
  data: T[];
  meta: { page?: number; limit?: number; count?: number; hasnext?: boolean };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function buildQuery(query?: Record<string, unknown>): string {
  if (!query) return "";
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) {
      // EMQX expects comma-joined values for list filters.
      const joined = v.filter((x) => x !== undefined && x !== null && x !== "").join(",");
      if (joined) qs.set(k, joined);
      continue;
    }
    qs.set(k, typeof v === "boolean" ? String(v) : String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

function parseEmqxError(status: number, text: string): EmqxApiError {
  let code: string | null = null;
  let message = text;
  try {
    const body = JSON.parse(text);
    if (body && typeof body === "object") {
      code = typeof body.code === "string" ? body.code : null;
      message = typeof body.message === "string" ? body.message : text;
    }
  } catch {
    // non-JSON error body — keep raw text
  }
  return new EmqxApiError(status, message.slice(0, 500), code);
}

export class EmqxClient {
  constructor(
    private readonly baseUrl: string,
    private readonly authHeader: string,
    public readonly meta: {
      credentialSource: string | null;
      configSource: string;
      deploymentType: string;
    },
  ) {}

  get apiUrl() {
    return this.baseUrl;
  }

  /** Root origin (no /api/v5) — used for the unauthenticated health probe. */
  private origin(): string {
    try {
      return new URL(this.baseUrl).origin;
    } catch {
      return this.baseUrl;
    }
  }

  async request<T = unknown>(path: string, opts: EmqxRequestOptions = {}): Promise<T> {
    const {
      method = "GET",
      body,
      query,
      timeoutMs = DEFAULT_TIMEOUT_MS,
      retries = DEFAULT_RETRIES,
      tolerate = [],
    } = opts;

    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}${buildQuery(query)}`;
    let lastError: EmqxApiError = new EmqxApiError(null, "request never executed");

    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          method,
          headers: {
            Authorization: this.authHeader,
            Accept: "application/json",
            ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        if (!res.ok && !tolerate.includes(res.status)) {
          const text = await res.text().catch(() => "");
          const err = parseEmqxError(res.status, text);
          if (RETRYABLE.has(res.status) && attempt < retries) {
            const retryAfter = Number(res.headers.get("retry-after"));
            const wait = Number.isFinite(retryAfter) && retryAfter > 0
              ? Math.min(retryAfter * 1000, 8000)
              : 250 * 2 ** attempt + Math.random() * 250;
            await sleep(wait);
            lastError = err;
            continue;
          }
          throw err;
        }

        // 204 No Content (DELETE/kickout) and empty 200/202 bodies are valid.
        if (res.status === 204) return { success: true, status: 204 } as T;
        const text = await res.text();
        if (!text) return { success: res.ok, status: res.status } as T;
        try {
          return JSON.parse(text) as T;
        } catch {
          return text as unknown as T;
        }
      } catch (e) {
        if (e instanceof EmqxApiError) throw e;
        const detail = e instanceof Error && e.name === "AbortError"
          ? `Request timed out after ${timeoutMs}ms`
          : String(e);
        lastError = new EmqxApiError(null, detail);
        if (attempt < retries) {
          await sleep(250 * 2 ** attempt + Math.random() * 250);
          continue;
        }
        throw lastError;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError;
  }

  // ---------------------------------------------------------------- health
  /** Unauthenticated broker liveness probe (`GET /status`, plain text). */
  async health(): Promise<{ ok: boolean; status: number | null; detail: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(`${this.origin()}/status`, { signal: controller.signal });
      const text = (await res.text()).slice(0, 200);
      return { ok: res.ok && /running/i.test(text), status: res.status, detail: text };
    } catch (e) {
      return { ok: false, status: null, detail: String(e).slice(0, 200) };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Authenticated reachability probe that works on every plan.
   * Serverless forbids /stats and /nodes, but /clients is always permitted.
   */
  async ping(): Promise<{ ok: boolean; via: string; status: number | null; detail: string }> {
    for (const [via, path] of [["clients", "/clients"], ["nodes", "/nodes"], ["stats", "/stats"]]) {
      try {
        await this.request(path, { query: path === "/clients" ? { limit: 1 } : undefined, retries: 1 });
        return { ok: true, via, status: 200, detail: "EMQX management API reachable" };
      } catch (e) {
        const err = e as EmqxApiError;
        // 401/403 on the first probe is authoritative — stop immediately.
        if (err.httpStatus === 401 || err.httpStatus === 403) {
          return { ok: false, via, status: err.httpStatus, detail: err.detail };
        }
      }
    }
    return { ok: false, via: "none", status: null, detail: "No management endpoint responded" };
  }

  // ------------------------------------------------------------ pagination
  async page<T = Record<string, unknown>>(
    path: string,
    query: Record<string, unknown> = {},
  ): Promise<EmqxPage<T>> {
    const limit = Math.min(Number(query.limit) || 100, EMQX_MAX_LIMIT);
    const res = await this.request<EmqxPage<T>>(path, { query: { ...query, limit } });
    return {
      data: Array.isArray(res?.data) ? res.data : Array.isArray(res) ? (res as unknown as T[]) : [],
      meta: (res as EmqxPage<T>)?.meta ?? {},
    };
  }

  /** Walk EMQX pagination (meta.hasnext) up to `maxPages`. */
  async listAll<T = Record<string, unknown>>(
    path: string,
    query: Record<string, unknown> = {},
    maxPages = 20,
  ): Promise<{ data: T[]; pages: number; truncated: boolean }> {
    const limit = Math.min(Number(query.limit) || 500, EMQX_MAX_LIMIT);
    const out: T[] = [];
    let page = 1;
    for (; page <= maxPages; page++) {
      const res = await this.page<T>(path, { ...query, page, limit });
      out.push(...res.data);
      if (!res.meta?.hasnext || res.data.length === 0) {
        return { data: out, pages: page, truncated: false };
      }
    }
    return { data: out, pages: maxPages, truncated: true };
  }

  /** Count rows without fetching them (uses meta.count with limit=1). */
  async count(path: string, query: Record<string, unknown> = {}): Promise<number> {
    try {
      const res = await this.page(path, { ...query, limit: 1 });
      return Number(res.meta?.count ?? res.data.length) || 0;
    } catch {
      return 0;
    }
  }

  // -------------------------------------------------------------- clients
  /** Spec-complete /clients filter surface. */
  clients(params: Record<string, unknown> = {}) {
    const allowed = [
      "page",
      "limit",
      "node",
      "clientid",
      "username",
      "ip_address",
      "conn_state",
      "clean_start",
      "proto_name",
      "proto_ver",
      "like_clientid",
      "like_username",
      "gte_created_at",
      "lte_created_at",
      "gte_connected_at",
      "lte_connected_at",
    ];
    const query: Record<string, unknown> = {};
    for (const k of allowed) if (params[k] !== undefined) query[k] = params[k];
    if (params.connected !== undefined && query.conn_state === undefined) {
      query.conn_state = params.connected ? "connected" : "disconnected";
    }
    return this.page(`/clients`, query);
  }

  client(clientId: string) {
    return this.request(`/clients/${encodeURIComponent(clientId)}`);
  }

  clientSubscriptions(clientId: string) {
    return this.request(`/clients/${encodeURIComponent(clientId)}/subscriptions`);
  }

  /** DELETE /clients/{clientid} → 204. */
  kickout(clientId: string) {
    return this.request(`/clients/${encodeURIComponent(clientId)}`, { method: "DELETE", retries: 0 });
  }

  /** POST /clients/kickout/bulk → 204. */
  kickoutBulk(clientIds: string[]) {
    return this.request(`/clients/kickout/bulk`, { method: "POST", body: clientIds, retries: 0 });
  }

  // ---------------------------------------------------------------- publish
  /** POST /publish → 202 Accepted (or 200 with a message id). */
  publish(msg: { topic: string; payload: unknown; qos?: number; retain?: boolean }) {
    return this.request(`/publish`, {
      method: "POST",
      retries: 0,
      tolerate: [202],
      body: {
        topic: msg.topic,
        payload: typeof msg.payload === "string" ? msg.payload : JSON.stringify(msg.payload),
        qos: msg.qos ?? 1,
        retain: msg.retain ?? false,
        payload_encoding: "plain",
      },
    });
  }

  publishBulk(messages: Array<{ topic: string; payload: unknown; qos?: number; retain?: boolean }>) {
    return this.request(`/publish/bulk`, {
      method: "POST",
      retries: 0,
      tolerate: [202],
      body: messages.map((m) => ({
        topic: m.topic,
        payload: typeof m.payload === "string" ? m.payload : JSON.stringify(m.payload),
        qos: m.qos ?? 1,
        retain: m.retain ?? false,
        payload_encoding: "plain",
      })),
    });
  }

  /** GET /mqtt/retainer/message/{topic} — 404 means "no retained message". */
  async retained(topic: string): Promise<Record<string, unknown> | null> {
    try {
      return await this.request(`/mqtt/retainer/message/${encodeURIComponent(topic)}`, { retries: 1 });
    } catch (e) {
      if (e instanceof EmqxApiError && e.httpStatus === 404) return null;
      throw e;
    }
  }

  // ------------------------------------------------------- integrations
  /**
   * EMQX 5.4+ replaced /bridges with /actions (egress), /sources (ingress)
   * and /connectors. Fall back to /bridges for older brokers.
   */
  async integrations() {
    const safe = async (path: string) => {
      try {
        return { ok: true, data: await this.request(path, { retries: 1 }) };
      } catch (e) {
        const err = e as EmqxApiError;
        return { ok: false, status: err.httpStatus, error: err.detail, code: err.code };
      }
    };
    const [actions, sources, connectors] = await Promise.all([
      safe("/actions"),
      safe("/sources"),
      safe("/connectors"),
    ]);
    if (actions.ok || sources.ok || connectors.ok) {
      return { api: "v5.4+", actions, sources, connectors };
    }
    return { api: "legacy", bridges: await safe("/bridges") };
  }
}

export interface EmqxClientResolution {
  client: EmqxClient | null;
  unavailable?: { reason: string; hint: string };
  config: Record<string, unknown>;
}

/** Resolve an authenticated client from admin settings + vault/env credentials. */
export async function resolveEmqxClient(): Promise<EmqxClientResolution> {
  const cfg = await getEmqxManagementConfig();
  const creds = await getEmqxCredentials();

  const config = {
    api_url: cfg.apiUrl,
    management_host: cfg.managementHost,
    management_port: cfg.managementPort,
    api_base_path: cfg.apiBasePath,
    mqtt_host: cfg.mqttHost,
    mqtt_port: cfg.mqttPort,
    management_enabled: cfg.managementEnabled,
    deployment_type: cfg.deploymentType,
    config_source: cfg.source,
    credentials_source: creds?.source ?? null,
    has_credentials: !!creds,
  };

  if (!cfg.managementEnabled) {
    return {
      client: null,
      config,
      unavailable: {
        reason: "management_api_disabled",
        hint:
          "Management API polling is switched off in EMQX endpoint settings. Live broker metrics are unavailable; device telemetry is unaffected.",
      },
    };
  }
  if (!creds) {
    return {
      client: null,
      config,
      unavailable: {
        reason: "management_api_no_credentials",
        hint:
          "No active EMQX management API key is configured. Add and activate one in the EMQX credential rotation panel.",
      },
    };
  }

  const client = new EmqxClient(
    cfg.apiUrl.replace(/\/$/, ""),
    `Basic ${btoa(`${creds.key}:${creds.secret}`)}`,
    { credentialSource: creds.source, configSource: cfg.source, deploymentType: cfg.deploymentType },
  );
  return { client, config };
}
