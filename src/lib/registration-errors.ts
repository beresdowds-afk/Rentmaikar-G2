export interface FriendlyRegistrationError {
  title: string;
  description: string;
  fields: string[];
  fixSteps: string[];
  raw: string;
  isDuplicate?: boolean;
  isFixableByUser?: boolean;
}

export function classifyRegistrationError(err: any): FriendlyRegistrationError {
  const message = typeof err === 'string' ? err : (err?.message || JSON.stringify(err || ''));
  const lower = message.toLowerCase();

  const isDuplicate =
    lower.includes('already registered') ||
    lower.includes('already exists') ||
    lower.includes('duplicate key') ||
    lower.includes('unique constraint');

  if (isDuplicate) {
    return {
      title: 'Account Already Exists',
      description: 'An account with this email address is already registered in our system.',
      fields: ['email'],
      fixSteps: ['Sign in with your existing password', 'Use the forgot password option if needed'],
      raw: message,
      isDuplicate: true,
      isFixableByUser: true,
    };
  }

  if (lower.includes('address is required for driver') || lower.includes('driver address')) {
    return {
      title: 'Home address required for drivers',
      description: 'A residential home address is required to register as a driver.',
      fields: ['Home address'],
      fixSteps: ['Enter your full home address', 'Include house/apartment number and street name'],
      raw: message,
      isFixableByUser: true,
    };
  }

  if (lower.includes('street_address') && (lower.includes('not-null') || lower.includes('not null') || err?.code === '23502')) {
    return {
      title: 'Home address required',
      description: 'Please provide your residential home address.',
      fields: ['Home address'],
      fixSteps: ['Enter your street address'],
      raw: message,
      isFixableByUser: true,
    };
  }

  if (lower.includes('at least 5 characters') || lower.includes('too short')) {
    return {
      title: 'Home address is too short',
      description: 'Your street address must be at least 5 characters long.',
      fields: ['Home address'],
      fixSteps: ['Include house/apartment number and street name'],
      raw: message,
      isFixableByUser: true,
    };
  }

  if (lower.includes('200 characters') || lower.includes('too long')) {
    return {
      title: 'Home address is too long',
      description: 'Your street address must be 200 characters or fewer.',
      fields: ['Home address'],
      fixSteps: ['Shorten the address to under 200 characters'],
      raw: message,
      isFixableByUser: true,
    };
  }

  if (lower.includes('real residential address') || lower.includes('placeholders are rejected')) {
    return {
      title: 'Please enter a real home address',
      description: 'Placeholder or test addresses cannot be accepted.',
      fields: ['Home address'],
      fixSteps: ['Enter your actual residential address where you receive mail'],
      raw: message,
      isFixableByUser: true,
    };
  }

  return {
    title: 'Registration Issue',
    description: message || 'We could not complete your registration at this time. Please check your details.',
    fields: [],
    fixSteps: ['Verify your details are entered correctly', 'Try submitting the form again'],
    raw: message,
    isDuplicate: false,
    isFixableByUser: true,
  };
}
