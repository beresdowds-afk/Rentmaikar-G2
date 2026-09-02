// GPSANDTRACK (SareKon JSON API v0.7.0) telemetry client.
//
// Reference: SareKon JSON API for Dealer Applications.
//   * Base: https://api.sarekon.com/v1, every method is `<path>.json`
//   * Calls take URL query parameters (GET or POST) — not a JSON body
//   * Authenticate at /session/create.json → returns a session token `sid`
//     which must be passed as the `sid` query parameter on every other call
//   * Devices are addressed by the system-assigned `device_id` (NOT serial/IMEI)
//   * Errors come back with an HTTP status plus a negative numeric code in
//     `error`: -1400 one-time token expired, -1600 session expired,
//     -2200 rate limit, -1000/-1050 bad credentials
//   * List methods paginate through `pagekey` / `nextkey` / `prevkey`
//
// Credentials resolve admin-managed values first (provider_write_credentials
// vault entries / platform_kv_settings), then env secrets:
//   SAREKON_BASE_URL (optional, defaults to https://api.sarekon.com/v1)
//   SAREKON_USERNAME (legacy: SAREKON_USER_ID)
//   SAREKON_PASSWORD
//
// Nothing throws: unconfigured or failing calls return a structured result so
// the rest of the platform degrades gracefully.

import { ensureProviderConfig, providerConfigSource, providerOverride } from "./provider-config.ts";
import { clearSession, credentialFingerprint, loadSession, saveSession } from "./provider-session-store.ts";

type OkResult<T = unknown> = { ok: true; body: T };
type ErrResult =
  | { ok: false; reason: "not_configured"; missing?: string[] }
  | { ok: false; reason: "network_error"; message: string }
  | { ok: false; reason: "auth_error"; status: number; body: unknown }
  | { ok: false; reason: "rate_limited"; status: number; body: unknown }
  | { ok: false; reason: "provider_error"; status: number; body: unknown };
export type GPSANDTRACKResult<T = unknown> = OkResult<T> | ErrResult;

const DEFAULT_BASE = "https://api.sarekon.com/v1";

/** Query parameter values: scalars, or arrays for the `name[]` style params. */
type Param = string | number | boolean | null | undefined | Array<string | number>;

/**
 * Coerce whatever an admin saved into the documented API root
 * (https://<host>/v1). Spec/doc URLs such as
 * `https://sys.sarekon.com/api/v1/specs/dealer.yaml` are a common paste
 * mistake and would make every call 401/404.
 */
export function normaliseBaseUrl(input: string): string {
  const raw = (input || "").trim().replace(/\/+$/, "");
  if (!raw) return DEFAULT_BASE;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return DEFAULT_BASE;
  }
  // Drop documentation artefacts: spec files, /specs/..., /docs, .json/.yaml.
  let path = u.pathname.replace(/\/(specs?|docs?|redoc|swagger)(\/.*)?$/i, "");
  path = path.replace(/\/[^/]+\.(ya?ml|json|html?)$/i, "");
  const version = path.match(/\/v\d+/i)?.[0] ?? "/v1";
  const host = u.host.replace(/^sys\./i, "api.");
  return `https://${host}${version}`;
}

function creds() {
  const base = normaliseBaseUrl(
    providerOverride("sarekon", "base_url") || Deno.env.get("SAREKON_BASE_URL") || DEFAULT_BASE,
  );
  // GPSANDTRACK authenticates with a USERNAME + password. `user_id` is kept as a
  // legacy alias so previously stored credentials keep working.
  const userId = providerOverride("sarekon", "username") || providerOverride("sarekon", "user_id") ||
    Deno.env.get("SAREKON_USERNAME") || Deno.env.get("SAREKON_USER_ID") || "";
  const password = providerOverride("sarekon", "password") || Deno.env.get("SAREKON_PASSWORD") || "";
  if (!userId || !password) return null;
  return { base, userId, password };
}

