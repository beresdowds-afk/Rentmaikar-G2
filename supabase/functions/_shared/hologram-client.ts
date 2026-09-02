// Hologram REST API v1 client — https://docs.hologram.io/api/v1
// Base URL: https://dashboard.hologram.io/api/1
// Auth: HTTP Basic, username `apikey`, password = API key.
// Envelope: { success, data? , error? } plus { limit, size, continues, links } on
// limited GETs. Rate limit -> HTTP 429 (back off 5-10s, then retry).
//
// Spec notes honoured here:
//  * A Hologram "device" IS a SIM — the canonical endpoints are /devices/*,
//    not the legacy /links/cellular/* paths.
//  * State changes: POST /devices/{id}/state { state: live|pause|deactivate }
//  * Plan changes:  POST /devices/{id}/changeplan { planid, zone, orgid }
//  * Usage limits:  POST /devices/{id}/usagelimit { overagelimit, datathreshold }
//  * Usage data:    GET /usage/data/monthly?linkid=…  (link id lives on the device)
//  * Cloud data:    GET /csr/data?deviceid=…
//  * Locations:     GET /devices/locations?ids=…
//  * Pagination is cursor based: `startafter` + `continues`.

import { ensureProviderConfig, providerConfigSource, providerOverride } from "./provider-config.ts";

const BASE = "https://dashboard.hologram.io/api/1";
const TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 3;

function creds() {
  const apiKey = providerOverride("hologram", "api_key") ?? Deno.env.get("HOLOGRAM_API_KEY");
  const orgId = providerOverride("hologram", "org_id") ?? Deno.env.get("HOLOGRAM_ORG_ID");
  if (!apiKey || !orgId) return null;
  return { apiKey, orgId };
}

export type HologramFailureReason =
  | "not_configured"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "timeout"
  | "network_error"
  | "provider_error";

export type HologramMeta = {
  limit?: number;
  size?: number;
  continues?: boolean;
  next?: string | null;
  lastid?: string | null;
};

export type HologramResult<T = unknown> =
  | { ok: true; body: Record<string, unknown>; data: T; meta: HologramMeta }
  | { ok: false; reason: "not_configured" }
  | {
    ok: false;
    reason: Exclude<HologramFailureReason, "not_configured">;
    status: number;
    error: string;
    body: unknown;
  };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (base: number) => base + Math.floor(Math.random() * 1500);

function reasonFor(status: number): Exclude<HologramFailureReason, "not_configured"> {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  return "provider_error";
}

function errorText(status: number, body: unknown): string {
  const e = (body as { error?: unknown })?.error;
  if (typeof e === "string" && e.trim()) return e;
  if (Array.isArray(e) && e.length) return e.map(String).join("; ");
  return `Hologram HTTP ${status}`;
}

function metaFrom(body: Record<string, unknown>): HologramMeta {
  const links = body.links as { next?: string } | undefined;
  return {
    limit: typeof body.limit === "number" ? body.limit : undefined,
    size: typeof body.size === "number" ? body.size : undefined,
    continues: typeof body.continues === "boolean" ? body.continues : undefined,
    next: links?.next ?? null,
    lastid: (body.lastid as string | undefined) ?? null,
  };
}

type QueryValue = string | number | boolean | undefined | null;

/** Spec-compliant query builder: skips empty values, coerces booleans. */
function qs(path: string, params: Record<string, QueryValue> = {}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, typeof v === "boolean" ? String(v) : String(v));
  }
  const s = sp.toString();
  return s ? `${path}?${s}` : path;
}

