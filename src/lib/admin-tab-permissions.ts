// Maps admin dashboard tab keys to the admin_assistant_permissions column
// that authorizes them. Tabs absent from this map are considered
// admin-only (full admin required).

import type { PermissionKey } from '@/components/admin/AdminAssistantManagement';

export type AdminTabKey = string;

/**
 * Required permission per tab. `null` means the tab is always allowed for
 * any assistant. Missing key = admin-only (assistants can never see it).
 */
export const TAB_PERMISSION_MAP: Record<AdminTabKey, PermissionKey | null> = {
  // CRM
  applications: 'can_view_users',
  accounts: 'can_view_users',
  'drivers-owners': 'can_manage_users',
  roles: 'can_manage_users',
  'user-deletion': 'can_delete_users',
  negotiations: 'can_view_rentals',
  approvals: 'can_view_users',
  defaults: 'can_view_payments',
  'legal-agreements': 'can_view_rentals',
  'rent-to-own': 'can_view_rentals',
  content: 'can_manage_content',
  subscriptions: 'can_view_payments',
  training: 'can_manage_content',
  'roadside-partners': 'can_view_support_tasks',
  billing: 'can_view_payments',
  'proxy-billing': 'can_view_payments',

  // ERP (most infra tabs stay admin-only – omit them here)
  tracking: 'can_view_iot',
  assets: 'can_view_vehicles',
  authorizations: 'can_view_vehicles',
  catalogue: 'can_view_vehicles',
  'pickup-locations': 'can_view_vehicles',
  'iot-monitoring': 'can_view_iot',
  'iot-provisioning': 'can_view_iot',
  hologram: 'can_view_iot',
  traccar: 'can_view_iot',
  'sync-schedule': 'can_manage_iot',
  reconciliation: 'can_view_payments',
  'driver-behavior': 'can_view_iot',
  'device-orders': 'can_view_iot',
  'device-revenue': 'can_view_reports',
  pricing: 'can_view_reports',
  incidents: 'can_view_support_tasks',
  recalls: 'can_view_support_tasks',
  'daily-plans': 'can_view_support_tasks',
  'weekly-reports': 'can_view_reports',
  tax: 'can_view_reports',
  'cron-jobs': 'can_view_reports',
  'uuid-assignments': 'can_view_users',

  // Support
  contacts: 'can_view_communications',
  insurance: 'can_view_support_tasks',
  'nigeria-verification': 'can_manage_users',
  'police-reports': 'can_manage_users',
  'payment-accounts': 'can_view_payments',
  'expiry-notifications': 'can_view_support_tasks',

  // Marketing – requires reports
  campaigns: 'can_view_reports',
  facebook: 'can_view_reports',
  instagram: 'can_view_reports',
  linkedin: 'can_view_reports',
  google: 'can_view_reports',

  // Docs – reference material, always available to assistants and support staff.
  glossary: null,
  'messaging-docs': null,
  'email-docs': null,
  'voip-docs': null,
};

/**
 * Quick-access surfaces that are not part of `PortalNavigation` but are still
 * reachable from the admin dashboards (shortcut buttons). Kept separate from
 * `TAB_PERMISSION_MAP` so the nav-drift checks stay accurate.
 */
export const QUICK_ACCESS_PERMISSION_MAP: Record<AdminTabKey, PermissionKey | null> = {
  inbox: 'can_view_communications',
};

function requiredPermissionForTab(tab: string): PermissionKey | null | undefined {
  if (tab in TAB_PERMISSION_MAP) return TAB_PERMISSION_MAP[tab];
  return QUICK_ACCESS_PERMISSION_MAP[tab];
}

/** Compute the list of tabs an assistant is NOT allowed to see. */
export function forbiddenTabsForAssistant(
  perms: Partial<Record<PermissionKey, boolean>> | null,
): string[] {
  const forbidden: string[] = [];
  for (const [tab, required] of [
    ...Object.entries(TAB_PERMISSION_MAP),
    ...Object.entries(QUICK_ACCESS_PERMISSION_MAP),
  ]) {
    if (required === null) continue;
    if (!perms?.[required]) forbidden.push(tab);
  }
  return forbidden;
}

/** Whether the current assistant permissions authorize a particular tab. */
export function assistantCanAccessTab(
  tab: string,
  perms: Partial<Record<PermissionKey, boolean>> | null,
): boolean {
  const required = requiredPermissionForTab(tab);
  if (required === undefined) return false; // admin-only tab
  if (required === null) return true;
  return !!perms?.[required];
}