export function missingCredentials(): string[] {
  const missing: string[] = [];
  if (
    !(providerOverride("sarekon", "username") || providerOverride("sarekon", "user_id") ||
      Deno.env.get("SAREKON_USERNAME") || Deno.env.get("SAREKON_USER_ID"))
  ) missing.push("username");
  if (!(providerOverride("sarekon", "password") || Deno.env.get("SAREKON_PASSWORD"))) missing.push("password");
  return missing;
}

// ---- session cache -------------------------------------------------------
// Two layers: a per-isolate memory cache, plus an encrypted row in
// `provider_api_sessions` so a cold start (or another edge function, or the
// mobile app hitting a different instance) reuses the same live `sid` instead
// of re-authenticating. Sessions are bound to a credential fingerprint, so
// rotating the username/password invalidates them automatically.
let session: { sid: string; issuedAt: number; fingerprint: string } | null = null;
const SESSION_TTL_MS = 20 * 60_000;
const SESSION_PROVIDER = "sarekon";


function pick(obj: unknown, keys: string[]): unknown {
  if (!obj || typeof obj !== "object") return undefined;
  const rec = obj as Record<string, unknown>;
  for (const k of keys) {
    if (rec[k] !== undefined && rec[k] !== null && rec[k] !== "") return rec[k];
  }
  return undefined;
}

/** Dig out the first array we find under the documented list keys. */
function extractList(body: unknown, keys: string[]): Record<string, unknown>[] {
  if (Array.isArray(body)) return body as Record<string, unknown>[];
  if (!body || typeof body !== "object") return [];
  const rec = body as Record<string, unknown>;
  for (const k of keys) {
    const v = rec[k];
    if (Array.isArray(v)) return v as Record<string, unknown>[];
  }
  for (const v of Object.values(rec)) {
    if (Array.isArray(v)) return v as Record<string, unknown>[];
  }
  return [];
}

function buildQuery(params: Record<string, Param>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) {
      // Bracketed names are a mandatory part of the parameter name.
      const name = k.endsWith("[]") ? k : `${k}[]`;
      for (const item of v) qs.append(name, String(item));
    } else {
      qs.append(k, String(v));
    }
  }
  return qs.toString();
}

