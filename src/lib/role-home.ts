/**
 * Single source of truth for the "home" route each application role lands on.
 * Used by ProtectedRoute, Auth redirects, and dashboard gates so the map can
 * never drift between call sites.
 */
export type AppRole =
  | 'admin'
  | 'admin_assistant'
  | 'owner'
  | 'driver'
  | 'legal_support'
  | 'iot_support'
  | 'vehicle_support'
  | 'insurance_support';

export const ROLE_HOME: Record<AppRole, string> = {
  admin: '/admin',
  admin_assistant: '/admin-assistant',
  owner: '/owner/dashboard',
  driver: '/driver/dashboard',
  legal_support: '/support/legal',
  iot_support: '/support/iot',
  vehicle_support: '/support/vehicle',
  insurance_support: '/support/insurance',
};

/**
 * First-login destination for every role. Driver/owner have dedicated
 * onboarding flows; all other roles land on their dashboard home, which is an
 * acceptable "next step" target for gates.
 */
export const ROLE_ONBOARDING: Record<AppRole, string> = {
  driver: '/driver/onboarding',
  owner: '/owner/onboarding',
  admin: ROLE_HOME.admin,
  admin_assistant: ROLE_HOME.admin_assistant,
  legal_support: ROLE_HOME.legal_support,
  iot_support: ROLE_HOME.iot_support,
  vehicle_support: ROLE_HOME.vehicle_support,
  insurance_support: ROLE_HOME.insurance_support,
};

/** Onboarding entry point for a role, falling back to the driver flow. */
export function onboardingForRole(role: AppRole | null | undefined): string {
  if (!role) return '/driver/onboarding';
  return ROLE_ONBOARDING[role] ?? '/driver/onboarding';
}


export function homeForRole(role: AppRole | null | undefined, fallback = '/'): string {
  if (!role) return fallback;
  return ROLE_HOME[role] ?? fallback;
}

/**
 * Roles that operate the platform rather than transact on it. Staff accounts
 * must never be forced through the driver/owner profile-completion wizard —
 * their profile has no phone / emergency-contact requirements.
 */
export const STAFF_ROLES: AppRole[] = [
  'admin',
  'admin_assistant',
  'legal_support',
  'iot_support',
  'vehicle_support',
  'insurance_support',
];

export function isStaffRole(role: AppRole | null | undefined): boolean {
  return !!role && STAFF_ROLES.includes(role);
}
