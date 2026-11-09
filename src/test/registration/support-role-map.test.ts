import { describe, expect, it } from 'vitest';
import { roleForSupportType } from '@/lib/support-role-map';

describe('support responsibility roles', () => {
  it.each([
    ['legal', 'legal_support'],
    ['iot', 'iot_support'],
    ['iot_installation', 'iot_support'],
    ['iot_maintenance', 'iot_support'],
    ['vehicle', 'vehicle_support'],
    ['vehicle_recall', 'vehicle_support'],
    ['vehicle_maintenance', 'vehicle_support'],
    ['insurance', 'insurance_support'],
  ])('maps %s to %s', (type, role) => {
    expect(roleForSupportType(type)).toBe(role);
  });

  it('rejects unknown support types', () => {
    expect(roleForSupportType('unknown')).toBeNull();
  });
});
