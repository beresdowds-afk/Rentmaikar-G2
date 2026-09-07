// ════════════════════════════════════════════════════════════
// Inbound email routing table
//
// Every mailbox on the inbound domain (backend.rentmaikar.com) can be routed
// to one or more EXTERNAL delivery addresses. Admins edit the table from
// Admin → Email Routing; it is stored in
// `platform_kv_settings.email_routing_rules`.
// ════════════════════════════════════════════════════════════

// deno-lint-ignore no-explicit-any
type Supa = any;

export const EMAIL_ROUTING_KEY = "email_routing_rules";

/** The external mailboxes mail can be delivered to. */
export const DELIVERY_ADDRESSES = [
  "support@rentmaikar.com",
  "noreply@rentmaikar.com",
  "admin@rentmaikar.com",
  "notification@rentmaikar.com",
] as const;

export interface EmailRoutingRule {
  /** Mailbox local part on the inbound domain, or "*" for the catch-all. */
  mailbox: string;
  /** External addresses that receive a copy. */
  destinations: string[];
  enabled: boolean;
}

export interface EmailRoutingTable {
  rules: EmailRoutingRule[];
  /** Used when no rule matches and no catch-all is configured. */
  fallback: string[];
}

export const DEFAULT_EMAIL_ROUTING: EmailRoutingTable = {
  rules: [
    { mailbox: "support", destinations: ["support@rentmaikar.com"], enabled: true },
    { mailbox: "payments", destinations: ["admin@rentmaikar.com"], enabled: true },
    { mailbox: "documents", destinations: ["admin@rentmaikar.com"], enabled: true },
    { mailbox: "admin", destinations: ["admin@rentmaikar.com"], enabled: true },
    { mailbox: "legal", destinations: ["admin@rentmaikar.com"], enabled: true },
    { mailbox: "privacy", destinations: ["admin@rentmaikar.com"], enabled: true },
    { mailbox: "dpo", destinations: ["admin@rentmaikar.com"], enabled: true },
    { mailbox: "nigeria", destinations: ["support@rentmaikar.com"], enabled: true },
    { mailbox: "usa", destinations: ["support@rentmaikar.com"], enabled: true },
    { mailbox: "negotiations", destinations: ["admin@rentmaikar.com"], enabled: true },
    { mailbox: "noreply", destinations: ["noreply@rentmaikar.com"], enabled: false },
    { mailbox: "*", destinations: ["support@rentmaikar.com"], enabled: true },
  ],
  fallback: ["support@rentmaikar.com"],
};

const clean = (v: string) => (v || "").trim().toLowerCase();

export function normaliseRoutingTable(value: unknown): EmailRoutingTable {
  const raw = (value ?? {}) as Partial<EmailRoutingTable>;
  const rules = Array.isArray(raw.rules) ? raw.rules : DEFAULT_EMAIL_ROUTING.rules;
  return {
    rules: rules
      .filter((r) => r && typeof r.mailbox === "string")
      .map((r) => ({
        mailbox: clean(r.mailbox),
        destinations: (Array.isArray(r.destinations) ? r.destinations : [])
          .map(clean)
          .filter((d) => d.includes("@")),
        enabled: r.enabled !== false,
      })),
    fallback: (Array.isArray(raw.fallback) ? raw.fallback : DEFAULT_EMAIL_ROUTING.fallback)
      .map(clean)
      .filter((d) => d.includes("@")),
  };
}

export async function getEmailRoutingTable(supabase: Supa): Promise<EmailRoutingTable> {
  try {
    const { data } = await supabase
      .from("platform_kv_settings")
      .select("value")
      .eq("key", EMAIL_ROUTING_KEY)
      .maybeSingle();
    if (!data?.value) return DEFAULT_EMAIL_ROUTING;
    return normaliseRoutingTable(data.value);
  } catch (e) {
    console.error("[email-routing] failed to read routing table:", e);
    return DEFAULT_EMAIL_ROUTING;
  }
}

/** Resolve the external delivery addresses for an inbound mailbox. */
export function resolveDestinations(
  table: EmailRoutingTable,
  mailbox: string,
): { destinations: string[]; matched: string | null } {
  const key = clean(mailbox);
  const exact = table.rules.find((r) => r.mailbox === key);
  if (exact) {
    return exact.enabled && exact.destinations.length
      ? { destinations: exact.destinations, matched: exact.mailbox }
      : { destinations: [], matched: exact.mailbox };
  }
  const catchAll = table.rules.find((r) => r.mailbox === "*");
  if (catchAll?.enabled && catchAll.destinations.length) {
    return { destinations: catchAll.destinations, matched: "*" };
  }
  return { destinations: table.fallback, matched: table.fallback.length ? "fallback" : null };
}
