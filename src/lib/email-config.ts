/**
 * Centralized Email and Domain Configuration
 *
 * Domain Re-assignment:
 * - Frontend domain: rentmaikar.com (remains frontend)
 * - Backend domain: staging.rentmaikar.com (API server)
 * - Incoming mail domain: backend.rentmaikar.com (incoming mailboxes & webhooks)
 * - Outgoing mail domain: notify.rentmaikar.com (outgoing transactional/notification mail)
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
 * Outgoing Email Addresses (Sending domain: notify.rentmaikar.com)
 * Used by Resend, transaction notification jobs, and outbound dispatchers
 */
export const OUTGOING_EMAIL_CONFIG = {
  support: `support@${DOMAINS.outgoingMail}`,
  noreply: `noreply@${DOMAINS.outgoingMail}`,
  admin: `admin@${DOMAINS.outgoingMail}`,
  privacy: `privacy@${DOMAINS.outgoingMail}`,
  dpo: `dpo@${DOMAINS.outgoingMail}`,
  payments: `payments@${DOMAINS.outgoingMail}`,
  documents: `documents@${DOMAINS.outgoingMail}`,
  legal: `legal@${DOMAINS.outgoingMail}`,
  nigeria: `nigeria@${DOMAINS.outgoingMail}`,
  usa: `usa@${DOMAINS.outgoingMail}`,
  notifications: `notifications@${DOMAINS.outgoingMail}`,
  verify: `verify@${DOMAINS.outgoingMail}`,
  negotiations: `negotiations@${DOMAINS.outgoingMail}`,
} as const;

/**
 * Incoming Email Addresses (Receiving domain: backend.rentmaikar.com)
 * Used for receiving emails, inbound support inboxes, reply-to routing, and webhook classification
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
 * Default EMAIL_CONFIG for senders (uses notify.rentmaikar.com for outbound dispatch)
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
 * Company / Contact Information by Region (receives mail at incoming domain: backend.rentmaikar.com)
 */
export const COMPANY_INFO = {
  USA: {
    companyName: "Inte-Gritty LLC",
    address: "2002 East Marlboro Avenue, Apt 203",
    city: "Hyattsville",
    state: "Maryland",
    country: "United States",
    zip: "20785",
    fullAddress: "2002 East Marlboro Avenue, Apt 203, Hyattsville, Maryland, United States 20785",
    phone: "+1 (608) 384-3932",
    phoneRaw: "+16083843932",
    email: INCOMING_EMAIL_CONFIG.support,
  },
  NIGERIA: {
    companyName: "Rentmaikar Nigeria",
    address: "",
    city: "Lagos",
    state: "Lagos",
    country: "Nigeria",
    zip: "",
    fullAddress: "Lagos, Nigeria",
    phone: "+234 706 4916 791",
    phoneRaw: "+2347064916791",
    email: INCOMING_EMAIL_CONFIG.support,
  },
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

export type EmailType = keyof typeof EMAIL_CONFIG;
