export interface FriendlyRegistrationError {
  title: string;
  description: string;
  fields: string[];
  fixSteps: string[];
  raw: string;
  isDuplicate?: boolean;
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
    };
  }

  return {
    title: 'Registration Issue',
    description: message || 'We could not complete your registration at this time. Please check your details.',
    fields: [],
    fixSteps: ['Verify your details are entered correctly', 'Try submitting the form again'],
    raw: message,
    isDuplicate: false,
  };
}
