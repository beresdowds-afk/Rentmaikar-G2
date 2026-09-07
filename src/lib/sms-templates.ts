/**
 * Canonical SMS template definitions, segment counter, and provider routing rules.
 *
 * Adheres to platform messaging regulations:
 * - A2P 10DLC compliance (US/Canada): 160-char GSM-7 segmenting, opt-out suffix ("Reply STOP to opt out")
 * - Regional Provider Routing:
 *     * Nigeria (+234): Termii aggregator via Sender ID "Rentmaikar" or designated forwarding number.
 *     * USA/Canada (+1): Sent.dm CPaaS primary with Twilio 10DLC fallback (+1 608-384-3932).
 *     * Global/International: Sent.dm CPaaS.
 * - Event-driven linkages to EVENT_TEMPLATE_MAP and twilio_message_templates.
 */

export interface SmsTemplate {
  id: string;
  title: string;
  category: 'payments' | 'bookings' | 'inspections' | 'onboarding' | 'safety' | 'support';
  notificationType: string;
  body: string;
  description: string;
  parameters: string[];
  suggestedForEvents?: string[];
}

export const SMS_TEMPLATES: SmsTemplate[] = [
  {
    id: 'rentmaikar_payment_reminder',
    title: 'Payment Reminder (Pre-Due)',
    category: 'payments',
    notificationType: 'payment_reminder',
    body: 'Rentmaikar: Hi {{first_name}}, your {{payment_frequency}} rent of {{currency}} {{daily_rate}} for the {{vehicle}} is due soon. Please pay via your dashboard to keep your rental active.',
    description: 'Sent before a payment deadline to remind drivers to maintain an active rental status.',
    parameters: ['first_name', 'payment_frequency', 'currency', 'daily_rate', 'vehicle'],
    suggestedForEvents: ['invoices_created', 'daily_debit_reminder', 'predue_warning'],
  },
  {
    id: 'rentmaikar_payment_received',
    title: 'Payment Received Confirmation',
    category: 'payments',
    notificationType: 'payment_received',
    body: 'Rentmaikar: Thanks {{first_name}}, we received your payment of {{currency}} {{amount}} for {{vehicle}} on {{today}}. Your rental remains active.',
    description: 'Instant receipt confirmation when a payment succeeds.',
    parameters: ['first_name', 'currency', 'amount', 'vehicle', 'today'],
    suggestedForEvents: ['payments_status_succeeded', 'invoice_paid'],
  },
  {
    id: 'rentmaikar_payment_default',
    title: 'Payment Overdue / Default Alert',
    category: 'payments',
    notificationType: 'payment_overdue',
    body: 'Rentmaikar URGENT: {{first_name}}, your payment of {{currency}} {{amount}} for {{vehicle}} is overdue. Please settle immediately via your portal to avoid late fees and vehicle immobilization.',
    description: 'Alert sent when a scheduled payment fails or is overdue.',
    parameters: ['first_name', 'currency', 'amount', 'vehicle'],
    suggestedForEvents: ['payments_status_failed', 'invoices_status_overdue', 'payment_default'],
  },
  {
    id: 'rentmaikar_vehicle_shutdown',
    title: 'Vehicle Shutdown / Immobilization Warning',
    category: 'safety',
    notificationType: 'vehicle_shutdown',
    body: 'Rentmaikar WARNING: {{first_name}}, outstanding balance of {{currency}} {{amount}} remains unpaid. Remote immobilization of {{vehicle}} ({{vehicle_plate}}) is scheduled. Settle now or call {{support_phone}}.',
    description: 'Final warning before telematics immobilizer shutdown is executed.',
    parameters: ['first_name', 'currency', 'amount', 'vehicle', 'vehicle_plate', 'support_phone'],
    suggestedForEvents: ['vehicle_shutdown_warning', 'immobilizer_dispatch'],
  },
  {
    id: 'rentmaikar_booking_confirm',
    title: 'Booking Confirmation',
    category: 'bookings',
    notificationType: 'booking_confirmation',
    body: 'Rentmaikar: {{first_name}}, your booking for {{vehicle}} is confirmed from {{booking_start}} to {{booking_end}}. Pickup location: {{pickup_location}}.',
    description: 'Confirmation sent when an agreement or rental booking is approved.',
    parameters: ['first_name', 'vehicle', 'booking_start', 'booking_end', 'pickup_location'],
    suggestedForEvents: ['agreements_created', 'booking_approved'],
  },
  {
    id: 'rentmaikar_pickup_details',
    title: 'Vehicle Pickup & Handover Details',
    category: 'bookings',
    notificationType: 'vehicle_assigned',
    body: 'Rentmaikar: {{first_name}}, your {{vehicle}} is ready for handover at {{pickup_location}} on {{booking_start}}. Please bring your valid driver license and agreement confirmation.',
    description: 'Handover location and scheduling instructions for drivers.',
    parameters: ['first_name', 'vehicle', 'pickup_location', 'booking_start'],
    suggestedForEvents: ['vehicle_assigned', 'handover_scheduled'],
  },
  {
    id: 'rentmaikar_vehicle_return',
    title: 'Vehicle Return Notice (24h Reminder)',
    category: 'bookings',
    notificationType: 'vehicle_return_reminder',
    body: 'Rentmaikar: Hi {{first_name}}, your {{vehicle}} ({{vehicle_plate}}) is due for return tomorrow at {{return_time}} at {{pickup_location}}. Reply EXTEND to request an extension.',
    description: '24-hour reminder before scheduled vehicle return.',
    parameters: ['first_name', 'vehicle', 'vehicle_plate', 'return_time', 'pickup_location'],
    suggestedForEvents: ['vehicle_return_reminder', 'agreement_expiring'],
  },
  {
    id: 'rentmaikar_inspection_alert',
    title: 'Weekly Inspection Reminder',
    category: 'inspections',
    notificationType: 'general',
    body: 'Rentmaikar: Hi {{first_name}}, your weekly vehicle safety check is due today for {{vehicle}} ({{vehicle_plate}}). Please upload the 10 required exterior/interior photos via your driver portal.',
    description: 'Weekly reminder to complete mandated vehicle photos and inspection report.',
    parameters: ['first_name', 'vehicle', 'vehicle_plate'],
    suggestedForEvents: ['inspection_due', 'weekly_safety_check'],
  },
  {
    id: 'rentmaikar_welcome_sms',
    title: 'Welcome & Onboarding Welcome',
    category: 'onboarding',
    notificationType: 'general',
    body: 'Welcome to Rentmaikar {{first_name}}! Your application has been received and is being verified. Log in to your portal to monitor status: https://rentmaikar.com',
    description: 'Sent upon driver or owner registration.',
    parameters: ['first_name'],
    suggestedForEvents: ['applications_created', 'driver_registered'],
  },
  {
    id: 'rentmaikar_doc_verified',
    title: 'Document Approved / Verified',
    category: 'onboarding',
    notificationType: 'document_verified',
    body: 'Rentmaikar: Great news {{first_name}}, your {{document_type}} has been reviewed and approved. Log in to complete your next onboarding step.',
    description: 'Sent when KYC/license/vehicle document is approved by staff.',
    parameters: ['first_name', 'document_type'],
    suggestedForEvents: ['applications_status_approved', 'document_approved'],
  },
  {
    id: 'rentmaikar_doc_rejected',
    title: 'Document Requires Attention / Resubmission',
    category: 'onboarding',
    notificationType: 'document_rejected',
    body: 'Rentmaikar: Hi {{first_name}}, your {{document_type}} could not be verified. Please log in to your dashboard to review feedback and re-upload a clear copy.',
    description: 'Sent when a document verification fails.',
    parameters: ['first_name', 'document_type'],
    suggestedForEvents: ['document_rejected', 'verification_failed'],
  },
  {
    id: 'rentmaikar_referee_verification',
    title: 'Referee Attestation Request',
    category: 'onboarding',
    notificationType: 'general',
    body: 'Rentmaikar: Hello {{referee_name}}, {{applicant_name}} has listed you as a referee for their vehicle rental application. Please confirm their reference here: {{portal_link}}',
    description: 'Sent to guarantor or referee to complete reference verification.',
    parameters: ['referee_name', 'applicant_name', 'portal_link'],
    suggestedForEvents: ['referee_attestation_requested'],
  },
  {
    id: 'rentmaikar_incident_alert',
    title: 'Emergency / Safety Incident Alert',
    category: 'safety',
    notificationType: 'incident_alert',
    body: 'Rentmaikar SAFETY ALERT: Telematics event logged for vehicle {{vehicle_plate}} at {{location}}. Our emergency support team has been notified. Contact {{support_phone}} immediately.',
    description: 'Triggered upon crash detection, tamper alert, or panic event.',
    parameters: ['vehicle_plate', 'location', 'support_phone'],
    suggestedForEvents: ['accident_detected', 'incident_alert', 'telemetry_alarm'],
  },
  {
    id: 'rentmaikar_support_response',
    title: 'Support Ticket Update',
    category: 'support',
    notificationType: 'support_ticket_response',
    body: 'Rentmaikar: Hi {{first_name}}, support ticket #{{ticket_id}} has been updated by our team: "{{support_message}}". View in your portal.',
    description: 'Notification of support agent reply or resolution.',
    parameters: ['first_name', 'ticket_id', 'support_message'],
    suggestedForEvents: ['ticket_replied', 'ticket_resolved'],
  },
];

