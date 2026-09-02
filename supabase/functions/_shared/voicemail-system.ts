/**
 * Rentmaikar Voicemail System Module
 * 
 * Dynamic voicemail scripts with SMS follow-ups,
 * answering machine detection handling, and logging.
 */

// ─── VOICEMAIL SCRIPT DEFINITIONS ───

export interface VoicemailScript {
  message: string;
  callbackQueue: string;
  smsFollowup: boolean;
  smsLink: boolean;
  smsWelcome: boolean;
}

export const VOICEMAIL_SCRIPTS: Record<string, VoicemailScript> = {
  payment_default_day1: {
    message: "This is Rentmaikar calling regarding your payment. Your payment of [Amount] is now overdue. Please call us back at [Number] or make payment through our automated system.",
    callbackQueue: "payment_ivr",
    smsFollowup: true,
    smsLink: false,
    smsWelcome: false,
  },
  payment_default_day2: {
    message: "URGENT: This is Rentmaikar. Your payment is now 48 hours overdue. Your vehicle may be deactivated if payment is not received. Call us immediately at [Number].",
    callbackQueue: "priority_queue",
    smsFollowup: true,
    smsLink: false,
    smsWelcome: false,
  },
  document_expiry: {
    message: "Hello, this is Rentmaikar with a reminder that your [Document] expires on [Date]. Please upload a new copy through your driver portal or call us for assistance.",
    callbackQueue: "document_team",
    smsFollowup: false,
    smsLink: true,
    smsWelcome: false,
  },
  welcome_call: {
    message: "Welcome to Rentmaikar! We're excited to have you. Please log in to your account to complete your registration. If you need assistance, call us back at [Number].",
    callbackQueue: "new_user_queue",
    smsFollowup: false,
    smsLink: false,
    smsWelcome: true,
  },
};

// ─── VARIABLE REPLACEMENT ───

export interface VoicemailVariables {
  amount?: string;
  number?: string;
  document?: string;
  date?: string;
  name?: string;
  [key: string]: string | undefined;
}

/**
 * Replace [Variable] placeholders in a voicemail script with actual values.
 */
export function personalizeScript(template: string, variables: VoicemailVariables): string {
  let result = template;
  if (variables.amount) result = result.replace('[Amount]', variables.amount);
  if (variables.number) result = result.replace(/\[Number\]/g, variables.number);
  if (variables.document) result = result.replace('[Document]', variables.document);
  if (variables.date) result = result.replace('[Date]', variables.date);
  if (variables.name) result = result.replace('[Name]', variables.name);
  return result;
}

// ─── REGIONAL CALLBACK NUMBERS ───

const CALLBACK_NUMBERS: Record<string, string> = {
  US: '+12025550123', // placeholder — loaded from communication_providers in production
  NG: '+2349000000000',
};

export function getCallbackNumber(region: string): string {
  return CALLBACK_NUMBERS[region] || CALLBACK_NUMBERS['US'];
}

// ─── TWIML GENERATION ───

/**
 * Generate TwiML for voicemail drop using Answering Machine Detection.
 * Uses `DetectMessageEnd` to wait for the beep before speaking.
 */
export function generateVoicemailTwiML(
  personalizedMessage: string,
  voice: string = 'Polly.Joanna',
  language: string = 'en-US',
): string {
  return `<Response><Pause length="1"/><Say voice="${voice}" language="${language}">${escapeXml(personalizedMessage)}</Say></Response>`;
}

/**
 * Generate the SMS follow-up message based on script type.
 */
export function generateFollowUpSMS(
  scriptType: string,
  callbackNumber: string,
  variables: VoicemailVariables = {},
): string {
  const messages: Record<string, string> = {
    payment_default_day1: `We tried to reach you about your overdue payment of ${variables.amount || 'your balance'}. Please call ${callbackNumber} or visit your dashboard to pay.`,
    payment_default_day2: `URGENT: Your payment is 48 hours overdue. Your vehicle may be restricted. Call ${callbackNumber} immediately or pay via your dashboard.`,
    document_expiry: `Your ${variables.document || 'document'} expires ${variables.date ? 'on ' + variables.date : 'soon'}. Upload a new copy at your dashboard: https://rentmaikar.lovable.app/driver-dashboard`,
    welcome_call: `Welcome to Rentmaikar! 🚗 Complete your registration at https://rentmaikar.lovable.app. Need help? Call ${callbackNumber}.`,
  };
  return messages[scriptType] || `We tried to reach you regarding your Rentmaikar account. Please call ${callbackNumber} for assistance.`;
}

// ─── XML ESCAPE UTILITY ───

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
