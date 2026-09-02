// Utilities to translate raw Supabase/Postgres errors from the registration
// flow into a friendly, actionable message for the UI. Kept in one place so
// both the driver and owner registration pages behave identically.

export type FriendlyRegistrationError = {
  title: string;
  /** One-sentence plain-English explanation of what went wrong. */
  description: string;
  /** Concrete things the user should do next, rendered as a checklist. */
  fixSteps: string[];
  /** Human labels of the specific fields that need attention (if known). */
  fields: string[];
  isPermissionIssue: boolean;
  isDuplicate: boolean;
  /** True when the user can fix this themselves by editing the form. */
  isFixableByUser: boolean;
  raw: string;
};

/** Maps database column names to the labels users see on the form. */
const FIELD_LABELS: Record<string, string> = {
  full_name: 'Full name',
  first_name: 'First name',
  last_name: 'Last name',
  email: 'Email address',
  phone: 'Phone number',
  phone_number: 'Phone number',
  street_address: 'Home address',
  address: 'Home address',
  city: 'City',
  state: 'State / region',
  country: 'Country',
  date_of_birth: 'Date of birth',
  drivers_license_number: 'Driver’s licence number',
  license_number: 'Driver’s licence number',
  license_expiry: 'Driver’s licence expiry date',
  national_id: 'National ID (NIN)',
  bvn: 'BVN',
  vehicle_make: 'Vehicle make',
  vehicle_model: 'Vehicle model',
  vehicle_year: 'Vehicle year',
  vin: 'Vehicle VIN',
  plate_number: 'Plate number',
  emergency_contact_name: 'Emergency contact name',
  emergency_contact_phone: 'Emergency contact phone',
  referee_name: 'Referee name',
  referee_phone: 'Referee phone',
  application_type: 'Account type',
  user_id: 'Account',
};

function labelFor(column: string): string {
  return FIELD_LABELS[column] ?? column.replace(/_/g, ' ');
}

/** Pulls column names out of Postgres error text (quoted or "column X"). */
function extractColumns(raw: string): string[] {
  const found = new Set<string>();
  const patterns = [
    /column "([a-z0-9_]+)"/gi,
    /null value in column "([a-z0-9_]+)"/gi,
    /key \(([a-z0-9_, ]+)\)/gi,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw)) !== null) {
      m[1]
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean)
        .forEach((c) => found.add(c));
    }
  }
  // Known constraint names that don't name their column directly.
  if (/address/i.test(raw)) found.add('street_address');
  if (/e164|phone/i.test(raw)) found.add('phone');
  return [...found].filter((c) => c !== 'id' && c !== 'created_at' && c !== 'updated_at');
}