async function call<T = unknown>(
  path: string,
  init: RequestInit = {},
  attempt = 0,
): Promise<HologramResult<T>> {
  const c = creds();
  if (!c) return { ok: false, reason: "not_configured" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: "Basic " + btoa(`apikey:${c.apiKey}`),
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers || {}),
      },
    });
  } catch (e) {
    clearTimeout(timer);
    const aborted = (e as Error).name === "AbortError";
    if (attempt < MAX_ATTEMPTS - 1) {
      await sleep(jitter(1000 * (attempt + 1)));
      return call<T>(path, init, attempt + 1);
    }
    return {
      ok: false,
      reason: aborted ? "timeout" : "network_error",
      status: 0,
      error: aborted ? `Hologram request timed out after ${TIMEOUT_MS}ms` : (e as Error).message,
      body: null,
    };
  }
  clearTimeout(timer);

  const raw = await response.text();
  let body: unknown = {};
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = { error: raw.slice(0, 500) };
    }
  }

  // Docs: on 429 wait 5-10s before retrying. 5xx/408 are transient too.
  const transient = response.status === 429 || response.status === 408 || response.status >= 500;
  if (transient && attempt < MAX_ATTEMPTS - 1) {
    await sleep(response.status === 429 ? jitter(5000) : jitter(800 * (attempt + 1)));
    return call<T>(path, init, attempt + 1);
  }

  const envelope = body as Record<string, unknown>;
  if (!response.ok || envelope?.success === false) {
    const error = errorText(response.status, body);
    console.error("Hologram API error", path, response.status, error);
    return { ok: false, reason: reasonFor(response.status), status: response.status, error, body };
  }

  return {
    ok: true,
    body: envelope ?? {},
    data: (envelope?.data as T) ?? (null as unknown as T),
    meta: metaFrom(envelope ?? {}),
  };
}

