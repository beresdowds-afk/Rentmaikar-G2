/**
 * Ready-made message drafts per business use case, one variant per channel.
 *
 * These are the starting drafts offered inside the canned replies / auto-reply
 * editors and the messaging center composer. Every draft uses the shared
 * {{placeholder}} tokens from `reply-placeholders.ts`, which are always resolved
 * before preview and before dispatch.
 */

export type UseCaseChannel = 'sms' | 'whatsapp' | 'email';

export interface UseCaseDraft {
  sms: string;
  whatsapp: string;
  email: { subject: string; body: string };
}

export interface MessageUseCase {
  id: string;
  label: string;
  group: string;
  /** Suggested keywords when the draft is used for an auto-reply rule. */
  keywords: string[];
  drafts: UseCaseDraft;
}

export const MESSAGE_USE_CASES: MessageUseCase[] = [
  {
    id: 'payment_reminder',
    label: 'Payment reminder',
    group: 'Payments',
    keywords: ['pay', 'payment', 'due'],
    drafts: {
      sms: 'Rentmaikar: Hi {{first_name}}, your {{payment_frequency}} rent of {{currency}} {{daily_rate}} for the {{vehicle}} is due. Pay in your dashboard to stay active.',
      whatsapp:
        'Hi {{first_name}} 👋\n\nYour {{payment_frequency}} rent of {{currency}} {{daily_rate}} for the {{vehicle}} ({{vehicle_plate}}) is due.\n\nPlease complete payment from your Rentmaikar dashboard to keep the vehicle active.\n\n— Rentmaikar Support',
      email: {
        subject: 'Rent payment due for your {{vehicle}}',
        body: 'Hi {{first_name}},\n\nThis is a reminder that your {{payment_frequency}} rent of {{currency}} {{daily_rate}} for the {{vehicle}} ({{vehicle_plate}}) is now due.\n\nPlease sign in to your Rentmaikar dashboard to complete the payment. If you have already paid, kindly ignore this message.\n\nThank you,\nRentmaikar Support',
      },
    },
  },
  {
    id: 'payment_received',
    label: 'Payment received',
    group: 'Payments',
    keywords: ['receipt', 'paid', 'confirmation'],
    drafts: {
      sms: 'Rentmaikar: Thanks {{first_name}}, we received your payment of {{currency}} {{daily_rate}} for the {{vehicle}} on {{today}}.',
      whatsapp:
        'Thank you {{first_name}} ✅\n\nWe received your payment of {{currency}} {{daily_rate}} for the {{vehicle}} on {{today}}. Your rental remains active.\n\n— Rentmaikar Support',
      email: {
        subject: 'Payment received — {{vehicle}}',
        body: 'Hi {{first_name}},\n\nWe have received your payment of {{currency}} {{daily_rate}} for the {{vehicle}} on {{today}}. Your rental remains active and your receipt is available in your dashboard.\n\nThank you,\nRentmaikar Support',
      },
    },
  },
  {
    id: 'overdue_warning',
    label: 'Overdue payment warning',
    group: 'Payments',
    keywords: ['overdue', 'late', 'default'],
    drafts: {
      sms: 'Rentmaikar: {{first_name}}, your rent for the {{vehicle}} is overdue. Settle today to avoid a late fee and service restriction.',
      whatsapp:
        'Hi {{first_name}},\n\nYour rent for the {{vehicle}} ({{vehicle_plate}}) is now overdue. A 10% late fee applies and access to the vehicle may be restricted.\n\nPlease settle the balance today from your dashboard, or reply here and our team will help.\n\n— Rentmaikar Support',
      email: {
        subject: 'Action needed: overdue rent for your {{vehicle}}',
        body: 'Hi {{first_name}},\n\nOur records show your rent for the {{vehicle}} ({{vehicle_plate}}) is overdue. A 10% late fee applies and continued non-payment may restrict access to the vehicle.\n\nPlease settle the outstanding balance from your dashboard today. If you are facing a difficulty, reply to this email and our team will work with you.\n\nRegards,\nRentmaikar Support',
      },
    },
  },
  {
    id: 'booking_confirmation',
    label: 'Booking confirmation',
    group: 'Bookings',
    keywords: ['booking', 'confirm', 'reservation'],
    drafts: {
      sms: 'Rentmaikar: {{first_name}}, your booking for the {{vehicle}} is confirmed from {{booking_start}} to {{booking_end}}. Pickup: {{pickup_location}}.',
      whatsapp:
        'Great news {{first_name}} 🎉\n\nYour booking for the {{vehicle}} is confirmed.\n\n• Dates: {{booking_start}} – {{booking_end}}\n• Pickup: {{pickup_location}}\n• Rate: {{currency}} {{daily_rate}} ({{payment_frequency}})\n\n— Rentmaikar Support',
      email: {
        subject: 'Your {{vehicle}} booking is confirmed',
        body: 'Hi {{first_name}},\n\nYour booking is confirmed.\n\nVehicle: {{vehicle}} ({{vehicle_plate}})\nDates: {{booking_start}} to {{booking_end}}\nPickup location: {{pickup_location}}\nRate: {{currency}} {{daily_rate}} ({{payment_frequency}})\n\nOur team will share the handover details before pickup.\n\nRegards,\nRentmaikar Support',
      },
    },
  },
  {
    id: 'pickup_details',
    label: 'Pickup / handover details',
    group: 'Bookings',
    keywords: ['pickup', 'collect', 'handover'],
    drafts: {
      sms: 'Rentmaikar: {{first_name}}, collect the {{vehicle}} at {{pickup_location}} on {{booking_start}}. Bring a valid driver licence.',
      whatsapp:
        'Hi {{first_name}},\n\nHandover details for the {{vehicle}}:\n\n• Location: {{pickup_location}}\n• Date: {{booking_start}}\n• Bring: valid driver licence and your Rentmaikar account details\n\n— Rentmaikar Support',
      email: {
        subject: 'Handover details for your {{vehicle}}',
        body: 'Hi {{first_name}},\n\nHere are your handover details.\n\nVehicle: {{vehicle}} ({{vehicle_plate}})\nPickup location: {{pickup_location}}\nDate: {{booking_start}}\n\nPlease bring a valid driver licence. All communication and payments stay on the Rentmaikar platform.\n\nRegards,\nRentmaikar Support',
      },
    },
  },
  {
    id: 'document_request',
    label: 'Document upload request',
    group: 'Verification',
    keywords: ['doc', 'docs', 'document', 'upload'],
    drafts: {
      sms: 'Rentmaikar: {{first_name}}, we still need documents to complete your verification. Upload them in your dashboard to continue.',
      whatsapp:
        'Hi {{first_name}},\n\nTo complete your verification we still need your outstanding documents (driver licence and proof of address).\n\nUpload them from your Rentmaikar dashboard and we will review within 24 hours.\n\n— Rentmaikar Support',
      email: {
        subject: 'Documents needed to complete your verification',
        body: 'Hi {{first_name}},\n\nTo finish your Rentmaikar verification we still need your outstanding documents, including a valid government driver licence.\n\nPlease upload them from your dashboard. Our team reviews new uploads within 24 hours.\n\nRegards,\nRentmaikar Support',
      },
    },
  },
  {
    id: 'document_expiry',
    label: 'Document expiring soon',
    group: 'Verification',
    keywords: ['expiry', 'expire', 'renew'],
    drafts: {
      sms: 'Rentmaikar: {{first_name}}, one of your documents expires soon. Upload a renewed copy to avoid interruption.',
      whatsapp:
        'Hi {{first_name}},\n\nOne of the documents on your Rentmaikar account is expiring soon. Please upload a renewed copy from your dashboard so your rental is not interrupted.\n\n— Rentmaikar Support',
      email: {
        subject: 'Your document expires soon',
        body: 'Hi {{first_name}},\n\nOne of the documents on your Rentmaikar account is expiring soon. Please upload a renewed copy from your dashboard so your rental and insurance cover are not interrupted.\n\nRegards,\nRentmaikar Support',
      },
    },
  },
  {
    id: 'inspection_reminder',
    label: 'Inspection reminder',
    group: 'Vehicle',
    keywords: ['inspection', 'photos', 'weekly'],
    drafts: {
      sms: 'Rentmaikar: {{first_name}}, your {{vehicle}} inspection photos are due. Submit them in your dashboard today.',
      whatsapp:
        'Hi {{first_name}},\n\nYour scheduled inspection for the {{vehicle}} ({{vehicle_plate}}) is due. Please submit the required photos from your dashboard today.\n\n— Rentmaikar Support',
      email: {
        subject: 'Inspection due for your {{vehicle}}',
        body: 'Hi {{first_name}},\n\nThe scheduled inspection for the {{vehicle}} ({{vehicle_plate}}) is now due. Please submit the required photos from your dashboard so we can keep the vehicle compliant.\n\nRegards,\nRentmaikar Support',
      },
    },
  },
  {
    id: 'vehicle_live',
    label: 'Owner: vehicle is live',
    group: 'Vehicle',
    keywords: ['listing', 'live', 'published'],
    drafts: {
      sms: 'Rentmaikar: Good news {{first_name}} — your {{vehicle}} is now live in the catalogue and visible to verified drivers.',
      whatsapp:
        'Good news {{first_name}} 🚗\n\nYour {{vehicle}} ({{vehicle_plate}}) is now live in the Rentmaikar catalogue and visible to verified drivers in {{region}}.\n\nWe will notify you as soon as a driver is matched.\n\n— Rentmaikar Support',
      email: {
        subject: 'Your {{vehicle}} is now live',
        body: 'Hi {{first_name}},\n\nYour {{vehicle}} ({{vehicle_plate}}) has been reviewed and is now live in the Rentmaikar catalogue, visible to verified drivers in {{region}}.\n\nWe will notify you as soon as a driver is matched.\n\nRegards,\nRentmaikar Support',
      },
    },
  },
  {
    id: 'owner_payout',
    label: 'Owner payout notice',
    group: 'Payments',
    keywords: ['payout', 'withdrawal', 'earnings'],
    drafts: {
      sms: 'Rentmaikar: {{first_name}}, your payout for the {{vehicle}} has been processed. Details are in your earnings dashboard.',
      whatsapp:
        'Hi {{first_name}},\n\nYour payout for the {{vehicle}} has been processed on {{today}}. The full breakdown is in your earnings dashboard.\n\n— Rentmaikar Support',
      email: {
        subject: 'Payout processed for your {{vehicle}}',
        body: 'Hi {{first_name}},\n\nYour payout for the {{vehicle}} was processed on {{today}}. The full earnings breakdown, including platform fees, is available in your earnings dashboard.\n\nRegards,\nRentmaikar Support',
      },
    },
  },
  {
    id: 'support_ack',
    label: 'Support acknowledgement',
    group: 'Support',
    keywords: ['help', 'support', 'agent', 'human'],
    drafts: {
      sms: 'Rentmaikar: Thanks {{first_name}}, we received your message. An agent will respond shortly.',
      whatsapp:
        'Hi {{first_name}} 👋\n\nThanks for reaching out — we have your message and an agent will respond shortly. Support hours: 9am–9pm ET (US) / 8am–8pm WAT (NG).\n\n— Rentmaikar Support',
      email: {
        subject: "We've received your message",
        body: 'Hi {{first_name}},\n\nThanks for contacting Rentmaikar. Your message has been logged and one of our agents will respond shortly.\n\nSupport hours: 9am–9pm ET (United States) / 8am–8pm WAT (Nigeria).\n\nRegards,\nRentmaikar Support',
      },
    },
  },
  {
    id: 'incident_followup',
    label: 'Incident follow-up',
    group: 'Support',
    keywords: ['accident', 'incident', 'damage'],
    drafts: {
      sms: 'Rentmaikar: {{first_name}}, we logged your incident report for the {{vehicle}}. Our team will call you shortly.',
      whatsapp:
        'Hi {{first_name}},\n\nWe have logged your incident report for the {{vehicle}} ({{vehicle_plate}}). Please keep the vehicle safe and do not authorise any repairs.\n\nOur team will call you shortly with next steps.\n\n— Rentmaikar Support',
      email: {
        subject: 'Incident report received — {{vehicle}}',
        body: 'Hi {{first_name}},\n\nWe have logged your incident report for the {{vehicle}} ({{vehicle_plate}}). Please keep the vehicle in a safe location and do not authorise any repairs until our team confirms next steps.\n\nAn agent will contact you shortly.\n\nRegards,\nRentmaikar Support',
      },
    },
  },
];

export const useCaseGroups = (): string[] =>
  Array.from(new Set(MESSAGE_USE_CASES.map((u) => u.group)));

/** Draft body for a use case on a channel. Email falls back to its body text. */
export const useCaseBody = (useCase: MessageUseCase, channel: UseCaseChannel): string =>
  channel === 'email' ? useCase.drafts.email.body : useCase.drafts[channel];

export const useCaseSubject = (useCase: MessageUseCase): string => useCase.drafts.email.subject;
