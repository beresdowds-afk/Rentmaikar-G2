export type PlaceholderCategory = 'vehicle' | 'billing' | 'recipient' | 'links' | 'company';

export interface PlaceholderDefinition {
  token: string;
  bracketToken: string;
  label: string;
  sample: string;
  category: PlaceholderCategory;
  description?: string;
}

export interface PlaceholderValues {
  recipient_name?: string;
  user_name?: string;
  first_name?: string;
  driver_name?: string;
  owner_name?: string;
  individual_portal_link?: string;
  portal_link?: string;
  vehicle_name?: string;
  vehicle_make?: string;
  vehicle_model?: string;
  vehicle_year?: string | number;
  license_plate?: string;
  vehicle_plate?: string;
  pickup_location?: string;
  due_date?: string;
  amount_due?: string;
  amount?: string;
  currency?: string;
  company_name?: string;
  support_email?: string;
  support_phone?: string;
  [key: string]: string | number | undefined;
}

export const REPLY_PLACEHOLDERS: PlaceholderDefinition[] = [
  // Vehicle Details
  {
    token: 'vehicle_make',
    bracketToken: '[VEHICLE_MAKE]',
    label: 'Vehicle Make',
    sample: 'Toyota',
    category: 'vehicle',
    description: 'Manufacturer / Make of the vehicle (e.g. Toyota, Honda, Hyundai)',
  },
  {
    token: 'vehicle_model',
    bracketToken: '[VEHICLE_MODEL]',
    label: 'Vehicle Model',
    sample: 'Camry',
    category: 'vehicle',
    description: 'Model line of the vehicle (e.g. Camry, Accord, Elantra)',
  },
  {
    token: 'due_date',
    bracketToken: '[DUE_DATE]',
    label: 'Due Date',
    sample: 'Oct 24, 2026',
    category: 'billing',
    description: 'Upcoming payment, inspection, or submission deadline',
  },
  {
    token: 'vehicle_year',
    bracketToken: '[VEHICLE_YEAR]',
    label: 'Vehicle Year',
    sample: '2024',
    category: 'vehicle',
    description: 'Model production year',
  },
  {
    token: 'license_plate',
    bracketToken: '[LICENSE_PLATE]',
    label: 'License Plate',
    sample: 'RM-8820',
    category: 'vehicle',
    description: 'Vehicle license plate / registration identifier',
  },
  {
    token: 'pickup_location',
    bracketToken: '[PICKUP_LOCATION]',
    label: 'Pickup Location',
    sample: 'Rentmaikar Fleet Hub - 100 Main St',
    category: 'vehicle',
    description: 'Assigned physical pickup depot or city address',
  },
  {
    token: 'vehicle_name',
    bracketToken: '[VEHICLE_NAME]',
    label: 'Vehicle Name (Full)',
    sample: 'Toyota Camry',
    category: 'vehicle',
    description: 'Combined vehicle make and model designation',
  },
  // Recipient / Contact
  {
    token: 'owner_name',
    bracketToken: '[OWNER_NAME]',
    label: 'Owner Name',
    sample: 'David Adeleke',
    category: 'recipient',
    description: 'Full name of the fleet owner',
  },
  {
    token: 'driver_name',
    bracketToken: '[DRIVER_NAME]',
    label: 'Driver Name',
    sample: 'Michael Scott',
    category: 'recipient',
    description: 'Full name of the active or prospective driver',
  },
  {
    token: 'first_name',
    bracketToken: '[FIRST_NAME]',
    label: 'First Name',
    sample: 'David',
    category: 'recipient',
    description: 'Given first name of the recipient',
  },
  {
    token: 'recipient_name',
    bracketToken: '[RECIPIENT_NAME]',
    label: 'Recipient Name',
    sample: 'Alex Johnson',
    category: 'recipient',
    description: 'Full recipient name across customer and driver accounts',
  },
  // Billing & Payments
  {
    token: 'amount_due',
    bracketToken: '[AMOUNT_DUE]',
    label: 'Amount Due',
    sample: '$350.00',
    category: 'billing',
    description: 'Current outstanding fee or pending payment charge',
  },
  // Links & Portal Access
  {
    token: 'individual_portal_link',
    bracketToken: '[INDIVIDUAL_PORTAL_LINK]',
    label: 'Individual Portal Link',
    sample: 'https://rentmaikar.com/owner/portal-access?token=otk_sample123',
    category: 'links',
    description: 'Single-use authenticated access link for owner dashboard',
  },
  {
    token: 'portal_link',
    bracketToken: '[PORTAL_LINK]',
    label: 'Portal Link',
    sample: 'https://rentmaikar.com/portal',
    category: 'links',
    description: 'Standard dashboard or account link',
  },
  // Company & Support
  {
    token: 'company_name',
    bracketToken: '[COMPANY_NAME]',
    label: 'Company Name',
    sample: 'Rentmaikar',
    category: 'company',
    description: 'Platform name brand identifier',
  },
  {
    token: 'support_email',
    bracketToken: '[SUPPORT_EMAIL]',
    label: 'Support Email',
    sample: 'support@rentmaikar.com',
    category: 'company',
    description: 'Customer service email contact',
  },
  {
    token: 'support_phone',
    bracketToken: '[SUPPORT_PHONE]',
    label: 'Support Phone',
    sample: '+1 (608) 384-3932',
    category: 'company',
    description: 'Customer helpline telephone number',
  },
];