function orgParam(): number | undefined {
  const raw = creds()?.orgId;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

/** Follow `continues`/`startafter` until exhausted or `max` rows collected. */
async function paged<T extends Record<string, unknown>>(
  build: (startafter?: number) => string,
  max: number,
): Promise<HologramResult<T[]>> {
  const collected: T[] = [];
  let startafter: number | undefined;
  let last: HologramResult<T[]> | null = null;

  for (let page = 0; page < 20 && collected.length < max; page++) {
    const r = await call<T[]>(build(startafter));
    if (!r.ok) return collected.length ? { ...last!, data: collected } : r;
    last = r;
    const rows = Array.isArray(r.data) ? r.data : [];
    collected.push(...rows);
    if (!r.meta.continues || rows.length === 0) break;
    const tail = rows[rows.length - 1] as { id?: unknown };
    const id = Number(tail?.id);
    if (!Number.isFinite(id)) break;
    startafter = id;
  }

  return last
    ? { ...last, data: collected.slice(0, max) }
    : { ok: true, body: {}, data: collected, meta: {} };
}

export type HologramDevice = Record<string, unknown> & {
  id?: number;
  name?: string;
  iccid?: string;
  imsi?: string;
  phonenumber?: string;
  state?: string;
  links?: { cellular?: Array<Record<string, unknown>> };
};

/** Hologram devices carry their cellular link under links.cellular[0]. */
export function cellularLink(device: HologramDevice): Record<string, unknown> | null {
  const arr = device?.links?.cellular;
  return Array.isArray(arr) && arr.length ? arr[0] : null;
}

export function deviceLinkId(device: HologramDevice): number | null {
  const link = cellularLink(device);
  const id = Number(link?.id ?? (device as { linkid?: unknown }).linkid);
  return Number.isFinite(id) ? id : null;
}

export function deviceIccid(device: HologramDevice): string | null {
  const link = cellularLink(device);
  return (device.iccid as string) ?? (link?.sim as string) ?? (link?.iccid as string) ?? null;
}

export const hologram = {
  /** Warm admin-managed credentials before any sync getter is used. */
  async ensureReady() {
    await ensureProviderConfig("hologram");
  },

  configSource() {
    return providerConfigSource("hologram");
  },

  isConfigured() {
    return !!creds();
  },

  orgId() {
    return creds()?.orgId ?? null;
  },

  /* ---------------- Account & organizations ---------------- */

  me() {
    return call<Record<string, unknown>>("/users/me/");
  },

  listOrganizations() {
    return call<Array<Record<string, unknown>>>("/organizations");
  },

  getOrganization(orgId = creds()?.orgId) {
    return call<Record<string, unknown>>(`/organizations/${orgId}`);
  },

  /* ---------------- Devices (== SIMs) ---------------- */

  /** Single page of org devices. `withlocation` adds last known tower location. */
  listSims(limit = 50, opts: { states?: string; withlocation?: boolean; slim?: boolean } = {}) {
    return call<HologramDevice[]>(qs("/devices", {
      orgid: orgParam(),
      limit: Math.min(limit, 5000),
      states: opts.states,
      withlocation: opts.withlocation,
      slim: opts.slim,
    }));
  },

  /** Cursor-paged fleet listing (follows `continues`). */
  listAllSims(max = 1000, opts: { states?: string; withlocation?: boolean } = {}) {
    return paged<HologramDevice>(
      (startafter) =>
        qs("/devices", {
          orgid: orgParam(),
          limit: 500,
          startafter,
          states: opts.states,
          withlocation: opts.withlocation,
        }),
      max,
    );
  },

  /** Lookup by ICCID (accepts full ICCID or SIM number). */
  findByIccid(iccid: string) {
    return call<HologramDevice[]>(qs("/devices", { orgid: orgParam(), iccid, limit: 5 }));
  },

  getSim(deviceId: string | number) {
    return call<HologramDevice>(`/devices/${deviceId}`);
  },

  /** state = live | pause | deactivate */
  setSimState(deviceId: string | number, state: "live" | "pause" | "deactivate") {
    return call<Record<string, unknown>>(`/devices/${deviceId}/state`, {
      method: "POST",
      body: JSON.stringify({ state }),
    });
  },

  setSimStateBulk(deviceIds: number[], state: "live" | "pause" | "deactivate") {
    return call<Record<string, unknown>>("/devices/state", {
      method: "POST",
      body: JSON.stringify({ deviceids: deviceIds, state }),
    });
  },

  /** Activating on a plan = changeplan (planid/zone/orgid) then ensure `live`. */
  async activateSim(deviceId: string | number, planId: number, zone = "global") {
    const plan = await hologram.changePlan(deviceId, planId, zone);
    if (!plan.ok) return plan;
    return hologram.setSimState(deviceId, "live");
  },

  suspendSim(deviceId: string | number) {
    return hologram.setSimState(deviceId, "pause");
  },

  resumeSim(deviceId: string | number) {
    return hologram.setSimState(deviceId, "live");
  },

  deactivateSim(deviceId: string | number) {
    return hologram.setSimState(deviceId, "deactivate");
  },

  changePlan(deviceId: string | number, planId: number, zone = "global", preview = false) {
    return call<Record<string, unknown>>(qs(`/devices/${deviceId}/changeplan`, { preview }), {
      method: "POST",
      body: JSON.stringify({ planid: planId, zone, orgid: orgParam() }),
    });
  },

  /**
   * Monthly usage ceiling in bytes. Spec: `overagelimit` hard-caps (pauses the
   * device), `datathreshold` only alerts. -1/0 means unlimited.
   */
  setDataLimit(deviceId: string | number, limitBytes: number, alertBytes?: number) {
    return call<Record<string, unknown>>(`/devices/${deviceId}/usagelimit`, {
      method: "POST",
      body: JSON.stringify({
        overagelimit: limitBytes,
        ...(alertBytes !== undefined ? { datathreshold: alertBytes } : {}),
      }),
    });
  },

  /** Current-month data usage for a device, resolved through its cellular link. */
  async getSimUsage(deviceId: string | number, linkId?: number) {
    let link = linkId ?? null;
    if (!link) {
      const dev = await hologram.getSim(deviceId);
      if (!dev.ok) return dev;
      link = deviceLinkId(dev.data as HologramDevice);
    }
    if (!link) {
      return {
        ok: false as const,
        reason: "not_found" as const,
        status: 404,
        error: "Device has no cellular link to report usage for",
        body: null,
      };
    }
    return call<Array<Record<string, unknown>>>(
      qs("/usage/data/monthly", { linkid: link, limit: 1 }),
    );
  },

  /** Org-wide totals for a window (unix seconds). */
  getUsageTotal(timestart?: number, timeend?: number) {
    return call<Array<Record<string, unknown>>>(qs("/usage/data/total", { timestart, timeend }));
  },

  listOpenSessions() {
    return call<Array<Record<string, unknown>>>(qs("/devices/opensessions", { orgid: orgParam() }));
  },

  /* ---------------- Location ---------------- */

  /** Spec has no per-device location route; use /devices/locations?ids=… */
  async getDeviceLocation(deviceId: string | number) {
    const r = await call<Array<Record<string, unknown>>>(
      qs("/devices/locations", { orgid: orgParam(), ids: String(deviceId), limit: 1 }),
    );
    if (!r.ok) return r;
    const first = Array.isArray(r.data) ? r.data[0] ?? null : r.data;
    return { ...r, data: first as unknown as Array<Record<string, unknown>> };
  },

  listDeviceLocations(ids?: Array<string | number>, limit = 500) {
    return call<Array<Record<string, unknown>>>(qs("/devices/locations", {
      orgid: orgParam(),
      ids: ids?.length ? ids.join(",") : undefined,
      limit,
    }));
  },

  /** Ask Hologram to refresh cached tower locations for the given SIMs. */
  refreshLocations(deviceIds: number[]) {
    return call<Record<string, unknown>>("/links/cellular/updatelocation", {
      method: "POST",
      body: JSON.stringify({ deviceids: deviceIds }),
    });
  },

  /* ---------------- Device metadata ---------------- */

  listDevices(limit = 100) {
    return hologram.listSims(limit);
  },

  getDevice(deviceId: string | number) {
    return hologram.getSim(deviceId);
  },

  setDeviceName(deviceId: string | number, name: string) {
    return call<Record<string, unknown>>(`/devices/${deviceId}`, {
      method: "PUT",
      body: JSON.stringify({ name }),
    });
  },

  /** Cloud data (CSR) records for a device. */
  getDeviceData(deviceId: string | number, limit = 25) {
    return call<Array<Record<string, unknown>>>(
      qs("/csr/data", { deviceid: Number(deviceId), limit }),
    );
  },

  /* ---------------- Tags ---------------- */

  listTags() {
    return call<Array<Record<string, unknown>>>(qs("/devices/tags", { orgid: orgParam() }));
  },

  createTag(name: string, deviceIds: number[] = []) {
    return call<Record<string, unknown>>("/devices/tags", {
      method: "POST",
      body: JSON.stringify({ name, ...(deviceIds.length ? { deviceids: deviceIds } : {}) }),
    });
  },

  linkTag(tagId: number, deviceIds: number[]) {
    return call<Record<string, unknown>>(`/devices/tags/${tagId}/link`, {
      method: "POST",
      body: JSON.stringify({ deviceids: deviceIds }),
    });
  },

  /* ---------------- Messaging ---------------- */

  /** Cloud-to-device SMS. Spec path keeps the trailing slash. */
  sendSms(deviceId: number, body: string) {
    return call<Record<string, unknown>>("/sms/incoming/", {
      method: "POST",
      body: JSON.stringify({ deviceid: deviceId, body }),
    });
  },

  /* ---------------- Billing / plans ---------------- */

  listPlans(limit = 100) {
    return call<Array<Record<string, unknown>>>(
      qs("/plans", { orgid: orgParam(), limit: Math.min(limit, 1000) }),
    );
  },

  getPlan(planId: number) {
    return call<Record<string, unknown>>(`/plans/${planId}`);
  },

  getBalance() {
    return call<Record<string, unknown>>(`/organizations/${creds()?.orgId}/balance/`);
  },

  listStatements(limit = 12) {
    return call<Array<Record<string, unknown>>>(
      qs(`/organizations/${creds()?.orgId}/statements`, { limit }),
    );
  },
};

/**
 * Flatten a Hologram device into the fields the platform stores. Device-level
 * identity (ICCID/IMSI/state/plan) lives on links.cellular[0], not the device.
 */
export function normalizeDevice(device: HologramDevice) {
  const link = cellularLink(device) ?? {};
  return {
    device_id: device.id !== undefined ? String(device.id) : null,
    name: (device.name as string | undefined) ?? null,
    iccid: (link.sim as string | undefined) ?? (device.iccid as string | undefined) ?? null,
    imsi: link.imsi !== undefined && link.imsi !== null ? String(link.imsi) : null,
    msisdn: (link.msisdn as string | undefined) ?? (device.phonenumber as string | undefined) ?? null,
    state: (link.state as string | undefined) ?? (device.state as string | undefined) ?? null,
    link_id: deviceLinkId(device),
    zone: (link.zone as number | undefined) ?? null,
    overage_limit: (link.overagelimit as number | undefined) ?? null,
    imei: (device.imei as string | undefined) ?? null,
    plan_id: (device as { intended_plan_id?: number | null }).intended_plan_id ?? null,
  };
}

/** Bytes -> MB helper used when persisting usage. */
export function bytesToMb(bytes: number | null | undefined): number | null {
  if (bytes === null || bytes === undefined || !Number.isFinite(Number(bytes))) return null;
  return Math.round((Number(bytes) / 1_000_000) * 100) / 100;
}

/** Extract current-month usage bytes from a /usage/data/monthly response. */
export function monthlyUsageBytes(rows: unknown): number | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const rec = rows[0] as { bytes?: number };
  return Number.isFinite(Number(rec?.bytes)) ? Number(rec.bytes) : null;
}
