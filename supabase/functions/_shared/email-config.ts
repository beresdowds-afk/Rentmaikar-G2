/**
 * Centralized Email and Domain Configuration for Edge Functions
 *
 * Domain Re-assignment:
 * - Frontend domain: rentmaikar.com (production client app)
 * - Backend domain: staging.rentmaikar.com (API backend)
 * - Incoming mail domain: backend.rentmaikar.com (inbound mailboxes & webhooks)
 * - Outgoing mail domain: notify.rentmaikar.com (outbound transactional/notification emails)
 */

export const DOMAINS = {
  frontend: "rentmaikar.com",
  frontendOrigin: "https://rentmaikar.com",
  backend: "staging.rentmaikar.com",
  backendOrigin: "https://staging.rentmaikar.com",
  incomingMail: "backend.rentmaikar.com",
  outgoingMail: "notify.rentmaikar.com",
} as const;

/**
 * Outgoing Email Configuration (Sending domain: notify.rentmaikar.com)
 */
export const OUTGOING_EMAIL_CONFIG = {
  // Support emails
  support: `support@${DOMAINS.outgoingMail}`,
  
  // Transactional/automated notifications
  noreply: `noreply@${DOMAINS.outgoingMail}`,
  
  // Administrative alerts
  admin: `admin@${DOMAINS.outgoingMail}`,
  
  // Legal/Privacy inquiries
  privacy: `privacy@${DOMAINS.outgoingMail}`,
  
  // Data Protection Officer
  dpo: `dpo@${DOMAINS.outgoingMail}`,

  // Payment inquiries
  payments: `payments@${DOMAINS.outgoingMail}`,

  // Document submissions
  documents: `documents@${DOMAINS.outgoingMail}`,

  // Legal inquiries
  legal: `legal@${DOMAINS.outgoingMail}`,

  // Regional inboxes
  nigeria: `nigeria@${DOMAINS.outgoingMail}`,
  usa: `usa@${DOMAINS.outgoingMail}`,

  // Notifications
  notifications: `notifications@${DOMAINS.outgoingMail}`,

  // Verification & Auth
  verify: `verify@${DOMAINS.outgoingMail}`,

  // Negotiations
  negotiations: `negotiations@${DOMAINS.outgoingMail}`,
} as const;

/**
 * Incoming Email Configuration (Receiving domain: backend.rentmaikar.com)
 */
export const INCOMING_EMAIL_CONFIG = {
  support: `support@${DOMAINS.incomingMail}`,
  noreply: `noreply@${DOMAINS.incomingMail}`,
  admin: `admin@${DOMAINS.incomingMail}`,
  privacy: `privacy@${DOMAINS.incomingMail}`,
  dpo: `dpo@${DOMAINS.incomingMail}`,
  payments: `payments@${DOMAINS.incomingMail}`,
  documents: `documents@${DOMAINS.incomingMail}`,
  legal: `legal@${DOMAINS.incomingMail}`,
  nigeria: `nigeria@${DOMAINS.incomingMail}`,
  usa: `usa@${DOMAINS.incomingMail}`,
  notifications: `notifications@${DOMAINS.incomingMail}`,
  verify: `verify@${DOMAINS.incomingMail}`,
  negotiations: `negotiations@${DOMAINS.incomingMail}`,
} as const;

/**
 * Default EMAIL_CONFIG for senders (uses notify.rentmaikar.com for outbound emails)
 */
export const EMAIL_CONFIG = OUTGOING_EMAIL_CONFIG;

/**
 * Email display names for sender formatting
 */
export const EMAIL_SENDER_NAMES = {
  support: "Rentmaikar Support",
  noreply: "Rentmaikar",
  admin: "Rentmaikar Admin",
  notifications: "Rentmaikar Notifications",
  verify: "Rentmaikar Verification",
  negotiations: "Rentmaikar Pricing",
} as const;

/**
 * Format email with display name for Resend API
 * @example formatSenderEmail('support') => "Rentmaikar Support <support@notify.rentmaikar.com>"
 */
export const formatSenderEmail = (type: keyof typeof EMAIL_CONFIG): string => {
  const email = EMAIL_CONFIG[type];
  const name = EMAIL_SENDER_NAMES[type as keyof typeof EMAIL_SENDER_NAMES] || "Rentmaikar";
  return `${name} <${email}>`;
};

/**
 * Resolve incoming mailbox for recipient queries or reply-to
 */
export const getIncomingEmail = (type: keyof typeof INCOMING_EMAIL_CONFIG): string => {
  return INCOMING_EMAIL_CONFIG[type];
};

export type EmailType = keyof typeof EMAIL_CONFIG;
