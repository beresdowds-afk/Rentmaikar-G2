import type { AppRole } from '@/lib/role-home';

export function roleForSupportType(supportType: string): AppRole | null {
  switch (supportType) {
    case 'legal':
      return 'legal_support';
    case 'iot':
    case 'iot_installation':
    case 'iot_maintenance':
      return 'iot_support';
    case 'vehicle':
    case 'vehicle_recall':
    case 'vehicle_maintenance':
      return 'vehicle_support';
    case 'insurance':
      return 'insurance_support';
    default:
      return null;
  }
}
