/**
 * Centralized Email Configuration for Edge Functions
 * All sender and contact email addresses for the platform
 */

export const EMAIL_CONFIG = {
  // Support emails - unified for all regions
  support: "support@rentmaikar.com",
  
  // Transactional/automated notifications
  noreply: "noreply@rentmaikar.com",
  
  // Administrative alerts
  admin: "admin@rentmaikar.com",
  
  // Legal/Privacy inquiries
  privacy: "privacy@rentmaikar.com",
  
  // Data Protection Officer
  dpo: "dpo@rentmaikar.com",

  // Payment inquiries
  payments: "payments@rentmaikar.com",

  // Document submissions
  documents: "documents@rentmaikar.com",

  // Legal inquiries
  legal: "legal@rentmaikar.com",

  // Regional inboxes
  nigeria: "nigeria@rentmaikar.com",
  usa: "usa@rentmaikar.com",

  // Notifications
  notifications: "notifications@rentmaikar.com",

  // Verification & Auth
  verify: "verify@rentmaikar.com",

  // Negotiations
  negotiations: "negotiations@rentmaikar.com",
} as const;

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
 * @example formatSenderEmail('support') => "Rentmaikar Support <support@rentmaikar.com>"
 */
export const formatSenderEmail = (type: keyof typeof EMAIL_CONFIG): string => {
  const email = EMAIL_CONFIG[type];
  const name = EMAIL_SENDER_NAMES[type as keyof typeof EMAIL_SENDER_NAMES] || "Rentmaikar";
  return `${name} <${email}>`;
};

export type EmailType = keyof typeof EMAIL_CONFIG;
