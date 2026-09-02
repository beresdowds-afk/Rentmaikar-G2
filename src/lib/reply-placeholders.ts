// Dynamic placeholders shared by canned replies and auto-replies.
// Tokens use the {{token}} syntax and are resolved server-side when an
// auto-reply fires, or from the live conversation when an admin inserts a
// canned reply in the unified inbox.

export interface PlaceholderToken {
  token: string;
  label: string;
  sample: string;
}

export const REPLY_PLACEHOLDERS: PlaceholderToken[] = [
  { token: 'customer_name', label: 'Customer name', sample: 'Adaeze Okonkwo' },
  { token: 'first_name', label: 'First name', sample: 'Adaeze' },
  { token: 'customer_email', label: 'Customer email', sample: 'adaeze@example.com' },
  { token: 'customer_phone', label: 'Customer phone', sample: '+2348012345678' },
  { token: 'vehicle', label: 'Vehicle', sample: '2021 Toyota Corolla' },
  { token: 'vehicle_plate', label: 'Vehicle plate', sample: 'LAG-472-KJA' },
  { token: 'pickup_location', label: 'Pickup location', sample: 'Ikeja Hub, Lagos' },
  { token: 'booking_start', label: 'Booking start', sample: '12 Aug 2026' },
  { token: 'booking_end', label: 'Booking end', sample: '11 Sep 2026' },
  { token: 'daily_rate', label: 'Daily rate', sample: '18000' },
  { token: 'currency', label: 'Currency', sample: 'NGN' },
  { token: 'payment_frequency', label: 'Payment frequency', sample: 'weekly' },
  { token: 'region', label: 'Region', sample: 'nigeria' },
  { token: 'today', label: "Today's date", sample: '11 Aug 2026' },
];

export const PLACEHOLDER_PATTERN = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

export type PlaceholderValues = Record<string, string | null | undefined>;

/** Replaces every {{token}} with its resolved value. Unknown tokens are left intact. */
export const renderPlaceholders = (
  template: string,
  values: PlaceholderValues,
  options: { keepUnknown?: boolean } = {},
): string => {
  if (!template) return '';
  const keepUnknown = options.keepUnknown ?? true;
  return template.replace(PLACEHOLDER_PATTERN, (match, rawToken: string) => {
    const key = rawToken.toLowerCase();
    const value = values?.[key];
    if (value === undefined || value === null || value === '') {
      return keepUnknown ? match : '';
    }
    return String(value);
  });
};

/** All tokens used inside a template, de-duplicated and lowercased. */
export const usedPlaceholders = (template: string): string[] => {
  const found = new Set<string>();
  for (const match of (template || '').matchAll(PLACEHOLDER_PATTERN)) {
    found.add(match[1].toLowerCase());
  }
  return Array.from(found);
};

/** Tokens in a template that are not part of the supported set. */
export const unknownPlaceholders = (template: string): string[] => {
  const known = new Set(REPLY_PLACEHOLDERS.map((p) => p.token));
  return usedPlaceholders(template).filter((t) => !known.has(t));
};

export const SAMPLE_PLACEHOLDER_VALUES: PlaceholderValues = Object.fromEntries(
  REPLY_PLACEHOLDERS.map((p) => [p.token, p.sample]),
);

/** Values that are missing/blank for the tokens used in a template. */
export const missingPlaceholders = (
  template: string,
  values: PlaceholderValues,
): string[] =>
  usedPlaceholders(template).filter((t) => {
    const v = values?.[t];
    return v === undefined || v === null || String(v).trim() === '';
  });