export function classifyRegistrationError(
  err: unknown,
): FriendlyRegistrationError {
  const anyErr = err as {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
  } | null;
  const raw = [
    anyErr?.message,
    anyErr?.details,
    anyErr?.hint,
    anyErr?.code,
  ]
    .filter(Boolean)
    .join(' | ') || 'Unknown error';

  const lower = raw.toLowerCase();
  const code = anyErr?.code;
  const columns = extractColumns(raw);
  const fields = columns.map(labelFor);

  const base = {
    fields: [] as string[],
    isPermissionIssue: false,
    isDuplicate: false,
    isFixableByUser: false,
    raw,
  };

  const isPermissionIssue =
    lower.includes('permission denied') ||
    lower.includes('row-level security') ||
    lower.includes('violates row-level') ||
    lower.includes('not authorized') ||
    code === '42501' ||
    code === 'PGRST301';

  const isAlreadyRegistered =
    lower.includes('already registered') ||
    lower.includes('user already') ||
    lower.includes('email address is already');

  const isDuplicate =
    lower.includes('already has') ||
    lower.includes('pending application') ||
    lower.includes('duplicate') ||
    code === '23505' ||
    lower.includes('no_pending_application_for_email');

  const isWeakPassword =
    lower.includes('password') &&
    (lower.includes('weak') || lower.includes('at least') || lower.includes('6 characters'));

  // ---- Field-level problems the user can fix on the form ------------------

  // Home address rules enforced by enforce_driver_address_required and
  // enforce_profile_address_rules. Each database message gets its own copy so
  // the driver knows exactly what to change.
  const isAddressError =
    lower.includes('home address') ||
    lower.includes('street_address') ||
    lower.includes('address is required for driver') ||
    lower.includes('residential address');

  // The same phone number cannot be attached to two accounts
  // (profiles_phone_unique).
  if (lower.includes('profiles_phone_unique') || (code === '23505' && lower.includes('phone'))) {
    return {
      ...base,
      title: 'Phone number already in use',
      description:
        'That phone number is already linked to another account, so we can’t attach it here.',
      fixSteps: [
        'Enter a different phone number you can receive SMS on.',
        'If this number is yours, sign in to that account instead.',
        'Contact support if you believe the number was linked by mistake.',
      ],
      fields: ['Phone number'],
      isDuplicate: true,
      isFixableByUser: true,
    };
  }

  if (isAddressError) {
    // Too long (> 200 characters).
    if (lower.includes('200 characters') || lower.includes('or fewer') || lower.includes('less than 200')) {
      return {
        ...base,
        title: 'Your home address is too long',
        description:
          'Home addresses are limited to 200 characters so they fit on agreements and handover documents.',
        fixSteps: [
          'Shorten the address to 200 characters or fewer.',
          'Drop the country name and any extra directions or landmarks.',
          'Keep the house number, street, area and city.',
        ],
        fields: ['Home address'],
        isFixableByUser: true,
      };
    }

    // Too short (< 5 characters).
    if (
      lower.includes('at least 5 characters') ||
      lower.includes('at least 5') ||
      lower.includes('too short')
    ) {
      return {
        ...base,
        title: 'Your home address is too short',
        description:
          'The address you entered is under 5 characters, so it can’t be used to verify you or arrange vehicle handover.',
        fixSteps: [
          'Enter the full address: house/apartment number, street name, area and city.',
          'Example: “24 Ademola Street, Ikeja, Lagos”.',
          'Initials, abbreviations or a single word won’t be accepted.',
        ],
        fields: ['Home address'],
        isFixableByUser: true,
      };
    }

    // Placeholder value rejected.
    if (lower.includes('placeholder')) {
      return {
        ...base,
        title: 'Enter your real home address',
        description:
          'Placeholder values like “N/A”, “none” or “test” are rejected — we use this address for identity verification and handover.',
        fixSteps: [
          'Replace the placeholder with the address where you actually live.',
          'Include the house/apartment number and street name.',
        ],
        fields: ['Home address'],
        isFixableByUser: true,
      };
    }

    // Missing entirely (driver-only requirement).
    return {
      ...base,
      title: 'Home address is required for drivers',
      description:
        'Your home address was empty. Drivers must provide a physical home address so we can verify identity and arrange vehicle handover — owners may leave it blank.',
      fixSteps: [
        'Scroll to “Home Address” and enter where you currently live.',
        'Include your house/apartment number and street name (at least 5 characters).',
        'Avoid PO boxes — we need a physical address.',
      ],
      fields: ['Home address'],
      isFixableByUser: true,
    };
  }


  // Phone format rules (E.164 / libphonenumber checks).
  if (
    lower.includes('e164') ||
    lower.includes('invalid phone') ||
    (lower.includes('phone') && (lower.includes('format') || lower.includes('invalid')))
  ) {
    return {
      ...base,
      title: 'Your phone number format is invalid',
      description:
        'We store phone numbers in international format so calls, SMS and WhatsApp reach you reliably.',
      fixSteps: [
        'Pick your country code from the dropdown (e.g. +1 for USA, +234 for Nigeria).',
        'Enter the number without a leading 0 after the country code.',
        'Remove spaces, dashes and brackets if the field still rejects it.',
      ],
      fields: ['Phone number'],
      isFixableByUser: true,
    };
  }

  // Missing required value (NOT NULL violation).
  if (code === '23502' || lower.includes('null value in column')) {
    return {
      ...base,
      title: fields.length
        ? `Missing required ${fields.length > 1 ? 'fields' : 'field'}`
        : 'A required field is missing',
      description:
        'Your submission was rejected because one or more mandatory fields were left empty.',
      fixSteps: fields.length
        ? [`Fill in: ${fields.join(', ')}.`, 'Then submit the form again.']
        : [
            'Scroll through the form and complete every field marked with an asterisk (*).',
            'Then submit the form again.',
          ],
      fields,
      isFixableByUser: true,
    };
  }

  // Value fails a database rule (CHECK constraint) or is malformed.
  if (code === '23514' || code === '22P02' || code === '22001' || lower.includes('violates check constraint')) {
    return {
      ...base,
      title: fields.length
        ? `“${fields[0]}” doesn’t look right`
        : 'One of your answers isn’t in the expected format',
      description:
        code === '22001'
          ? 'One of your answers is longer than we allow.'
          : 'One of your answers failed a validation rule, so we couldn’t save it.',
      fixSteps: [
        fields.length
          ? `Review and correct: ${fields.join(', ')}.`
          : 'Review dates, ID numbers and numeric fields for typos.',
        'Dates must be real calendar dates and licences must not be expired.',
        'ID numbers should contain digits only, with no spaces.',
      ],
      fields,
      isFixableByUser: true,
    };
  }

  if (isAlreadyRegistered) {
    return {
      ...base,
      title: 'This email already has an account',
      description:
        'An account with this email already exists, so we can’t create a second one.',
      fixSteps: [
        'Sign in with this email, then continue your registration from your dashboard.',
        'Use “Forgot password” if you can’t remember your password.',
        'Or register again with a different email address.',
      ],
      isDuplicate: true,
      isFixableByUser: true,
    };
  }

  if (isDuplicate) {
    return {
      ...base,
      title: 'You’ve already submitted an application',
      description:
        'We already have an application on file for this email, so a second submission was blocked.',
      fixSteps: [
        'Sign in to check your application status — no need to submit again.',
        'Watch your inbox (and spam folder) for our review update.',
        'Contact support if you believe this is a mistake.',
      ],
      isDuplicate: true,
      isFixableByUser: true,
    };
  }

  if (isWeakPassword) {
    return {
      ...base,
      title: 'Your password doesn’t meet our requirements',
      description: 'Passwords must be strong enough to protect your account and payout details.',
      fixSteps: [
        'Use at least 8 characters.',
        'Mix upper and lower case letters with at least one number.',
        'Avoid reusing a password from another site.',
      ],
      fields: ['Password'],
      isFixableByUser: true,
    };
  }

  // Network / offline.
  if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('timeout')) {
    return {
      ...base,
      title: 'We couldn’t reach our servers',
      description: 'Your form was not submitted because the connection dropped.',
      fixSteps: [
        'Check your internet connection.',
        'Tap Retry — your answers are still filled in.',
      ],
    };
  }

  if (isPermissionIssue) {
    return {
      ...base,
      title: 'Your session blocked this submission',
      description:
        'Our security rules rejected the request — usually because your sign-in session expired mid-form.',
      fixSteps: [
        'Tap Retry once — this often clears itself.',
        'If it fails again, sign in and reopen this form; your answers are saved as you type.',
        'Still stuck? Contact support with the code below.',
      ],
      isPermissionIssue: true,
    };
  }

  return {
    ...base,
    title: 'We couldn’t submit your registration',
    description: 'Something went wrong on our side, so nothing was saved.',
    fixSteps: [
      'Tap Retry — your answers are still filled in.',
      'If it keeps failing, contact support and share the code below.',
    ],
  };
}