/** Numeric error code returned in the JSON envelope, when present. */
function errorCode(body: unknown): number | null {
  if (!body || typeof body !== "object") return null;
  const err = (body as Record<string, unknown>).error;
  if (err === null || err === undefined) return null;
  if (typeof err === "number") return err;
  if (typeof err === "string") {
    const n = Number(err);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof err === "object") {
    const n = Number(pick(err, ["code", "id", "error_code"]));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function errorPayload(body: unknown): unknown {
  if (body && typeof body === "object") {
    const err = (body as Record<string, unknown>).error;
    if (err !== null && err !== undefined && err !== "") return err;
  }
  return body;
}

/** Raw unauthenticated request (query parameters, JSON response). */
async function request<T = unknown>(
  path: string,
  params: Record<string, Param>,
): Promise<GPSANDTRACKResult<T>> {
  const c = creds();
  if (!c) return { ok: false, reason: "not_configured", missing: missingCredentials() };
  const query = buildQuery(params);
  let res: Response;
  try {
    // The API accepts the same query parameters over POST, which keeps
    // credentials and session tokens out of URLs and proxy logs.
    res = await fetch(`${c.base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: query,
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    return { ok: false, reason: "network_error", message: (e as Error).message || String(e) };
  }
  const raw = await res.text().catch(() => "");
  let body: unknown = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = raw.slice(0, 400); }

  const code = errorCode(body);
  const payload = errorPayload(body);

  if (res.status === 429 || code === -2200) {
    return { ok: false, reason: "rate_limited", status: res.status, body: payload };
  }
  // -1000..-1999 are authentication and session errors (expired session, bad
  // credentials, disabled account) — the caller re-authenticates on these.
  if (res.status === 401 || res.status === 403 || (code !== null && code <= -1000 && code >= -1999)) {
    return { ok: false, reason: "auth_error", status: res.status, body: payload };
  }
  if (code !== null) return { ok: false, reason: "provider_error", status: res.status, body: payload };
  if (!res.ok) return { ok: false, reason: "provider_error", status: res.status, body };
  return { ok: true, body: body as T };
}

/**
 * Authenticate and cache the `sid` session token — first in memory, then in
 * the encrypted `provider_api_sessions` store so the session survives isolate
 * restarts and is shared by web, mobile and cron callers.
 */
async function login(force = false): Promise<GPSANDTRACKResult<string>> {
  const c = creds();
  if (!c) return { ok: false, reason: "not_configured", missing: missingCredentials() };
  const fingerprint = await credentialFingerprint(c.base, c.userId, c.password);

  if (!force && session && session.fingerprint === fingerprint && Date.now() - session.issuedAt < SESSION_TTL_MS) {
    return { ok: true, body: session.sid };
  }

  if (!force) {
    const stored = await loadSession(SESSION_PROVIDER, fingerprint);
    if (stored) {
      session = { sid: stored.token, issuedAt: stored.issuedAt, fingerprint };
      return { ok: true, body: stored.token };
    }
  }

  // units[]=utc,metric so timestamps come back in UTC and speeds in km/h
  // regardless of the dealer account's saved preferences.
  const r = await request("/session/create.json", {
    username: c.userId,
    password: c.password,
    "units[]": ["utc", "metric"],
  });
  if (!r.ok) {
    if (r.reason === "auth_error") {
      session = null;
      await clearSession(SESSION_PROVIDER);
    }
    return r;
  }
  const body = r.body as Record<string, unknown>;
  const sid = pick(body, ["sid"]) ?? pick((body?.session ?? {}) as Record<string, unknown>, ["sid", "id", "token"]);
  if (!sid) return { ok: false, reason: "auth_error", status: 200, body };
  session = { sid: String(sid), issuedAt: Date.now(), fingerprint };
  await saveSession(SESSION_PROVIDER, fingerprint, session.sid, SESSION_TTL_MS);
  return { ok: true, body: session.sid };
}


/** Authenticated call; transparently re-authenticates once on session expiry. */
async function call<T = unknown>(
  path: string,
  params: Record<string, Param> = {},
): Promise<GPSANDTRACKResult<T>> {
  const auth = await login();
  if (!auth.ok) return auth;
  let r = await request<T>(path, { sid: auth.body, ...params });
  if (!r.ok && r.reason === "auth_error") {
    // The stored session was rejected (expired/revoked) — drop it everywhere
    // so other instances don't keep retrying the same dead token.
    session = null;
    await clearSession(SESSION_PROVIDER);
    const retryAuth = await login(true);
    if (!retryAuth.ok) return retryAuth;
    r = await request<T>(path, { sid: retryAuth.body, ...params });
  }
  return r;
}

/**
 * Walk the `nextkey` pagination chain and concatenate every page (bounded so a
 * huge dealer account can never hang a sync run).
 */
async function callPaged(
  path: string,
  params: Record<string, Param>,
  listKeys: string[],
  maxPages = 10,
): Promise<GPSANDTRACKResult<Record<string, unknown>[]>> {
  const rows: Record<string, unknown>[] = [];
  let pagekey: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const r = await call(path, { ...params, pagekey });
    if (!r.ok) return rows.length ? { ok: true, body: rows } : r;
    rows.push(...extractList(r.body, listKeys));
    const next = (r.body as Record<string, unknown>)?.nextkey;
    if (!next) break;
    pagekey = String(next);
  }
  return { ok: true, body: rows };
}

// ---- normalised shapes ---------------------------------------------------

export interface GPSANDTRACKDevice {
  id: string;
  serial: string;
  name: string | null;
  model: string | null;
  status: string | null;
  lastUpdate: string | null;
  latitude: number | null;
  longitude: number | null;
  speedKmh: number | null;
  course: number | null;
  ignition: boolean | null;
  address: string | null;
  raw: Record<string, unknown>;
}

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

const bool = (v: unknown): boolean | null => {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "boolean") return v;
  const s = String(v).toLowerCase();
  if (["1", "true", "on", "yes"].includes(s)) return true;
  if (["0", "false", "off", "no"].includes(s)) return false;
  return null;
};

/**
 * A "DVD" row bundles device + asset (vehicle) + driver. The device_id is the
 * stable primary identifier; serials/VINs live on the nested objects.
 */
export function normaliseDevice(row: Record<string, unknown>): GPSANDTRACKDevice {
  const device = (row.device ?? row) as Record<string, unknown>;
  const asset = (row.asset ?? {}) as Record<string, unknown>;
  const loc = (row.location ?? row.last_location ?? device.location ?? row.position ?? row) as Record<string, unknown>;
  const id = pick(device, ["device_id", "deviceId", "id"]) ?? pick(row, ["device_id", "dvd_id", "id"]);
  // `device_description` carries the physical device serial (e.g. V24346052939583);
  // the VIN lives on the asset and is only a fallback label.
  const serial = pick(device, ["device_description", "serial", "serial_number", "esn", "imei", "meid"]) ??
    pick(asset, ["asset_vin", "vin", "external_ref"]) ?? id;
  // `status` on /dvd/show.json is an array of data-type readings; the human
  // status string is the account mode ("Active", "Suspended"…).
  const modeStatus = pick(row, ["mode_description", "service_description"]) ??
    pick(device, ["status", "state", "connection_status"]);
  return {
    id: String(id ?? serial ?? ""),
    serial: String(serial ?? id ?? ""),
    // /dvd/enumerate.json returns a flat row with `description`; /dvd/show.json
    // nests the label under `asset`.
    name: (pick(asset, ["asset_description", "description", "name"]) ??
      pick(row, ["dvd_description", "description", "name", "label"]) ??
      pick(device, ["device_description", "name", "label"])) as string ?? null,
    model: (pick(asset, ["model_description"]) ??
      pick(device, ["hardware_series_description", "model", "device_model", "product"])) as string ?? null,
    status: typeof modeStatus === "string" ? modeStatus : null,
    lastUpdate: (pick(loc, [
      "triggered_on_local",
      "location_valid_on_local",
      "dt",
      "dt_local",
      "timestamp",
      "time",
      "gps_time",
      "reported_at",
    ]) as string) ??
      (pick(device, ["last_update", "updated_at", "last_seen"]) as string) ?? null,
    latitude: num(pick(loc, ["latitude", "lat"])),
    longitude: num(pick(loc, ["longitude", "lon", "lng", "long"])),
    speedKmh: num(pick(loc, ["speed_kph", "speed_kmh", "speed", "velocity"])),
    course: num(pick(loc, ["bearing_deg", "heading", "course", "bearing", "direction"])),
    ignition: bool(pick(loc, ["ignition", "ign", "engine_on"]) ?? pick(device, ["ignition"])),
    address: (pick(loc, ["address", "location_name", "street"]) as string) ?? null,
    raw: row,
  };
}

export const sarekon = {
  ensureReady: async () => { await ensureProviderConfig("sarekon"); },
  configSource: () => providerConfigSource("sarekon"),
  isConfigured: () => !!creds(),
  baseUrl: () => creds()?.base ?? DEFAULT_BASE,
  resetSession: async () => { session = null; await clearSession(SESSION_PROVIDER); },

  /**
   * Low-level authenticated call — used by the permission prober so it can hit
   * an endpoint with no payload purely to learn whether the dealer account
   * holds the scope (SareKon evaluates permissions before argument checks).
   */
  raw: <T = unknown>(path: string, params: Record<string, Param> = {}) => call<T>(path, params),

  /** Verify credentials by creating a fresh session. */
  ping: () => login(true),


  /**
   * Search trackers. `q` is required by the API and matches a device serial or
   * an asset VIN/HIN/serial; an empty search returns the account's trackers.
   */
  async listDevices(q = ""): Promise<GPSANDTRACKResult<GPSANDTRACKDevice[]>> {
    const r = await callPaged("/dvd/enumerate.json", { q }, ["dvds", "results", "data", "items"]);
    if (!r.ok) return r;
    return { ok: true, body: r.body.map(normaliseDevice) };
  },

  /** Tracker detail (device + asset + driver), including available commands. */
  async showDevice(deviceId: string): Promise<GPSANDTRACKResult<GPSANDTRACKDevice | null>> {
    const r = await call("/dvd/show.json", { device_id: deviceId, include_commands: 1 });
    if (!r.ok) return r;
    const body = r.body as Record<string, unknown>;
    const row = (body?.dvd ?? body?.data ?? body) as Record<string, unknown>;
    return { ok: true, body: row ? normaliseDevice(row) : null };
  },

  async locations(deviceId: string, limit = 50): Promise<GPSANDTRACKResult<Record<string, unknown>[]>> {
    const r = await callPaged("/location/list.json", { "device_ids[]": [deviceId] }, [
      "locations",
      "results",
      "data",
      "items",
    ], Math.max(1, Math.ceil(limit / 100)));
    if (!r.ok) return r;
    return { ok: true, body: r.body.slice(0, limit) };
  },

  /**
   * Fleet-wide current locations for up to ~50 devices in one call. Used by the
   * high-frequency location worker; pagination is bounded so a large fleet can
   * never stall a single scheduled run.
   */
  async currentLocations(deviceIds: string[]): Promise<GPSANDTRACKResult<Record<string, unknown>[]>> {
    const ids = [...new Set(deviceIds.filter(Boolean).map(String))];
    if (!ids.length) return { ok: true, body: [] };
    return await callPaged(
      "/location/list.json",
      { "device_ids[]": ids, latest: 1 },
      ["locations", "results", "data", "items"],
      Math.max(1, Math.ceil(ids.length / 100)),
    );
  },



  /** Event history (also carries command result detail via message_id). */
  async messages(deviceId: string, limit = 50): Promise<GPSANDTRACKResult<Record<string, unknown>[]>> {
    const r = await callPaged("/message/list.json", { "device_ids[]": [deviceId] }, [
      "messages",
      "results",
      "data",
      "items",
    ], Math.max(1, Math.ceil(limit / 100)));
    if (!r.ok) return r;
    return { ok: true, body: r.body.slice(0, limit) };
  },

  async trips(deviceId: string, limit = 50): Promise<GPSANDTRACKResult<Record<string, unknown>[]>> {
    const r = await callPaged("/trip/list.json", { device_id: deviceId }, ["trips", "results", "data", "items"],
      Math.max(1, Math.ceil(limit / 100)));
    if (!r.ok) return r;
    return { ok: true, body: r.body.slice(0, limit) };
  },

  async stops(deviceId: string, limit = 50): Promise<GPSANDTRACKResult<Record<string, unknown>[]>> {
    const r = await callPaged("/stop/list.json", { device_id: deviceId }, ["stops", "results", "data", "items"],
      Math.max(1, Math.ceil(limit / 100)));
    if (!r.ok) return r;
    return { ok: true, body: r.body.slice(0, limit) };
  },

  /**
   * Allowed/required data-type parameters for a command on given devices.
   * Both `device_ids[]` and `message_type_id` are required by the API.
   */
  async commandParameters(
    deviceIds: string[] = [],
    messageTypeId: number = SAREKON_MESSAGE_TYPES.locate,
  ): Promise<GPSANDTRACKResult<Record<string, unknown>[]>> {
    if (deviceIds.length === 0) return { ok: true, body: [] };
    const r = await call("/command_queue/parameters_enumerate.json", {
      "device_ids[]": deviceIds,
      message_type_id: messageTypeId,
    });
    if (!r.ok) return r;
    return { ok: true, body: extractList(r.body, ["parameters", "results", "data", "items"]) };
  },

  /**
   * Queue a command. `command` is either a platform name (immobilize, locate…)
   * or a raw numeric message_type_id. Extra fields are sent as the documented
   * `data_type_xxx` parameters.
   */
  sendCommand(
    deviceId: string,
    command: string | number,
    parameters: Record<string, unknown> = {},
  ): Promise<GPSANDTRACKResult> {
    const messageTypeId = typeof command === "number"
      ? command
      : SAREKON_MESSAGE_TYPES[command as keyof typeof SAREKON_MESSAGE_TYPES] ?? Number(command);
    if (!Number.isFinite(messageTypeId)) {
      return Promise.resolve({
        ok: false,
        reason: "provider_error",
        status: 400,
        body: { description: `Unsupported GPSANDTRACK command "${command}"` },
      } as ErrResult);
    }
    const data: Record<string, Param> = {};
    for (const [k, v] of Object.entries(parameters)) {
      if (v === undefined || v === null) continue;
      data[/^data_type_\d+$/.test(k) ? k : `data_type_${k}`] = String(v);
    }
    return call("/command_queue/create.json", {
      "device_ids[]": [deviceId],
      message_type_id: messageTypeId,
      ...data,
    });
  },

  /** Poll queued command status (recommended every 10-20s until complete). */
  async commandStatus(commandQueueIds: string[]): Promise<GPSANDTRACKResult<Record<string, unknown>[]>> {
    if (commandQueueIds.length === 0) return { ok: true, body: [] };
    const r = await call("/command_queue/list.json", { "command_queue_ids[]": commandQueueIds });
    if (!r.ok) return r;
    return { ok: true, body: extractList(r.body, ["commands", "results", "data", "items"]) };
  },

  /**
   * Recent command activity for a device. Queued command results land in the
   * event history, so this reads /message/list.json for the device.
   */
  async commandHistory(deviceId?: string, limit = 50): Promise<GPSANDTRACKResult<Record<string, unknown>[]>> {
    const r = await callPaged("/message/list.json", deviceId ? { "device_ids[]": [deviceId] } : {}, [
      "messages",
      "results",
      "data",
      "items",
    ], Math.max(1, Math.ceil(limit / 100)));
    if (!r.ok) return r;
    return { ok: true, body: r.body.slice(0, limit) };
  },

  async subscriptions(): Promise<GPSANDTRACKResult<Record<string, unknown>[]>> {
    const r = await callPaged("/subscription/list.json", {}, ["subscriptions", "results", "data", "items"]);
    if (!r.ok) return r;
    return { ok: true, body: r.body };
  },

  // ---- Installation ------------------------------------------------------

  /**
   * Install a device into an asset (associates a device serial with an asset
   * VIN/HIN/serial). `conflict_action_id` defaults to 3 = REPLACE per the spec.
   */
  installDevice(input: {
    assetVin: string;
    deviceSerial: string;
    vinNotDecodable?: boolean;
    installedOdometer?: number;
    conflictActionId?: number;
  }): Promise<GPSANDTRACKResult> {
    return call("/dvd/install_create.json", {
      asset_vin: input.assetVin,
      device_serial: input.deviceSerial,
      asset_vin_not_decodable: input.vinNotDecodable ? 1 : 0,
      installed_odometer_local: input.installedOdometer,
      conflict_action_id: input.conflictActionId,
    });
  },

  /** Uninstall a device from its asset (system-assigned device_id). */
  uninstallDevice(deviceId: string): Promise<GPSANDTRACKResult> {
    return call("/dvd/install_destroy.json", { device_id: deviceId });
  },

  /** Update asset (vehicle) metadata. `allow_group_changes` guards group clears. */
  updateAsset(assetId: string, fields: Record<string, unknown>): Promise<GPSANDTRACKResult> {
    const allowed = [
      "description",
      "external_ref",
      "make_description",
      "model_description",
      "year",
      "color",
      "license_issuer",
      "license_number",
      "group_ids[]",
      "allow_group_changes",
    ];
    const params: Record<string, Param> = { asset_id: assetId };
    for (const key of allowed) {
      const v = fields[key] ?? fields[key.replace("[]", "")];
      if (v === undefined || v === null || v === "") continue;
      params[key] = Array.isArray(v) ? (v as Array<string | number>) : String(v);
    }
    return call("/asset/update.json", params);
  },

  /** Start the basic (GPS + cellular) installation test. Returns the start `dt`. */
  async startInstallTest(deviceId: string): Promise<GPSANDTRACKResult<{ dt: string | null }>> {
    const r = await call("/dvd/test_create.json", { device_id: deviceId });
    if (!r.ok) return r;
    const dt = pick(r.body as Record<string, unknown>, ["dt", "datetime", "started_on"]);
    return { ok: true, body: { dt: dt ? String(dt) : null } };
  },

  /** Poll the installation test result (min 5s, recommended 10s between calls). */
  installTestResult(deviceId: string, dt: string): Promise<GPSANDTRACKResult> {
    return call("/dvd/test_show.json", { device_id: deviceId, dt });
  },

  // ---- Drivers -----------------------------------------------------------

  /**
   * Assign a driver to an asset (sold / financed / leased). The driver is
   * matched by `driver_id`, or created/matched from name + email/phone/ref.
   */
  assignDriver(input: {
    assetVin: string;
    relationshipTypeId: number;
    driverId?: string;
    firstName?: string;
    lastName?: string;
    externalRef?: string;
    email?: string;
    phone?: string;
    conflictActionId?: number;
  }): Promise<GPSANDTRACKResult> {
    return call("/dvd/assign_create.json", {
      asset_vin: input.assetVin,
      driver_relationship_type_id: input.relationshipTypeId,
      driver_id: input.driverId,
      driver_first_name: input.firstName,
      driver_last_name: input.lastName,
      driver_external_ref: input.externalRef,
      driver_email: input.email,
      driver_phone: input.phone,
      conflict_action_id: input.conflictActionId,
    });
  },

  /** Unassign a driver from an asset. */
  unassignDriver(input: { driverId?: string; assetVin?: string; assetId?: string }): Promise<GPSANDTRACKResult> {
    return call("/dvd/assign_destroy.json", {
      driver_id: input.driverId,
      asset_vin: input.assetVin,
      asset_id: input.assetId,
    });
  },

  /** Update a driver's contact / address / licence details. */
  updateDriver(driverId: string, fields: Record<string, unknown>): Promise<GPSANDTRACKResult> {
    const allowed = [
      "first_name",
      "last_name",
      "external_ref",
      "email",
      "phone",
      "street_line1",
      "street_line2",
      "city",
      "state_code",
      "country_code",
      "postal_code",
      "license_issuer",
      "license_number",
    ];
    const params: Record<string, Param> = { driver_id: driverId };
    for (const key of allowed) {
      const v = fields[key];
      if (v === undefined || v === null || v === "") continue;
      params[key] = String(v);
    }
    return call("/driver/update.json", params);
  },

  // ---- Account management ------------------------------------------------

  /**
   * Transfer trackers to another account. ALL device/asset/driver ids that are
   * installed or assigned to each other must be passed together.
   */
  transferTrackers(input: {
    accountId: string;
    deviceIds?: string[];
    assetIds?: string[];
    driverIds?: string[];
  }): Promise<GPSANDTRACKResult> {
    return call("/dvd/transfer_create.json", {
      account_id: input.accountId,
      "device_ids[]": input.deviceIds?.length ? input.deviceIds : undefined,
      "asset_ids[]": input.assetIds?.length ? input.assetIds : undefined,
      "driver_ids[]": input.driverIds?.length ? input.driverIds : undefined,
    });
  },

  // ---- Deals -------------------------------------------------------------

  /** Create a deal (sale / loan / lease / dropship / transfer). */
  createDeal(input: {
    accountId: string;
    dealTypeId: number;
    accountTemplateId?: string;
    productCode?: string;
    dealPrice?: string | number;
    dealExternalRef?: string;
    dealDate?: string;
    deviceSerial?: string;
    assetVin?: string;
  }): Promise<GPSANDTRACKResult> {
    return call("/deal/create.json", {
      account_id: input.accountId,
      deal_type_id: input.dealTypeId,
      account_template_id: input.accountTemplateId,
      product_code: input.productCode,
      deal_price: input.dealPrice,
      deal_external_ref: input.dealExternalRef,
      deal_date: input.dealDate,
      device_serial: input.deviceSerial,
      asset_vin: input.assetVin,
    });
  },

  async listDeals(dealIds: string[] = [], limit = 100): Promise<GPSANDTRACKResult<Record<string, unknown>[]>> {
    const r = await callPaged(
      "/deal/list.json",
      dealIds.length ? { "deal_ids[]": dealIds } : {},
      ["deals", "results", "data", "items"],
      Math.max(1, Math.ceil(limit / 100)),
    );
    if (!r.ok) return r;
    return { ok: true, body: r.body.slice(0, limit) };
  },

  showDeal(dealId: string): Promise<GPSANDTRACKResult> {
    return call("/deal/show.json", { deal_id: dealId });
  },

  /** Unwind (reverse) a deal — only allowed for a limited window after creation. */
  unwindDeal(dealId: string): Promise<GPSANDTRACKResult> {
    return call("/deal/unwind_update.json", { deal_id: dealId });
  },
};

/** Documented deal_type_id values for /deal/create.json. */
export const SAREKON_DEAL_TYPES: Array<{ id: number; label: string }> = [
  { id: 1, label: "Device Dropship" },
  { id: 2, label: "Device Handover" },
  { id: 3, label: "Vehicle Sale Protected" },
  { id: 4, label: "Vehicle Sale Unprotected" },
  { id: 5, label: "Vehicle Loan Standard" },
  { id: 6, label: "Vehicle Lease Standard" },
  { id: 7, label: "Vehicle Loan Captive" },
  { id: 8, label: "Vehicle Lease Captive" },
  { id: 9, label: "Vehicle Sale Drive-Off" },
  { id: 10, label: "Vehicle Dealer Transfer" },
  { id: 11, label: "Vehicle NCA" },
];

/** driver_relationship_type_id values for /dvd/assign_create.json. */
export const SAREKON_DRIVER_RELATIONSHIPS: Array<{ id: number; label: string }> = [
  { id: 1, label: "Borrower (financed)" },
  { id: 2, label: "Leasee (leased)" },
  { id: 3, label: "Owner (sold)" },
  { id: 4, label: "Other / operator" },
];

/** conflict_action_id values shared by install_create and assign_create. */
export const SAREKON_CONFLICT_ACTIONS: Array<{ id: number; label: string }> = [
  { id: -1, label: "Error if a conflict exists" },
  { id: 1, label: "Add as backup" },
  { id: 2, label: "Make primary (demote others)" },
  { id: 3, label: "Replace (default)" },
];

/** Documented SareKon message_type_id values (each needs its own ota_ permission). */
export const SAREKON_MESSAGE_TYPES = {
  locate: 6000,
  starterAutoEnable: 1252,
  starterAutoDisable: 1253,
  // 1262/1263 are documented as Audio-minder and surface on live dealer
  // accounts as "Payment Reminder" enable/disable — same message ids.
  paymentReminderEnable: 1262,
  paymentReminderDisable: 1263,
  audioMinderEnable: 1262,
  audioMinderDisable: 1263,
  setOverspeed: 3100,
  setDeviceGeofence: 3400,
  setPowerSteady: 3350,
  instaFenceEnable: 6450,
  instaFenceDisable: 6451,
  repoOpenTicket: 6100,
  repoCloseTicket: 6200,
  repoSetZone: 6110,
  repoModeEnable: 61000,
  repoModeDisable: 62000,
} as const;

/** Platform command name -> GPSANDTRACK message_type_id. */
export const SAREKON_COMMAND_MAP: Record<string, number> = {
  immobilize: SAREKON_MESSAGE_TYPES.starterAutoDisable,
  engineStop: SAREKON_MESSAGE_TYPES.starterAutoDisable,
  mobilize: SAREKON_MESSAGE_TYPES.starterAutoEnable,
  engineResume: SAREKON_MESSAGE_TYPES.starterAutoEnable,
  locate: SAREKON_MESSAGE_TYPES.locate,
  ping: SAREKON_MESSAGE_TYPES.locate,
  repoModeEnable: SAREKON_MESSAGE_TYPES.repoModeEnable,
  repoModeDisable: SAREKON_MESSAGE_TYPES.repoModeDisable,
};
