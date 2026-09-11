/**
 * Resolves an in-app notification into a deep link that opens the exact record
 * it refers to, so staff can act without hunting through tabs.
 *
 * Notification metadata is written by the `notify_record_event` DB trigger and
 * carries `{ table, record_id, category }`.
 */

export interface NotificationMetadata {
  table?: string;
  record_id?: string;
  category?: string;
  [key: string]: unknown;
}

/** Admin destinations per source table. */
const ADMIN_TARGETS: Record<string, { path: string; portal?: string; tab?: string }> = {
  applications: { path: '/admin', portal: 'crm', tab: 'applications' },
  invoices: { path: '/admin', portal: 'crm', tab: 'billing' },
  payments: { path: '/admin/payments' },
  rentals: { path: '/admin/rental-reconciliation' },
  user_subscriptions: { path: '/admin', portal: 'crm', tab: 'subscriptions' },
  subscriptions: { path: '/admin', portal: 'crm', tab: 'subscriptions' },
  legal_agreements: { path: '/admin', portal: 'crm', tab: 'legal-agreements' },
  rent_to_own_agreements: { path: '/admin', portal: 'crm', tab: 'rent-to-own' },
  price_negotiations: { path: '/admin', portal: 'crm', tab: 'negotiations' },
  vehicle_booking_requests: { path: '/admin', portal: 'crm', tab: 'approvals' },
  booking_requests: { path: '/admin', portal: 'crm', tab: 'approvals' },
  vehicles: { path: '/admin/vehicle-queue' },
  owner_payouts: { path: '/admin/treasury' },
  payouts: { path: '/admin/treasury' },
  withdrawal_authorizations: { path: '/admin/treasury' },
  withdrawals: { path: '/admin/treasury' },
  driver_call_ins: { path: '/admin', portal: 'operations', tab: 'call-ins' },
  call_ins: { path: '/admin', portal: 'operations', tab: 'call-ins' },
  incidents: { path: '/admin', portal: 'operations', tab: 'incidents' },
  support_tasks: { path: '/admin', portal: 'operations', tab: 'tasks' },
};

/** Where non-staff recipients (drivers / owners) should land. */
const SELF_TARGETS: Record<string, Record<'driver' | 'owner', string | undefined>> = {
  applications: { driver: '/driver/dashboard?tab=overview', owner: '/owner/dashboard?tab=overview' },
  invoices: { driver: '/driver/dashboard?tab=payments', owner: '/owner/dashboard?tab=earnings' },
  payments: { driver: '/driver/dashboard?tab=payments', owner: '/owner/dashboard?tab=earnings' },
  rentals: { driver: '/driver/dashboard?tab=overview', owner: '/owner/dashboard?tab=vehicles' },
  user_subscriptions: { driver: '/driver/dashboard?tab=subscriptions', owner: '/owner/dashboard?tab=settings' },
  subscriptions: { driver: '/driver/dashboard?tab=subscriptions', owner: '/owner/dashboard?tab=settings' },
  legal_agreements: { driver: '/driver/dashboard?tab=agreements', owner: '/owner/dashboard?tab=agreements' },
  rent_to_own_agreements: { driver: '/driver/dashboard?tab=lease-to-own', owner: '/owner/dashboard?tab=rent-to-own' },
  price_negotiations: { driver: '/driver/dashboard?tab=negotiate', owner: '/owner/dashboard?tab=pricing' },
  vehicle_booking_requests: { driver: '/driver/dashboard?tab=overview', owner: '/owner/dashboard?tab=vehicles' },
  booking_requests: { driver: '/driver/dashboard?tab=overview', owner: '/owner/dashboard?tab=vehicles' },
  vehicles: { driver: '/catalogue/budget', owner: '/owner/dashboard?tab=vehicles' },
  owner_payouts: { driver: '/driver/dashboard?tab=payments', owner: '/owner/dashboard?tab=earnings' },
  payouts: { driver: '/driver/dashboard?tab=payments', owner: '/owner/dashboard?tab=earnings' },
  withdrawal_authorizations: { driver: '/driver/dashboard?tab=payments', owner: '/owner/dashboard?tab=withdrawals' },
  withdrawals: { driver: '/driver/dashboard?tab=payments', owner: '/owner/dashboard?tab=withdrawals' },
  driver_call_ins: { driver: '/driver/dashboard?tab=call-history', owner: '/owner/dashboard?tab=call-history' },
  call_ins: { driver: '/driver/dashboard?tab=call-history', owner: '/owner/dashboard?tab=call-history' },
  incidents: { driver: '/driver/dashboard?tab=incidents', owner: '/owner/dashboard?tab=vehicles' },
};

const withParams = (path: string, params: Record<string, string | undefined>) => {
  const [base, existing] = path.split('?');
  const search = new URLSearchParams(existing ?? '');
  Object.entries(params).forEach(([k, v]) => {
    if (v) search.set(k, v);
  });
  const qs = search.toString();
  return qs ? `${base}?${qs}` : base;
};

/**
 * Strips production or current origin from an absolute deep link URL
 * so that SPA client-side routing stays within the active app instance.
 */
export function toRelativeDeepLink(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    if (trimmed.startsWith('https://rentmaikar.com') || trimmed.startsWith('http://rentmaikar.com')) {
      const parsed = new URL(trimmed);
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    if (typeof window !== 'undefined' && trimmed.startsWith(window.location.origin)) {
      const parsed = new URL(trimmed);
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    // Already relative or unparseable
  }

  return trimmed;
}

/**
 * Builds the deep link for a notification, or `null` when the recipient has no
 * screen that can show the referenced record.
 */
export function notificationDeepLink(
  metadata: unknown,
  kind: string,
  role: string | null | undefined,
): string | null {
  const meta = (metadata ?? {}) as NotificationMetadata;
  const rawTable = meta.table ?? kind.replace(/_(created|status)$/, '');
  const table = rawTable.toLowerCase().trim();
  const recordId = meta.record_id;

  const isStaff = role === 'admin' || role === 'admin_assistant' || role === 'superadmin' || role === 'legal_support';

  if (isStaff) {
    const target = ADMIN_TARGETS[table];
    if (!target) return null;
    return withParams(target.path, {
      portal: target.portal,
      tab: target.tab,
      record: recordId,
    });
  }

  if (role === 'driver' || role === 'owner') {
    const path = SELF_TARGETS[table]?.[role];
    if (!path) return null;
    return withParams(path, { record: recordId });
  }

  return null;
}
