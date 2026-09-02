import type { AppRole } from '@/lib/role-home';

/**
 * Single source of truth mapping a support_task_type to the app role a staff
 * member must hold. Previously duplicated in four places inside
 * SupportUserManagement.
 */
export const SUPPORT_TYPE_ROLE: Record<string, AppRole> = {
  legal: 'legal_support',
  iot_installation: 'iot_support',
  iot_maintenance: 'iot_support',
  vehicle_recall: 'vehicle_support',
  vehicle_maintenance: 'vehicle_support',
  insurance: 'insurance_support',
};

export function roleForSupportType(supportType: string): AppRole | undefined {
  return SUPPORT_TYPE_ROLE[supportType];
}
