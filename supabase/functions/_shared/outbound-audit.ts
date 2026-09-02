// ════════════════════════════════════════════════════════════
// Outbound decision audit
//
// Records WHY every outbound message was sent or blocked, so support and
// compliance can answer "did we contact this person, and if not why not?".
//
// Never throws — auditing must never break a send.
// ════════════════════════════════════════════════════════════

// deno-lint-ignore no-explicit-any
type Supa = any;

export type AuditChannel = "call" | "sms" | "whatsapp" | "email";
export type AuditDecision = "sent" | "blocked" | "failed";

export interface OutboundAuditEntry {
  channel: AuditChannel;
  decision: AuditDecision;
  /** Machine-readable cause: channel_paused, recipient_opted_out, suppressed, provider_error_429, delivered … */
  reason?: string | null;
  region?: string | null;
  provider?: string | null;
  recipient?: string | null;
  notificationType?: string | null;
  messageId?: string | null;
  functionName?: string | null;
  userId?: string | null;
  metadata?: Record<string, unknown>;
}

/** Mask a phone number or email so the log never stores full contact details. */
export function maskRecipient(value?: string | null): string | null {
  const v = (value || "").replace("whatsapp:", "").trim();
  if (!v) return null;
  if (v.includes("@")) {
    const [user, domain] = v.split("@");
    const head = user.slice(0, 2);
    return `${head}${"*".repeat(Math.max(user.length - 2, 1))}@${domain}`;
  }
  return v.length > 6 ? `${v.slice(0, 6)}${"*".repeat(Math.max(v.length - 6, 0))}` : v;
}

export async function logOutboundDecision(supabase: Supa, entry: OutboundAuditEntry): Promise<void> {
  try {
    await supabase.from("outbound_decision_log").insert({
      channel: entry.channel,
      direction: "outbound",
      decision: entry.decision,
      reason: entry.reason ?? null,
      region: entry.region ?? null,
      provider: entry.provider ?? null,
      recipient_masked: maskRecipient(entry.recipient),
      notification_type: entry.notificationType ?? null,
      message_id: entry.messageId ?? null,
      function_name: entry.functionName ?? null,
      user_id: entry.userId ?? null,
      metadata: entry.metadata ?? {},
    });
  } catch (e) {
    console.error("[outbound-audit] failed to record decision:", e);
  }
}