// GSM-7 standard alphabet character set check
const GSM_7_REGEX = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1BÆæßÉ !\"#¤%&'()*+,\-.\/0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà\f^{}\\[~\]|€]*$/;

export interface SmsSegmentInfo {
  characterCount: number;
  encoding: 'GSM-7' | 'UCS-2';
  segments: number;
  maxCharsPerSegment: number;
  charsRemainingInSegment: number;
  effectiveTotalChars: number;
  optOutCharsIncluded: number;
}

/**
 * Calculates accurate SMS segments according to telecommunications industry standards.
 * Single GSM-7 message: 160 characters. Concatenated GSM-7: 153 chars per segment.
 * Single UCS-2 message: 70 characters. Concatenated UCS-2: 67 chars per segment.
 */
export function calculateSmsSegments(text: string, includeOptOut = false): SmsSegmentInfo {
  const optOutSuffix = '\n\nReply STOP to opt out.';
  const hasOptOutAlready = text.toLowerCase().includes('stop to opt out');
  const needsOptOut = includeOptOut && !hasOptOutAlready;
  const fullText = needsOptOut ? `${text.trim()}${optOutSuffix}` : text;

  const optOutCharsIncluded = needsOptOut ? optOutSuffix.length : 0;
  const characterCount = fullText.length;

  const isGsm7 = GSM_7_REGEX.test(fullText);
  const encoding = isGsm7 ? 'GSM-7' : 'UCS-2';

  let segments = 1;
  let maxCharsPerSegment = isGsm7 ? 160 : 70;
  let charsRemainingInSegment = maxCharsPerSegment - characterCount;

  if (isGsm7) {
    if (characterCount <= 160) {
      segments = characterCount === 0 ? 0 : 1;
      maxCharsPerSegment = 160;
      charsRemainingInSegment = 160 - characterCount;
    } else {
      maxCharsPerSegment = 153;
      segments = Math.ceil(characterCount / 153);
      charsRemainingInSegment = segments * 153 - characterCount;
    }
  } else {
    // Unicode UCS-2
    if (characterCount <= 70) {
      segments = characterCount === 0 ? 0 : 1;
      maxCharsPerSegment = 70;
      charsRemainingInSegment = 70 - characterCount;
    } else {
      maxCharsPerSegment = 67;
      segments = Math.ceil(characterCount / 67);
      charsRemainingInSegment = segments * 67 - characterCount;
    }
  }

  return {
    characterCount,
    encoding,
    segments: Math.max(1, segments),
    maxCharsPerSegment,
    charsRemainingInSegment: Math.max(0, charsRemainingInSegment),
    effectiveTotalChars: characterCount,
    optOutCharsIncluded,
  };
}