export const SAMPLE_PLACEHOLDER_VALUES: PlaceholderValues = {
  recipient_name: 'Alex Johnson',
  user_name: 'Alex Johnson',
  first_name: 'David',
  driver_name: 'Michael Scott',
  owner_name: 'David Adeleke',
  individual_portal_link: 'https://rentmaikar.com/owner/portal-access?token=otk_sample123',
  portal_link: 'https://rentmaikar.com/owner/portal-access?token=otk_sample123',
  vehicle_name: 'Toyota Camry Hybrid (2024)',
  vehicle_make: 'Toyota',
  vehicle_model: 'Camry',
  vehicle_year: '2024',
  license_plate: 'RM-8820',
  vehicle_plate: 'RM-8820',
  pickup_location: 'Rentmaikar Fleet Hub - 100 Main St',
  due_date: 'October 24, 2026',
  amount_due: '$350.00',
  amount: '$350.00',
  currency: 'USD',
  company_name: 'Rentmaikar',
  support_email: 'support@rentmaikar.com',
  support_phone: '+1 (608) 384-3932',
};

export function usedPlaceholders(template: string): string[] {
  if (!template) return [];
  const curly = template.match(/\{\{([a-zA-Z0-9_-]+)\}\}/g) || [];
  const bracket = template.match(/\[([A-Z0-9_\s-]+)\]/gi) || [];
  const allTokens = [
    ...curly.map((m) => m.slice(2, -2).trim()),
    ...bracket.map((m) => m.slice(1, -1).trim()),
  ];
  return Array.from(new Set(allTokens));
}

export function missingPlaceholders(template: string, values: PlaceholderValues = {}): string[] {
  const used = usedPlaceholders(template);
  return used.filter((token) => {
    const key = token.toLowerCase().replace(/[\s-]+/g, '_');
    const val = values[key] ?? values[token];
    return val === undefined || val === null || val === '';
  });
}

export function unknownPlaceholders(template: string): string[] {
  const used = usedPlaceholders(template);
  const known = new Set([
    ...REPLY_PLACEHOLDERS.map((p) => p.token),
    ...REPLY_PLACEHOLDERS.map((p) => p.bracketToken.slice(1, -1)),
    'owner_name',
    'OWNER NAME',
    'OWNER_NAME',
    'individual_portal_link',
    'INDIVIDUAL PORTAL LINK',
    'INDIVIDUAL_PORTAL_LINK',
    'portal_link',
    'PORTAL LINK',
    'PORTAL_LINK',
    'first_name',
    'FIRST NAME',
    'FIRST_NAME',
    'vehicle_make',
    'VEHICLE_MAKE',
    'VEHICLE MAKE',
    'vehicle_model',
    'VEHICLE_MODEL',
    'VEHICLE MODEL',
    'due_date',
    'DUE_DATE',
    'DUE DATE',
    'vehicle_year',
    'VEHICLE_YEAR',
    'VEHICLE YEAR',
    'license_plate',
    'LICENSE_PLATE',
    'LICENSE PLATE',
    'pickup_location',
    'PICKUP_LOCATION',
    'PICKUP LOCATION',
    'amount_due',
    'AMOUNT_DUE',
    'AMOUNT DUE',
  ]);
  return used.filter((token) => !known.has(token) && !known.has(token.toLowerCase().replace(/[\s-]+/g, '_')));
}

