// ════════════════════════════════════════════════════════════
// Inbound email routing table
//
// Every mailbox on the inbound domain (backend.rentmaikar.com) can be routed
// to one or more EXTERNAL delivery addresses.
//
// PLATFORM EMAIL ADDRESSES (public.platform_email_config) provides the
// canonical platform email distribution endpoints. Admins can further customize
// specific mailbox routing rules from Admin → Email Routing; custom rules
// are stored in `platform_kv_settings.email_routing_rules`.
// ════════════════════════════════════════════════════════════

// deno-lint-ignore no-explicit-any
type Supa = any;

export const EMAIL_ROUTING_KEY = "email_routing_rules";

/**
 * Baseline fallback delivery addresses. The live set is dynamically
 * sourced from `public.platform_email_config` (PLATFORM EMAIL ADDRESSES).
 */
export const DELIVERY_ADDRESSES = [
  "support@rentmaikar.com",
  "admin@rentmaikar.com",
  "payments@rentmaikar.com",
  "documents@rentmaikar.com",
  "legal@rentmaikar.com",
  "privacy@rentmaikar.com",
  "dpo@rentmaikar.com",
  "negotiations@rentmaikar.com",
  "notification@rentmaikar.com",
  "noreply@rentmaikar.com",
] as const;

export interface PlatformEmailEntry {
  id?: string;
  key: string;
  email: string;
  sender_name?: string | null;
  description?: string | null;
  is_active?: boolean;
}

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
    { mailbox: "payments", destinations: ["payments@rentmaikar.com"], enabled: true },
    { mailbox: "documents", destinations: ["documents@rentmaikar.com"], enabled: true },
    { mailbox: "admin", destinations: ["admin@rentmaikar.com"], enabled: true },
    { mailbox: "legal", destinations: ["legal@rentmaikar.com"], enabled: true },
    { mailbox: "privacy", destinations: ["privacy@rentmaikar.com"], enabled: true },
    { mailbox: "dpo", destinations: ["dpo@rentmaikar.com"], enabled: true },
    { mailbox: "negotiations", destinations: ["negotiations@rentmaikar.com"], enabled: true },
    { mailbox: "nigeria", destinations: ["support@rentmaikar.com"], enabled: true },
    { mailbox: "usa", destinations: ["support@rentmaikar.com"], enabled: true },
    { mailbox: "notification", destinations: ["notification@rentmaikar.com"], enabled: true },
    { mailbox: "noreply", destinations: ["noreply@rentmaikar.com"], enabled: false },
    { mailbox: "*", destinations: ["support@rentmaikar.com"], enabled: true },
  ],
  fallback: ["support@rentmaikar.com"],
};

const clean = (v: string) => (v || "").trim().toLowerCase();

/**
 * Fetch active platform email addresses from public.platform_email_config.
 */
export async function getPlatformEmailConfig(supabase: Supa): Promise<PlatformEmailEntry[]> {
  try {
    const { data, error } = await supabase
      .from("platform_email_config")
      .select("id, key, email, sender_name, description, is_active")
      .eq("is_active", true)
      .order("key");
    if (!error && Array.isArray(data) && data.length > 0) {
      return data as PlatformEmailEntry[];
    }
  } catch (e) {
    console.error("[email-routing] failed to read platform_email_config:", e);
  }
  return [];
}

/**
 * Build dynamic email distribution rules directly from the active
 * PLATFORM EMAIL ADDRESSES configuration.
 */
