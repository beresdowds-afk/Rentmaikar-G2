export function roleForSupportType(supportType: string): string {
  switch (supportType) {
    case 'legal':
      return 'legal_support';
    case 'iot':
      return 'iot_support';
    case 'vehicle':
      return 'vehicle_support';
    case 'insurance':
      return 'insurance_support';
    default:
      return `${supportType}_support`;
  }
}
