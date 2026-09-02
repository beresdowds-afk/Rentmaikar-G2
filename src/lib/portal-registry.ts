import type { Requirement } from '@/components/onboarding/PortalGate';

export interface PortalDef {
  title: string;
  require: Requirement;
  /** The dashboard tab value to activate on the corresponding dashboard. */
  tab: string;
}

// Progressive unlocking: each portal activates as soon as its stage is reached,
// starting from "create your account" (authenticated).
export const DRIVER_PORTALS: Record<string, PortalDef> = {
  subscriptions: { title: 'Subscriptions', require: 'authenticated', tab: 'subscriptions' },
  training: { title: 'Driver Training', require: 'authenticated', tab: 'training' },
  agreements: { title: 'Legal Agreements', require: 'email_verified', tab: 'agreements' },
  rideshare: { title: 'Rideshare Profile', require: 'documents', tab: 'rideshare' },
  incidents: { title: 'Report Incident', require: 'documents', tab: 'incidents' },
  inspection: { title: 'Weekly Inspection', require: 'verification', tab: 'inspection' },
  negotiate: { title: 'Price Negotiation', require: 'verification', tab: 'negotiate' },
  payments: { title: 'Payments', require: 'approved', tab: 'payments' },
  'lease-to-own': { title: 'Lease to Own', require: 'approved', tab: 'lease-to-own' },
  browse: { title: 'Browse Vehicles', require: 'approved', tab: 'browse' },
};

export const OWNER_PORTALS: Record<string, PortalDef> = {
  subscriptions: { title: 'Subscriptions', require: 'authenticated', tab: 'insurance' },
  insurance: { title: 'Insurance & Roadside', require: 'authenticated', tab: 'insurance' },
  agreements: { title: 'Legal Agreements', require: 'email_verified', tab: 'agreements' },
  pickup: { title: 'Pickup Locations', require: 'documents', tab: 'pickup-locations' },
  vehicles: { title: 'My Vehicles', require: 'documents', tab: 'vehicles' },
  iot: { title: 'IoT Devices', require: 'verification', tab: 'iot-device' },
  inspections: { title: 'Weekly Inspections', require: 'verification', tab: 'inspections' },
  pricing: { title: 'Pricing', require: 'verification', tab: 'pricing' },
  recalls: { title: 'Vehicle Recalls', require: 'approved', tab: 'recalls' },
  'rent-to-own': { title: 'Rent to Own', require: 'approved', tab: 'rent-to-own' },
  earnings: { title: 'Earnings', require: 'approved', tab: 'earnings' },
  withdrawals: { title: 'Withdrawals', require: 'approved', tab: 'withdrawals' },
  payments: { title: 'Payments', require: 'approved', tab: 'payments' },
};

export function getPortal(role: 'driver' | 'owner', key: string): PortalDef | null {
  const registry = role === 'driver' ? DRIVER_PORTALS : OWNER_PORTALS;
  return registry[key] ?? null;
}
