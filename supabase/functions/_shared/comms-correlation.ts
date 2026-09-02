// ════════════════════════════════════════════════════════════
// End-to-end correlation IDs + configurable max-hop loop policy
//
// Every inbound leg that RentMaikar re-dispatches carries a correlation ID
// and a hop counter embedded in the forwarded message body (and mirrored in
// `messaging_events.metadata`). If a forwarded message ever lands back on one
// of our public aliases, we recognise our own trace marker, increment the hop
// count and refuse to relay it once the configured ceiling is reached.
//
// Policy lives in `platform_kv_settings.comms_loop_policy`:
//   { "enabled": true, "max_hops": 3 }
// ════════════════════════════════════════════════════════════

// deno-lint-ignore no-explicit-any
type Supa = any;

export const LOOP_POLICY_KEY = "comms_loop_policy";

export interface LoopPolicy {
  /** When false, hop enforcement is skipped (correlation IDs still applied). */
  enabled: boolean;
  /** Maximum number of RentMaikar-dispatched legs for one conversation trace. */
  max_hops: number;
}

const DEFAULT_POLICY: LoopPolicy = { enabled: true, max_hops: 3 };

/** Trace marker appended to forwarded bodies, e.g. `[rmk:ab12cd34ef56 h1/3]`. */
const TRACE_RE = /\[rmk:([a-z0-9]{6,32})\s+h(\d+)(?:\/(\d+))?\]/i;

export interface Trace {
  correlationId: string;
  hop: number;
}

export function newCorrelationId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

/** Extract an existing RentMaikar trace from an inbound message body. */
export function parseTrace(body?: string | null): Trace | null {
  const m = TRACE_RE.exec(body || "");
  if (!m) return null;
  const hop = Number.parseInt(m[2], 10);
  return { correlationId: m[1], hop: Number.isFinite(hop) ? hop : 0 };
}

/** Remove the trace marker so operators never see it twice in a relayed body. */
export function stripTrace(body?: string | null): string {
  return (body || "").replace(TRACE_RE, "").replace(/\s{2,}/g, " ").trim();
}

export function formatTrace(correlationId: string, hop: number, maxHops: number): string {
  return `[rmk:${correlationId} h${hop}/${maxHops}]`;
}

export async function getLoopPolicy(supabase: Supa): Promise<LoopPolicy> {
  try {
    const { data } = await supabase
      .from("platform_kv_settings")
      .select("value")
      .eq("key", LOOP_POLICY_KEY)
      .maybeSingle();
    const value = (data?.value ?? {}) as Partial<LoopPolicy>;
    const max = Number(value.max_hops);
    return {
      enabled: value.enabled === undefined ? DEFAULT_POLICY.enabled : !!value.enabled,
      max_hops: Number.isFinite(max) && max > 0 ? Math.min(Math.floor(max), 10) : DEFAULT_POLICY.max_hops,
    };
  } catch (e) {
    console.error("[comms-correlation] failed to read loop policy:", e);
    return { ...DEFAULT_POLICY };
  }
}

export interface HopDecision {
  allowed: boolean;
  correlationId: string;
  /** Hop number this dispatch would represent (1 for a fresh conversation). */
  hop: number;
  maxHops: number;
  policyEnabled: boolean;
  /** Body with any inherited trace marker removed. */
  cleanBody: string;
  reason?: string;
}

/**
 * Decide whether an inbound leg may be re-dispatched, and with which trace.
 * Callers may pass an explicit correlation ID (e.g. from provider metadata);
 * otherwise the marker embedded in the body is used, and failing that a fresh
 * ID is minted.
 */
export async function evaluateHop(
  supabase: Supa,
  args: { body?: string | null; correlationId?: string | null; hop?: number | null },
): Promise<HopDecision> {
  const policy = await getLoopPolicy(supabase);
  const parsed = parseTrace(args.body);
  const correlationId = args.correlationId || parsed?.correlationId || newCorrelationId();
  const previousHop = Number.isFinite(args.hop as number)
    ? Number(args.hop)
    : parsed?.hop ?? 0;
  const hop = previousHop + 1;
  const cleanBody = stripTrace(args.body);

  if (policy.enabled && hop > policy.max_hops) {
    return {
      allowed: false,
      correlationId,
      hop,
      maxHops: policy.max_hops,
      policyEnabled: policy.enabled,
      cleanBody,
      reason: `max_hops_exceeded:${policy.max_hops}`,
    };
  }

  return {
    allowed: true,
    correlationId,
    hop,
    maxHops: policy.max_hops,
    policyEnabled: policy.enabled,
    cleanBody,
  };
}
