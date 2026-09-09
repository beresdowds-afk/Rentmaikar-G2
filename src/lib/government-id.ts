/**
 * Government-ID-only identity verification policy.
 *
 * Persona verifies ONE thing on this platform: a valid government-issued photo
 * ID. No utility bills, no bank statements, no employment documents.
 *
 * Role rule:
 *   - Drivers MUST present a driver's licence (nothing else is accepted).
 *   - Every other role (owner, referee nominated by a driver, payment proxy,
 *     admin assistant, support staff) may present ANY valid government ID that
 *     is issued in their region.
 */

export type GovIdRole =
  | "driver"
  | "owner"
  | "referee"
  | "proxy"
  | "admin_assistant"
  | "support_staff";

export interface GovIdOption {
  /** Persona id-class code. */
  code: string;
  label: string;
}

/** Persona id-class codes we accept, per country. */
const REGION_GOV_IDS: Record<string, GovIdOption[]> = {
  US: [
    { code: "dl", label: "Driver's licence" },
    { code: "id", label: "State-issued ID card" },
    { code: "pp", label: "Passport" },
    { code: "pc", label: "Permanent resident card" },
    { code: "mid", label: "Military ID" },
  ],
  NG: [
    { code: "dl", label: "Driver's licence" },
    { code: "id", label: "National ID card (NIN slip)" },
    { code: "pp", label: "International passport" },
    { code: "vid", label: "Voter's card" },
  ],
};

const DEFAULT_GOV_IDS: GovIdOption[] = [
  { code: "dl", label: "Driver's licence" },
  { code: "id", label: "National ID card" },
  { code: "pp", label: "Passport" },
];

export function normalizeGovIdCountry(region?: string | null): string {
  const r = (region ?? "").toUpperCase().trim();
  if (r.startsWith("NG") || r === "NIGERIA") return "NG";
  if (r.startsWith("US") || r === "USA" || r === "UNITED STATES") return "US";
  return r || "US";
}

/** Drivers are licence-only; everyone else gets the full regional list. */
export function acceptedGovernmentIds(
  role: GovIdRole | string | null | undefined,
  region?: string | null,
): GovIdOption[] {
  if (role === "driver") return [{ code: "dl", label: "Driver's licence" }];
  const country = normalizeGovIdCountry(region);
  return REGION_GOV_IDS[country] ?? DEFAULT_GOV_IDS;
}

export function driversLicenceRequired(role: GovIdRole | string | null | undefined): boolean {
  return role === "driver";
}

/** Human-readable requirement copy shown above the verification button. */
export function governmentIdRequirementText(
  role: GovIdRole | string | null | undefined,
  region?: string | null,
): string {
  if (driversLicenceRequired(role)) {
    return "Drivers must verify with a valid driver's licence. No other document type is accepted.";
  }
  const list = acceptedGovernmentIds(role, region).map((o) => o.label);
  return `Present any valid government-issued photo ID: ${list.join(", ")}.`;
}

/** Persona attributes describing the accepted document set. */
export function governmentIdPersonaAttributes(
  role: GovIdRole | string | null | undefined,
  region?: string | null,
): { tags: string[]; fields: Record<string, string> } {
  const country = normalizeGovIdCountry(region);
  const options = acceptedGovernmentIds(role, country);
  const codes = options.map((o) => o.code);
  const requirement = driversLicenceRequired(role) ? "drivers_license" : "any_government_id";
  return {
    tags: [`verification:government_id`, `gov_id_requirement:${requirement}`],
    fields: {
      "verification-scope": "government_id",
      "government-id-requirement": requirement,
      "accepted-id-classes": codes.join(","),
      "selected-country-code": country,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Admin-configurable overrides (public.persona_id_class_rules)
 * ------------------------------------------------------------------ */

export interface IdClassRule {
  country_code: string;
  subject_role: string;
  accepted_classes: GovIdOption[];
  requires_drivers_license: boolean;
  is_active?: boolean;
  notes?: string | null;
}

export interface GovIdPolicy {
  options: GovIdOption[];
  requiresDriversLicence: boolean;
  source: "config" | "default";
  notes?: string | null;
}

/**
 * Resolve the effective ID policy for a role/region. Admin-managed rules win;
 * the compiled-in defaults are the fallback so verification never breaks when
 * no rule row exists.
 */
export function resolveGovIdPolicy(
  role: GovIdRole | string | null | undefined,
  region?: string | null,
  rules?: IdClassRule[] | null,
): GovIdPolicy {
  const country = normalizeGovIdCountry(region);
  const match = (rules ?? []).find(
    (r) =>
      r.is_active !== false &&
      r.subject_role === role &&
      normalizeGovIdCountry(r.country_code) === country,
  );
  if (match && Array.isArray(match.accepted_classes) && match.accepted_classes.length > 0) {
    return {
      options: match.accepted_classes,
      requiresDriversLicence: !!match.requires_drivers_license,
      source: "config",
      notes: match.notes ?? null,
    };
  }
  return {
    options: acceptedGovernmentIds(role, country),
    requiresDriversLicence: driversLicenceRequired(role),
    source: "default",
  };
}
