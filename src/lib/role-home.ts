export type AppRole =
  | 'admin'
  | 'admin_assistant'
  | 'owner'
  | 'driver'
  | 'legal_support'
  | 'iot_support'
  | 'vehicle_support'
  | 'insurance_support'
  | 'customer';

export const ROLE_HOME: Record<string, string> = {
  admin: '/admin',
  admin_assistant: '/admin',
  legal_support: '/portal/legal',
  iot_support: '/portal/iot',
  vehicle_support: '/portal/vehicle',
  insurance_support: '/admin',
  owner: '/owner-dashboard',
  driver: '/driver-dashboard',
  customer: '/',
};

export const ROLE_ONBOARDING: Record<string, string> = {
  driver: '/driver-onboarding',
  owner: '/owner-onboarding',
  admin: '/admin',
  admin_assistant: '/admin',
};

export function isStaffRole(role?: AppRole | string | null): boolean {
  if (!role) return false;
  return [
    'admin',
    'admin_assistant',
    'legal_support',
    'iot_support',
    'vehicle_support',
    'insurance_support',
  ].includes(role);
}

export function homeForRole(role?: AppRole | string | null, fallback = '/'): string {
  if (!role) return fallback;
  return ROLE_HOME[role] || fallback;
}

export function onboardingForRole(role?: AppRole | string | null): string {
  if (!role) return '/';
  return ROLE_ONBOARDING[role] || homeForRole(role);
}
