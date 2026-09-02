/**
 * Traccar ingress port resolution.
 *
 * Traccar listens on a different TCP/UDP port for every device protocol, so the
 * port a tracker must be configured with is a function of the DEVICE MODEL, not
 * of the server. This module maps models -> protocol -> default port and lets
 * admins override any of it without redeploying.
 *
 * Reference: Traccar default `conf/traccar.xml` protocol port assignments.
 */

export interface TraccarProtocol {
  /** Traccar protocol identifier (matches the `protocol` field on positions). */
  protocol: string;
  /** Default listener port from Traccar's shipped configuration. */
  port: number;
  /** Human label shown in the admin UI. */
  label: string;
}

/** Default listener ports for the protocols RentMaikar trackers use. */
export const TRACCAR_PROTOCOLS: TraccarProtocol[] = [
  { protocol: "gt06", port: 5023, label: "GT06 / Concox family" },
  { protocol: "teltonika", port: 5027, label: "Teltonika FMB/FMC" },
  { protocol: "queclink", port: 5004, label: "Queclink GV/GL" },
  { protocol: "meitrack", port: 5020, label: "Meitrack MVT/T3" },
  { protocol: "h02", port: 5013, label: "H02 / generic Chinese" },
  { protocol: "coban", port: 5001, label: "Coban GPS10x" },
  { protocol: "watch", port: 5093, label: "Watch / wearable" },
  { protocol: "ruptela", port: 5046, label: "Ruptela FM-Eco/Pro" },
  { protocol: "suntech", port: 5011, label: "Suntech ST3xx/ST4xx" },
  { protocol: "jt808", port: 5044, label: "JT/T 808" },
  { protocol: "osmand", port: 5055, label: "OsmAnd / phone client" },
];

const BY_PROTOCOL = new Map(TRACCAR_PROTOCOLS.map((p) => [p.protocol, p]));

/**
 * Model-name fragments (lowercase) mapped to a protocol. Ordered by
 * specificity — the first fragment found in the model name wins.
 */
const MODEL_PATTERNS: Array<[RegExp, string]> = [
  [/\bfm[bc]\d|teltonika/i, "teltonika"],
  [/\bgv\d|\bgl\d|queclink/i, "queclink"],
  [/\bmvt\d|\bt3\d|meitrack/i, "meitrack"],
  [/ruptela|fm-?eco|fm-?pro/i, "ruptela"],
  [/suntech|\bst3\d|\bst4\d/i, "suntech"],
  [/jt-?808|\bjt808/i, "jt808"],
  [/coban|\btk10[23]|\bgps10\d/i, "coban"],
  [/\bh02\b|\btk1\d{3}/i, "h02"],
  [/watch|wearable|\bq\d{2}\b/i, "watch"],
  [/osmand|phone|mobile/i, "osmand"],
  [/gt0?6|concox|\bjm-?vl|\bgt02|\bwetrack/i, "gt06"],
];

/** Protocol used when a model cannot be recognised. */
export const FALLBACK_PROTOCOL = "gt06";

/** Admin-managed overrides, keyed by lowercase model name -> port. */
export type PortOverrides = Record<string, number>;

export interface ResolvedPort {
  model: string | null;
  protocol: string;
  port: number;
  label: string;
  /** How the port was decided. */
  source: "override" | "model" | "fallback";
}

/** Resolve the ingress protocol + port a given device model should report to. */
export function resolveTraccarPort(
  model: string | null | undefined,
  overrides: PortOverrides = {},
): ResolvedPort {
  const key = (model ?? "").trim().toLowerCase();

  if (key && typeof overrides[key] === "number") {
    const match = TRACCAR_PROTOCOLS.find((p) => p.port === overrides[key]);
    return {
      model: model ?? null,
      protocol: match?.protocol ?? "custom",
      port: overrides[key],
      label: match?.label ?? "Custom port override",
      source: "override",
    };
  }

  if (key) {
    for (const [pattern, protocol] of MODEL_PATTERNS) {
      if (pattern.test(key)) {
        const p = BY_PROTOCOL.get(protocol)!;
        return { model: model ?? null, protocol: p.protocol, port: p.port, label: p.label, source: "model" };
      }
    }
  }

  const fb = BY_PROTOCOL.get(FALLBACK_PROTOCOL)!;
  return { model: model ?? null, protocol: fb.protocol, port: fb.port, label: fb.label, source: "fallback" };
}

/** Strip scheme/path from a base URL or raw IP so it can be used as a tracker host. */
export function ingressHost(baseUrlOrIp: string | null | undefined): string | null {
  const raw = (baseUrlOrIp ?? "").trim();
  if (!raw) return null;
  try {
    const withScheme = /^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(withScheme).hostname || null;
  } catch {
    return raw.replace(/^[a-z]+:\/\//i, "").split("/")[0].split(":")[0] || null;
  }
}

/** `host:port` string an installer types into the tracker for this model. */
export function traccarIngressEndpoint(
  baseUrlOrIp: string | null | undefined,
  model: string | null | undefined,
  overrides: PortOverrides = {},
): { host: string | null; port: number; endpoint: string | null; resolved: ResolvedPort } {
  const host = ingressHost(baseUrlOrIp);
  const resolved = resolveTraccarPort(model, overrides);
  return { host, port: resolved.port, endpoint: host ? `${host}:${resolved.port}` : null, resolved };
}
