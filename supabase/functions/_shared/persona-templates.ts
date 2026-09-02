// Per-role Persona inquiry template IDs. Applied to every region.
// Each user role maps to a dedicated inquiry template that Persona uses to
// branch the correct workflow (Driver, Owner, Referee, Proxy, Admin Assistant,
// Support Staff).
//
// Priority when resolving a template:
//   1. subject_role -> universal template ID (below)
//   2. persona_region_templates row (DB override, keyed by country_code)
//   3. PERSONA_TEMPLATE_ID_(NG|US) env override
//   4. PERSONA_TEMPLATE_ID / PERSONA_MASTER_TEMPLATE_ID env fallback

export type PersonaSubjectRole =
  | "driver"
  | "referee"
  | "owner"
  | "support_staff"
  | "admin_assistant"
  | "proxy";

export const PERSONA_TEMPLATE_IDS: Record<PersonaSubjectRole, string> = {
  driver: "itmpl_As49Kz1t61PoxLPDXCPBzcbHXZhrzW",
  referee: "itmpl_As49Kz1ryTH3yu3AVUJiwa2CuSgscY",
  owner: "itmpl_As49Kz1CuM9iVGdfhwWvR8AZe7ShLA",
  // Support Staff shares the Driver payment proxy template.
  support_staff: "itmpl_As49Kz1dvgymYmjWVUYM27nivb2bco",
  // Admin Assistant shares the Driver referee template.
  admin_assistant: "itmpl_As49Kz1ryTH3yu3AVUJiwa2CuSgscY",
  proxy: "itmpl_As49Kz1dvgymYmjWVUYM27nivb2bco",
};

export function templateForRole(role: PersonaSubjectRole | string | null | undefined): string | null {
  if (!role) return null;
  return (PERSONA_TEMPLATE_IDS as Record<string, string>)[role] ?? null;
}

/**
 * DB-first resolver. Reads `persona_template_config` (per-role overrides
 * managed from the admin UI) and falls back to the compiled-in defaults.
 * Returns both the resolved template id and, if set on the row, an
 * environment id override.
 */
export async function resolveTemplateForRoleWithDb(
  supa: { from: (t: string) => any },
  role: PersonaSubjectRole | string | null | undefined,
): Promise<{ template_id: string | null; environment_id: string | null }> {
  const canonical = canonicalizeUserRole(role as string | null | undefined);
  if (!canonical) return { template_id: null, environment_id: null };
  try {
    const { data } = await supa
      .from("persona_template_config")
      .select("template_id, environment_id")
      .eq("subject_role", canonical)
      .maybeSingle();
    if (data?.template_id) {
      return { template_id: data.template_id, environment_id: data.environment_id ?? null };
    }
  } catch (_e) { /* fall through to default */ }
  return { template_id: templateForRole(canonical), environment_id: null };
}


// Canonical Persona-facing `user_role` tag. Persona routes each inquiry to the
// correct workflow branch (driver KYC, owner KYC, referee attest, payment-proxy
// consent, admin-assistant vetting) based on this tag/field. Keep these strings
// stable — Persona workflow rules are wired to them.
export const PERSONA_USER_ROLE_TAGS: Record<PersonaSubjectRole, string> = {
  driver: "driver",
  owner: "owner",
  referee: "driver_referee",
  proxy: "driver_payment_proxy",
  admin_assistant: "admin_assistant",
  support_staff: "support_staff",
};

export function userRoleTagForRole(
  role: PersonaSubjectRole | string | null | undefined,
): string | null {
  if (!role) return null;
  return (PERSONA_USER_ROLE_TAGS as Record<string, string>)[role] ?? null;
}

/**
 * Attributes to merge into the Persona `data.attributes` payload so Persona's
 * workflow engine can branch on the subject's role.
 */
export function personaRoleAttributes(
  role: PersonaSubjectRole | string | null | undefined,
): { tags: string[]; fields: Record<string, string> } {
  const tag = userRoleTagForRole(role);
  if (!tag) return { tags: [], fields: {} };
  return { tags: [`user_role:${tag}`, tag], fields: { "user-role": tag } };
}

// -----------------------------------------------------------------------------
// Server-side normalization + reference-id parsing
// -----------------------------------------------------------------------------

const ROLE_ALIASES: Record<string, PersonaSubjectRole> = {
  driver: "driver",
  drivers: "driver",
  owner: "owner",
  owners: "owner",
  referee: "referee",
  driver_referee: "referee",
  "driver-referee": "referee",
  proxy: "proxy",
  driver_payment_proxy: "proxy",
  "driver-payment-proxy": "proxy",
  payment_proxy: "proxy",
  admin_assistant: "admin_assistant",
  "admin-assistant": "admin_assistant",
  assistant: "admin_assistant",
  support_staff: "support_staff",
  "support-staff": "support_staff",
  support: "support_staff",
};

/** Normalize any incoming role value to a canonical PersonaSubjectRole. */
export function canonicalizeUserRole(
  raw: string | null | undefined,
): PersonaSubjectRole | null {
  if (!raw) return null;
  const key = String(raw).trim().toLowerCase().replace(/\s+/g, "_");
  return ROLE_ALIASES[key] ?? null;
}

/**
 * Parse a Persona `reference-id` of the shape `<role>:<subject_ref>` or
 * `admin-reverify:<role>:<subject_ref>` and return the canonical role.
 */
export function parseReferenceIdRole(
  referenceId: string | null | undefined,
): { role: PersonaSubjectRole | null; prefix: string | null; rest: string | null } {
  if (!referenceId) return { role: null, prefix: null, rest: null };
  const parts = String(referenceId).split(":");
  if (parts.length < 2) return { role: null, prefix: null, rest: null };
  const start = parts[0] === "admin-reverify" ? 1 : 0;
  const prefix = parts[start] ?? null;
  const rest = parts.slice(start + 1).join(":") || null;
  return { role: canonicalizeUserRole(prefix), prefix, rest };
}

/**
 * Build a validated reference-id. Throws if the role cannot be canonicalized —
 * callers should catch and return 400 so we never send unexpected values.
 */
export function buildReferenceId(
  role: PersonaSubjectRole | string | null | undefined,
  subjectRef: string,
  opts: { adminReverify?: boolean } = {},
): string {
  const canonical = canonicalizeUserRole(role as string | null | undefined);
  if (!canonical) {
    throw new Error(`persona: unrecognized user_role "${role ?? ""}"`);
  }
  const tag = PERSONA_USER_ROLE_TAGS[canonical];
  const prefix = opts.adminReverify ? `admin-reverify:${tag}` : tag;
  return `${prefix}:${subjectRef}`;
}