export function buildDefaultRoutingFromPlatformEmails(
  platformEmails: PlatformEmailEntry[],
): EmailRoutingTable {
  const supportEntry = platformEmails.find((e) => clean(e.key) === "support");
  const defaultDest = supportEntry?.email ? clean(supportEntry.email) : "support@rentmaikar.com";

  const rules: EmailRoutingRule[] = platformEmails.map((entry) => {
    const key = clean(entry.key);
    const email = clean(entry.email);
    return {
      mailbox: key,
      destinations: [email],
      enabled: key !== "noreply",
    };
  });

  // Ensure regional aliases exist if not explicitly added
  if (!rules.some((r) => r.mailbox === "usa")) {
    rules.push({ mailbox: "usa", destinations: [defaultDest], enabled: true });
  }
  if (!rules.some((r) => r.mailbox === "nigeria")) {
    rules.push({ mailbox: "nigeria", destinations: [defaultDest], enabled: true });
  }
  if (!rules.some((r) => r.mailbox === "*")) {
    rules.push({ mailbox: "*", destinations: [defaultDest], enabled: true });
  }

  return {
    rules,
    fallback: [defaultDest],
  };
}

export function normaliseRoutingTable(
  value: unknown,
  defaultTable: EmailRoutingTable = DEFAULT_EMAIL_ROUTING,
): EmailRoutingTable {
  const raw = (value ?? {}) as Partial<EmailRoutingTable>;
  const rules = Array.isArray(raw.rules) ? raw.rules : defaultTable.rules;
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
    fallback: (Array.isArray(raw.fallback) ? raw.fallback : defaultTable.fallback)
      .map(clean)
      .filter((d) => d.includes("@")),
  };
}

/**
 * Retrieve the active email routing table. Integrates PLATFORM EMAIL ADDRESSES
 * as the foundation for distribution, merged with any customized admin rules.
 */
export async function getEmailRoutingTable(supabase: Supa): Promise<EmailRoutingTable> {
  try {
    const [kvRes, platformEmails] = await Promise.all([
      supabase
        .from("platform_kv_settings")
        .select("value")
        .eq("key", EMAIL_ROUTING_KEY)
        .maybeSingle(),
      getPlatformEmailConfig(supabase),
    ]);

    const baseTable = platformEmails.length > 0
      ? buildDefaultRoutingFromPlatformEmails(platformEmails)
      : DEFAULT_EMAIL_ROUTING;

    if (!kvRes.data?.value) return baseTable;

    return normaliseRoutingTable(kvRes.data.value, baseTable);
  } catch (e) {
    console.error("[email-routing] failed to read routing table:", e);
    return DEFAULT_EMAIL_ROUTING;
  }
}

/**
 * Resolve external delivery addresses for an inbound mailbox.
 * Supports distribution lookup from active PLATFORM EMAIL ADDRESSES.
 */
export function resolveDestinations(
  table: EmailRoutingTable,
  mailbox: string,
  platformEmailMap?: Map<string, string> | Record<string, string>,
): { destinations: string[]; matched: string | null } {
  const key = clean(mailbox);
  const exact = table.rules.find((r) => r.mailbox === key);
  if (exact) {
    if (exact.enabled && exact.destinations.length > 0) {
      return { destinations: exact.destinations, matched: exact.mailbox };
    }
    // If enabled rule has empty destinations, attempt resolution from platform email distribution
    if (exact.enabled && platformEmailMap) {
      const email = typeof (platformEmailMap as Map<string, string>).get === "function"
        ? (platformEmailMap as Map<string, string>).get(key)
        : (platformEmailMap as Record<string, string>)[key];
      if (email) {
        return { destinations: [clean(email)], matched: `platform_email:${key}` };
      }
    }
    return { destinations: [], matched: exact.mailbox };
  }

  // If mailbox matches a configured platform email key directly
  if (platformEmailMap) {
    const email = typeof (platformEmailMap as Map<string, string>).get === "function"
      ? (platformEmailMap as Map<string, string>).get(key)
      : (platformEmailMap as Record<string, string>)[key];
    if (email) {
      return { destinations: [clean(email)], matched: `platform_email:${key}` };
    }
  }

  const catchAll = table.rules.find((r) => r.mailbox === "*");
  if (catchAll?.enabled && catchAll.destinations.length) {
    return { destinations: catchAll.destinations, matched: "*" };
  }
  return { destinations: table.fallback, matched: table.fallback.length ? "fallback" : null };
}
