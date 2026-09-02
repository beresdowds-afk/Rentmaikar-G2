/**
 * Single source of truth for the admin dashboard tab universe.
 *
 * Both the Admin dashboard and the Admin Assistant dashboard derive their
 * visible tab set from here so the two can never drift: every tab shipped in
 * `PortalNavigation` must either be mapped to an assistant permission in
 * `TAB_PERMISSION_MAP` or be explicitly declared admin-only below.
 */
import {
  crmTabs,
  erpTabs,
  supportTabs,
  marketingTabs,
  docsTabs,
  type PortalTab,
  type PortalType,
} from '@/components/admin/PortalNavigation';
import { TAB_PERMISSION_MAP } from '@/lib/admin-tab-permissions';

export const PORTAL_TABS: Record<PortalType, PortalTab[]> = {
  crm: crmTabs,
  erp: erpTabs,
  support: supportTabs,
  marketing: marketingTabs,
  docs: docsTabs,
};

/** Every tab value rendered anywhere in the admin portal navigation. */
export const ALL_ADMIN_TABS: string[] = Object.values(PORTAL_TABS).flatMap((tabs) =>
  tabs.map((t) => t.value),
);

/**
 * Tabs that are intentionally admin-only — assistants may never see them,
 * regardless of granted permissions. Keeping this explicit (rather than
 * "anything missing from the permission map") is what makes drift detectable.
 */
export const ADMIN_ONLY_TABS: string[] = [
  // ERP infrastructure
  'hardware',
  'mqtt-credentials',
  'fees',
  'provider-billing',
  'secrets',
  'api-keys',
  'webhooks',
  'api-endpoints',
  'security',
  'settings',
  'region-autobuild',
  'category-year-specs',
  // Support portal
  'task-portal',
  // CRM
  'admin-assistants',
];

/**
 * Tabs an assistant can never access: the explicit admin-only list plus any
 * tab that has no entry in `TAB_PERMISSION_MAP` (fail-closed).
 */
export function assistantExcludedTabs(): string[] {
  const unmapped = ALL_ADMIN_TABS.filter((t) => TAB_PERMISSION_MAP[t] === undefined);
  return Array.from(new Set([...ADMIN_ONLY_TABS, ...unmapped]));
}

export interface TabPermissionDrift {
  /** Rendered tabs that are neither mapped nor declared admin-only. */
  unclassified: string[];
  /** Permission-map entries with no matching rendered tab. */
  orphanedMappings: string[];
}

/** Computes drift between the rendered tab universe and the permission map. */
export function computeTabPermissionDrift(): TabPermissionDrift {
  const all = new Set(ALL_ADMIN_TABS);
  const adminOnly = new Set(ADMIN_ONLY_TABS);
  return {
    unclassified: ALL_ADMIN_TABS.filter(
      (t) => TAB_PERMISSION_MAP[t] === undefined && !adminOnly.has(t),
    ),
    orphanedMappings: Object.keys(TAB_PERMISSION_MAP).filter((t) => !all.has(t)),
  };
}

let warned = false;

/**
 * Dev-only warning shared by the Admin and Admin Assistant dashboards so both
 * surfaces report the exact same drift once per session.
 */
export function warnTabPermissionDrift(source: 'admin' | 'admin-assistant'): void {
  if (!import.meta.env.DEV || warned) return;
  const { unclassified, orphanedMappings } = computeTabPermissionDrift();
  if (!unclassified.length && !orphanedMappings.length) return;
  warned = true;
  // eslint-disable-next-line no-console
  console.warn(
    `[${source}] admin tab / permission drift detected — update src/lib/admin-tab-permissions.ts or ADMIN_ONLY_TABS.`,
    { unclassified, orphanedMappings },
  );
}

/** Test helper: allows repeated drift warnings across test cases. */
export function __resetTabDriftWarning() {
  warned = false;
}