export interface SmsProviderRouting {
  provider: 'termii' | 'sent' | 'twilio';
  providerName: string;
  senderId: string;
  fallbackProvider?: string;
  region: 'Nigeria' | 'USA' | 'Global';
  description: string;
  inboundWebhook: string;
}

/**
 * Determines designated service provider and sender ID/phone number based on platform rules.
 */
export function getSmsProviderAndSender(phone?: string | null, regionCode?: string | null): SmsProviderRouting {
  const cleanPhone = (phone || '').trim().replace(/\s+/g, '');
  const isNigeria = cleanPhone.startsWith('+234') || regionCode?.toUpperCase() === 'NG' || regionCode?.toUpperCase() === 'NIGERIA';
  const isNorthAmerica = cleanPhone.startsWith('+1') || regionCode?.toUpperCase() === 'US' || regionCode?.toUpperCase() === 'USA' || regionCode?.toUpperCase() === 'CA';

  if (isNigeria) {
    return {
      provider: 'termii',
      providerName: 'Termii (Nigeria)',
      senderId: 'Rentmaikar',
      fallbackProvider: 'Sent.dm',
      region: 'Nigeria',
      description: 'Routed through Termii direct telecom route for Nigerian local networks (MTN, Airtel, Glo, 9mobile) with registered sender ID "Rentmaikar".',
      inboundWebhook: '/functions/v1/termii-webhook',
    };
  }

  if (isNorthAmerica) {
    return {
      provider: 'sent',
      providerName: 'Sent.dm / Twilio (USA)',
      senderId: '+1 (608) 384-3932',
      fallbackProvider: 'Twilio A2P 10DLC',
      region: 'USA',
      description: 'Routed through Sent.dm enterprise CPaaS with automated fallback to Twilio 10DLC verified number +1 (608) 384-3932.',
      inboundWebhook: '/functions/v1/twilio-webhook',
    };
  }

  return {
    provider: 'sent',
    providerName: 'Sent.dm (Global)',
    senderId: 'Rentmaikar',
    fallbackProvider: 'Twilio Global',
    region: 'Global',
    description: 'Routed via Sent.dm international gateway with local route optimization.',
    inboundWebhook: '/functions/v1/sent-inbound',
  };
}