export function renderPlaceholders(
  template: string,
  values: PlaceholderValues = {},
  options: { keepUnknown?: boolean } = { keepUnknown: true }
): string {
  if (!template) return '';
  let result = template;

  // 1. Resolve curly brace syntax {{token}}
  result = result.replace(/\{\{([a-zA-Z0-9_-]+)\}\}/g, (match, key) => {
    const normalized = key.toLowerCase();
    const val = values[key] ?? values[normalized];
    if (val !== undefined && val !== null) return String(val);
    return options.keepUnknown ? match : '';
  });

  // 2. Resolve square bracket syntax e.g. [VEHICLE_MAKE], [VEHICLE_MODEL], [DUE_DATE], [OWNER NAME], [INDIVIDUAL PORTAL LINK]
  const bracketAliasMap: Record<string, string | number | undefined> = {
    'VEHICLE_MAKE': values.vehicle_make,
    'VEHICLE MAKE': values.vehicle_make,
    'VEHICLE_MODEL': values.vehicle_model,
    'VEHICLE MODEL': values.vehicle_model,
    'DUE_DATE': values.due_date,
    'DUE DATE': values.due_date,
    'VEHICLE_YEAR': values.vehicle_year,
    'VEHICLE YEAR': values.vehicle_year,
    'LICENSE_PLATE': values.license_plate || values.vehicle_plate,
    'LICENSE PLATE': values.license_plate || values.vehicle_plate,
    'VEHICLE_PLATE': values.license_plate || values.vehicle_plate,
    'VEHICLE PLATE': values.license_plate || values.vehicle_plate,
    'PICKUP_LOCATION': values.pickup_location,
    'PICKUP LOCATION': values.pickup_location,
    'AMOUNT_DUE': values.amount_due || values.amount,
    'AMOUNT DUE': values.amount_due || values.amount,
    'OWNER NAME': values.owner_name || values.first_name || values.recipient_name || values.user_name,
    'OWNER_NAME': values.owner_name || values.first_name || values.recipient_name || values.user_name,
    'INDIVIDUAL PORTAL LINK': values.individual_portal_link || values.portal_link,
    'INDIVIDUAL_PORTAL_LINK': values.individual_portal_link || values.portal_link,
    'PORTAL LINK': values.individual_portal_link || values.portal_link,
    'PORTAL_LINK': values.individual_portal_link || values.portal_link,
    'FIRST NAME': values.first_name || values.owner_name,
    'FIRST_NAME': values.first_name || values.owner_name,
    'RECIPIENT NAME': values.recipient_name || values.user_name,
    'RECIPIENT_NAME': values.recipient_name || values.user_name,
    'DRIVER NAME': values.driver_name,
    'DRIVER_NAME': values.driver_name,
    'VEHICLE NAME': values.vehicle_name,
    'VEHICLE_NAME': values.vehicle_name,
    'COMPANY_NAME': values.company_name,
    'COMPANY NAME': values.company_name,
    'SUPPORT_EMAIL': values.support_email,
    'SUPPORT EMAIL': values.support_email,
    'SUPPORT_PHONE': values.support_phone,
    'SUPPORT PHONE': values.support_phone,
  };

  result = result.replace(/\[([A-Z0-9_\s-]+)\]/gi, (match, rawKey) => {
    const upper = rawKey.trim().toUpperCase();
    if (bracketAliasMap[upper] !== undefined && bracketAliasMap[upper] !== null) {
      return String(bracketAliasMap[upper]);
    }
    const snake = upper.toLowerCase().replace(/[\s-]+/g, '_');
    if (values[snake] !== undefined && values[snake] !== null) {
      return String(values[snake]);
    }
    return options.keepUnknown ? match : '';
  });

  return result;
}
