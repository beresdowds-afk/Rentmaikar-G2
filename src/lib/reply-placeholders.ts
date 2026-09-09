export interface PlaceholderDefinition {
  token: string;
  label: string;
  sample: string;
}

export interface PlaceholderValues {
  recipient_name?: string;
  user_name?: string;
  driver_name?: string;
  owner_name?: string;
  vehicle_name?: string;
  vehicle_make?: string;
  vehicle_model?: string;
  company_name?: string;
  support_email?: string;
  support_phone?: string;
  [key: string]: string | undefined;
}

export const REPLY_PLACEHOLDERS: PlaceholderDefinition[] = [
  { token: 'recipient_name', label: 'Recipient Name', sample: 'Alex Johnson' },
  { token: 'user_name', label: 'User Name', sample: 'Alex Johnson' },
  { token: 'driver_name', label: 'Driver Name', sample: 'Michael' },
  { token: 'owner_name', label: 'Owner Name', sample: 'David' },
  { token: 'vehicle_name', label: 'Vehicle Name', sample: 'Toyota Camry' },
  { token: 'vehicle_make', label: 'Vehicle Make', sample: 'Toyota' },
  { token: 'vehicle_model', label: 'Vehicle Model', sample: 'Camry' },
  { token: 'company_name', label: 'Company Name', sample: 'RentMaikar' },
  { token: 'support_email', label: 'Support Email', sample: 'support@rentmaikar.com' },
  { token: 'support_phone', label: 'Support Phone', sample: '+1 (800) 555-0199' },
];

export const SAMPLE_PLACEHOLDER_VALUES: PlaceholderValues = {
  recipient_name: 'Alex Johnson',
  user_name: 'Alex Johnson',
  driver_name: 'Michael',
  owner_name: 'David',
  vehicle_name: 'Toyota Camry',
  vehicle_make: 'Toyota',
  vehicle_model: 'Camry',
  company_name: 'RentMaikar',
  support_email: 'support@rentmaikar.com',
  support_phone: '+1 (800) 555-0199',
};

export function usedPlaceholders(template: string): string[] {
  if (!template) return [];
  const matches = template.match(/\{\{([a-zA-Z0-9_-]+)\}\}/g);
  if (!matches) return [];
  return Array.from(new Set(matches.map((m) => m.slice(2, -2))));
}

export function missingPlaceholders(template: string, values: PlaceholderValues = {}): string[] {
  const used = usedPlaceholders(template);
  return used.filter((token) => values[token] === undefined || values[token] === null || values[token] === '');
}

export function unknownPlaceholders(template: string): string[] {
  const used = usedPlaceholders(template);
  const known = new Set(REPLY_PLACEHOLDERS.map((p) => p.token));
  return used.filter((token) => !known.has(token));
}

export function renderPlaceholders(template: string, values: PlaceholderValues = {}): string {
  if (!template) return '';
  return template.replace(/\{\{([a-zA-Z0-9_-]+)\}\}/g, (match, key) => {
    return values[key] !== undefined && values[key] !== null ? String(values[key]) : match;
  });
}
