export interface PortalDefinition {
  key: string;
  role: 'driver' | 'owner';
  tab: string;
  require: 'authenticated' | 'email_verified' | 'documents' | 'verification' | 'approved';
  title?: string;
  description?: string;
}

export const PORTALS: Record<string, PortalDefinition> = {
  'driver-earnings': {
    key: 'earnings',
    role: 'driver',
    tab: 'earnings',
    require: 'approved',
    title: 'Driver Earnings',
  },
  'driver-vehicles': {
    key: 'vehicles',
    role: 'driver',
    tab: 'vehicles',
    require: 'approved',
    title: 'Available Vehicles',
  },
  'driver-payments': {
    key: 'payments',
    role: 'driver',
    tab: 'payments',
    require: 'approved',
    title: 'Driver Payments',
  },
  'driver-training': {
    key: 'training',
    role: 'driver',
    tab: 'training',
    require: 'authenticated',
    title: 'Driver Training',
  },
  'owner-fleet': {
    key: 'fleet',
    role: 'owner',
    tab: 'fleet',
    require: 'approved',
    title: 'Owner Fleet',
  },
  'owner-vehicles': {
    key: 'vehicles',
    role: 'owner',
    tab: 'vehicles',
    require: 'approved',
    title: 'Owner Vehicles',
  },
  'owner-payouts': {
    key: 'payouts',
    role: 'owner',
    tab: 'payouts',
    require: 'approved',
    title: 'Owner Payouts',
  },
  'owner-insurance': {
    key: 'insurance',
    role: 'owner',
    tab: 'insurance',
    require: 'authenticated',
    title: 'Owner Insurance',
  },
};

export function getPortal(role: 'driver' | 'owner', portalKey: string): PortalDefinition | null {
  const direct = PORTALS[`${role}-${portalKey}`];
  if (direct) return direct;
  return null;
}
