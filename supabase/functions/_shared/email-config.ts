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
 * Email display names for sender formatting (valid Name attributes for all outbound platform emails)
 */
export const EMAIL_SENDER_NAMES = {
  support: "Rentmaikar Support",
  noreply: "Rentmaikar Notifications",
  admin: "Rentmaikar Admin",
  notifications: "Rentmaikar Notifications",
  verify: "Rentmaikar Verification",
  negotiations: "Rentmaikar Pricing",
  payments: "Rentmaikar Billing & Payments",
  documents: "Rentmaikar Document Verification",
  legal: "Rentmaikar Legal",
  privacy: "Rentmaikar Privacy",
  dpo: "Rentmaikar Data Protection",
  nigeria: "Rentmaikar Nigeria Operations",
  usa: "Rentmaikar USA Operations",
} as const;

/**
 * Authoritative list of Outbound Platform Email definitions with unique IDs and valid name attributes.
 */
export const OUTGOING_PLATFORM_EMAILS = [
  { id: "platform-email-support", key: "support", email: OUTGOING_EMAIL_CONFIG.support, name: EMAIL_SENDER_NAMES.support, description: "Customer Support & Inquiries" },
  { id: "platform-email-noreply", key: "noreply", email: OUTGOING_EMAIL_CONFIG.noreply, name: EMAIL_SENDER_NAMES.noreply, description: "Automated Platform Notifications" },
  { id: "platform-email-admin", key: "admin", email: OUTGOING_EMAIL_CONFIG.admin, name: EMAIL_SENDER_NAMES.admin, description: "Administrative Alerts & Internal Dispatch" },
  { id: "platform-email-notifications", key: "notifications", email: OUTGOING_EMAIL_CONFIG.notifications, name: EMAIL_SENDER_NAMES.notifications, description: "User & Fleet Activity Notifications" },
  { id: "platform-email-verify", key: "verify", email: OUTGOING_EMAIL_CONFIG.verify, name: EMAIL_SENDER_NAMES.verify, description: "Identity & 2FA Verification Codes" },
  { id: "platform-email-negotiations", key: "negotiations", email: OUTGOING_EMAIL_CONFIG.negotiations, name: EMAIL_SENDER_NAMES.negotiations, description: "Pricing & Rental Agreement Negotiations" },
  { id: "platform-email-payments", key: "payments", email: OUTGOING_EMAIL_CONFIG.payments, name: EMAIL_SENDER_NAMES.payments, description: "Billing, Receipts, Invoices & Escrow" },
  { id: "platform-email-documents", key: "documents", email: OUTGOING_EMAIL_CONFIG.documents, name: EMAIL_SENDER_NAMES.documents, description: "Driver & Vehicle Document Verification" },
  { id: "platform-email-legal", key: "legal", email: OUTGOING_EMAIL_CONFIG.legal, name: EMAIL_SENDER_NAMES.legal, description: "Legal Agreements & Platform Terms" },
  { id: "platform-email-privacy", key: "privacy", email: OUTGOING_EMAIL_CONFIG.privacy, name: EMAIL_SENDER_NAMES.privacy, description: "Privacy Policy & GDPR/NDPR Compliance" },
  { id: "platform-email-dpo", key: "dpo", email: OUTGOING_EMAIL_CONFIG.dpo, name: EMAIL_SENDER_NAMES.dpo, description: "Data Protection Officer Enquiries" },
  { id: "platform-email-nigeria", key: "nigeria", email: OUTGOING_EMAIL_CONFIG.nigeria, name: EMAIL_SENDER_NAMES.nigeria, description: "Nigeria Operations & Regional Fleet" },
  { id: "platform-email-usa", key: "usa", email: OUTGOING_EMAIL_CONFIG.usa, name: EMAIL_SENDER_NAMES.usa, description: "USA Operations & Regional Fleet" },
] as const;

/**
 * Format email with display name for Resend API
 * @example formatSenderEmail('support') => "Rentmaikar Support <support@notify.rentmaikar.com>"
 */
export const formatSenderEmail = (type: keyof typeof EMAIL_CONFIG): string => {
  const email = EMAIL_CONFIG[type];
  const name = EMAIL_SENDER_NAMES[type as keyof typeof EMAIL_SENDER_NAMES] || "Rentmaikar";
  return `${name} <${email}>`;
};

export type IncomingEmailType = keyof typeof INCOMING_EMAIL_CONFIG;

/** Reply-to address for outbound mail so responses reach the inbound domain. */
export const replyToFor = (type: IncomingEmailType = "support"): string =>
  INCOMING_EMAIL_CONFIG[type] || INCOMING_EMAIL_CONFIG.support;

/**
 * Normalizes any RentMaikar recipient address to its local part so inbound
 * routing works for backend.rentmaikar.com, rentmaikar.com, and legacy aliases.
 */
export const inboundLocalPart = (address: string): string =>
  (address || "").trim().toLowerCase().split("@")[0] ?? "";

/**
 * Resolve incoming mailbox for recipient queries or reply-to
 */
export const getIncomingEmail = (type: keyof typeof INCOMING_EMAIL_CONFIG): string => {
  return INCOMING_EMAIL_CONFIG[type];
};

export type EmailType = keyof typeof EMAIL_CONFIG;
