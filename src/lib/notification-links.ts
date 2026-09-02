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
  legal_agreements: { path: '/admin', portal: 'crm', tab: 'legal-agreements' },
  rent_to_own_agreements: { path: '/admin', portal: 'crm', tab: 'rent-to-own' },
  price_negotiations: { path: '/admin', portal: 'crm', tab: 'negotiations' },
  vehicle_booking_requests: { path: '/admin', portal: 'crm', tab: 'approvals' },
  vehicles: { path: '/admin/vehicle-queue' },
  owner_payouts: { path: '/admin/treasury' },
  withdrawal_authorizations: { path: '/admin/treasury' },
};

/** Where non-staff recipients (drivers / owners) should land. */
const SELF_TARGETS: Record<string, Record<'driver' | 'owner', string | undefined>> = {
  applications: { driver: '/driver-dashboard', owner: '/owner-dashboard' },
  invoices: { driver: '/driver-dashboard?tab=billing', owner: '/owner-dashboard?tab=earnings' },
  payments: { driver: '/driver-dashboard?tab=billing', owner: '/owner-dashboard?tab=earnings' },
  rentals: { driver: '/driver-dashboard?tab=rentals', owner: '/owner-dashboard?tab=vehicles' },
  user_subscriptions: { driver: '/subscriptions', owner: '/subscriptions' },
  legal_agreements: { driver: '/driver-dashboard?tab=agreements', owner: '/owner-dashboard?tab=agreements' },
  rent_to_own_agreements: { driver: '/driver-dashboard?tab=rentals', owner: '/owner-dashboard?tab=vehicles' },
  price_negotiations: { driver: '/driver-dashboard?tab=negotiations', owner: '/owner-dashboard?tab=negotiations' },
  vehicle_booking_requests: { driver: '/driver-dashboard?tab=bookings', owner: '/owner-dashboard?tab=bookings' },
  vehicles: { driver: undefined, owner: '/owner-dashboard?tab=vehicles' },
  owner_payouts: { driver: undefined, owner: '/owner-dashboard?tab=earnings' },
  withdrawal_authorizations: { driver: undefined, owner: '/owner-dashboard?tab=earnings' },
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
 * Builds the deep link for a notification, or `null` when the recipient has no
 * screen that can show the referenced record.
 */
export function notificationDeepLink(
  metadata: unknown,
  kind: string,
  role: string | null | undefined,
): string | null {
  const meta = (metadata ?? {}) as NotificationMetadata;
  const table = meta.table ?? kind.replace(/_(created|status)$/, '');
  const recordId = meta.record_id;

  const isStaff = role === 'admin' || role === 'admin_assistant';

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
