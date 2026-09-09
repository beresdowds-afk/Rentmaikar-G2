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
  'owner-fleet': {
    key: 'fleet',
    role: 'owner',
    tab: 'fleet',
    require: 'approved',
    title: 'Owner Fleet',
  },
  'owner-payouts': {
    key: 'payouts',
    role: 'owner',
    tab: 'payouts',
    require: 'approved',
    title: 'Owner Payouts',
  },
};

export function getPortal(role: 'driver' | 'owner', portalKey: string): PortalDefinition | null {
  const direct = PORTALS[`${role}-${portalKey}`];
  if (direct) return direct;

  return {
    key: portalKey,
    role,
    tab: portalKey,
    require: 'approved',
    title: portalKey.charAt(0).toUpperCase() + portalKey.slice(1),
  };
}
