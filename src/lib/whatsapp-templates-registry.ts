/**
 * Canonical WhatsApp Message Templates Registry
 *
 * Defines the complete library of Meta-approved WhatsApp HSM (Highly Structured Message)
 * templates and session messages used across Rentmaikar.
 *
 * Rules:
 * 1. Global / USA sends route via Sent.dm (+1 608 548-9220) with Twilio WhatsApp as regional fallback.
 * 2. Nigeria sends route via Termii / Sent.dm (+234 916 307 2576 or Alpha Sender "Rentmaikar").
 * 3. Master Ops Communications Endpoint: +234 916 307 2576.
 */

export type WhatsAppCategory =
  | 'bookings'
  | 'payments'
  | 'fleet'
  | 'verify'
  | 'negotiations'
  | 'support';

export interface WhatsAppTemplateDefinition {
  id: string;
  name: string;
  title?: string;
  category: WhatsAppCategory;
  metaTemplateName: string;
  description: string;
  parameters: string[];
  defaultBody: string;
  body?: string;
  quickReplies?: string[];
  language?: string;
  designatedProvider: 'sent' | 'termii' | 'twilio' | 'whatchimp';
  senderNumber: {
    usa: string;
    nigeria: string;
  };
}

export const WHATSAPP_SENDER_CONFIG = {
  usaPublic: '+16085489220', // Sent.dm WhatsApp public sender
  usaVoiceTwilio: '+16083843932', // Twilio published 10DLC
  nigeriaMaster: '+2349163072576', // Master Operations endpoint
  nigeriaSenderId: 'Rentmaikar', // Termii WhatsApp / SMS Alpha Sender
};

export const WHATSAPP_TEMPLATES_CATALOG: WhatsAppTemplateDefinition[] = [
  // ─── BOOKINGS ───
  {
    id: 'rentmaikar_booking_confirmed',
    name: 'Booking Confirmed',
    category: 'bookings',
    metaTemplateName: 'booking_confirmed',
    description: 'Sent when a driver booking request is confirmed with pickup instructions.',
    parameters: ['user_name', 'vehicle_name', 'pickup_date', 'return_date', 'portal_url'],
    defaultBody:
      '🚗 *Booking Confirmed!*\\n\\nHi {{user_name}}, your booking for the *{{vehicle_name}}* is confirmed.\\n\\n📅 *Pickup:* {{pickup_date}}\\n📅 *Return:* {{return_date}}\\n\\n📍 Detailed pickup location & vehicle checklist are available in your portal:\\n{{portal_url}}\\n\\nReply *HELP* if you have any questions.\\n— Rentmaikar Team',
    quickReplies: ['VIEW DETAILS', 'HELP'],
    designatedProvider: 'sent',
    senderNumber: {
      usa: WHATSAPP_SENDER_CONFIG.usaPublic,
      nigeria: WHATSAPP_SENDER_CONFIG.nigeriaMaster,
    },
  },
  {
    id: 'rentmaikar_pickup_reminder',
    name: 'Pickup Reminder',
    category: 'bookings',
    metaTemplateName: 'pickup_reminder',
    description: '24-hour reminder before vehicle handoff at the regional hub.',
    parameters: ['user_name', 'vehicle_name', 'pickup_time', 'hub_location'],
    defaultBody:
      '⏰ *Pickup Reminder*\\n\\nHi {{user_name}}, this is a reminder that your vehicle pickup is scheduled for tomorrow.\\n\\n🚗 *Vehicle:* {{vehicle_name}}\\n⏱️ *Time:* {{pickup_time}}\\n📍 *Location:* {{hub_location}}\\n\\nPlease ensure you arrive with your valid driver license.\\nReply *OK* to confirm attendance.',
    quickReplies: ['OK', 'RESCHEDULE'],
    designatedProvider: 'sent',
    senderNumber: {
      usa: WHATSAPP_SENDER_CONFIG.usaPublic,
      nigeria: WHATSAPP_SENDER_CONFIG.nigeriaMaster,
    },
  },
  {
    id: 'rentmaikar_return_reminder',
    name: 'Rental Return Reminder',
    category: 'bookings',
    metaTemplateName: 'return_reminder',
    description: 'Notification to arrange timely vehicle return and checkout inspection.',
    parameters: ['user_name', 'vehicle_name', 'return_time', 'hub_location'],
    defaultBody:
      '🔔 *Return Reminder*\\n\\nHi {{user_name}}, your rental period for the *{{vehicle_name}}* ends today.\\n\\n⏱️ *Return By:* {{return_time}}\\n📍 *Drop-off:* {{hub_location}}\\n\\nPlease return the vehicle with equivalent fuel and completed inspection. Late returns may incur extra fees.\\nReply *DONE* once parked.',
    quickReplies: ['DONE', 'EXTEND RENTAL'],
    designatedProvider: 'sent',
    senderNumber: {
      usa: WHATSAPP_SENDER_CONFIG.usaPublic,
      nigeria: WHATSAPP_SENDER_CONFIG.nigeriaMaster,
    },
  },
  {
    id: 'rentmaikar_owner_vehicle_booked',
    name: 'Owner: Vehicle Booked',
    category: 'bookings',
    metaTemplateName: 'owner_vehicle_booked',
    description: 'Alerts vehicle hosts when their vehicle is successfully booked by a verified driver.',
    parameters: ['owner_name', 'vehicle_name', 'rental_period', 'estimated_earnings'],
    defaultBody:
      '🎉 *Great News, Host!*\\n\\nHi {{owner_name}}, your vehicle *{{vehicle_name}}* has just been booked.\\n\\n📅 *Period:* {{rental_period}}\\n💰 *Estimated Earnings:* {{estimated_earnings}}\\n\\nYou can review host terms and insurance coverage in your dashboard.',
    quickReplies: ['VIEW BOOKING'],
    designatedProvider: 'sent',
    senderNumber: {
      usa: WHATSAPP_SENDER_CONFIG.usaPublic,
      nigeria: WHATSAPP_SENDER_CONFIG.nigeriaMaster,
    },
  },

  // ─── PAYMENTS & INVOICES ───
  {
    id: 'rentmaikar_payment_reminder',
    name: 'Payment Due Reminder',
    category: 'payments',
    metaTemplateName: 'payment_reminder_72h',
    description: 'Heads-up alert sent 72 hours before recurring rent invoice is due.',
    parameters: ['user_name', 'vehicle_name', 'amount_due', 'due_date', 'payment_link'],
    defaultBody:
      '👋 *Rent Due Reminder*\\n\\nHi {{user_name}}, a quick reminder that your recurring rent for *{{vehicle_name}}* is scheduled.\\n\\n💰 *Amount Due:* {{amount_due}}\\n📅 *Due Date:* {{due_date}}\\n\\nPay anytime to avoid any disruption to vehicle telematics:\\n{{payment_link}}\\n\\nReply *PAY* to confirm payment.',
    quickReplies: ['PAY NOW', 'VIEW INVOICE'],
    designatedProvider: 'sent',
    senderNumber: {
      usa: WHATSAPP_SENDER_CONFIG.usaPublic,
      nigeria: WHATSAPP_SENDER_CONFIG.nigeriaMaster,
    },
  },
  {
    id: 'rentmaikar_payment_overdue',
    name: 'Urgent Overdue Alert',
    category: 'payments',
    metaTemplateName: 'payment_overdue_24h',
    description: 'High-priority overdue warning notifying driver of late fees and potential immobilizer lock.',
    parameters: ['user_name', 'vehicle_name', 'amount_due', 'payment_link'],
    defaultBody:
      '🚨 *Urgent: Overdue Payment Notice*\\n\\nHi {{user_name}}, your rental payment of *{{amount_due}}* for *{{vehicle_name}}* is now past due.\\n\\n⚠️ A 10% late fee applies. Continued non-payment will trigger telematics immobilizer shutdown.\\n\\nPlease settle your balance immediately:\\n{{payment_link}}\\n\\nContact ops right away if you need assistance.',
    quickReplies: ['PAY IMMEDIATELY', 'CALL SUPPORT'],
    designatedProvider: 'sent',
    senderNumber: {
      usa: WHATSAPP_SENDER_CONFIG.usaPublic,
      nigeria: WHATSAPP_SENDER_CONFIG.nigeriaMaster,
    },
  },
  {
    id: 'rentmaikar_payment_received',
    name: 'Payment Received Receipt',
    category: 'payments',
    metaTemplateName: 'payment_success',
    description: 'Confirmation receipt sent instantly upon successful invoice payment.',
    parameters: ['user_name', 'amount_paid', 'vehicle_name', 'receipt_url'],
    defaultBody:
      '✅ *Payment Received — Thank You!*\\n\\nHi {{user_name}}, we confirmed receipt of *{{amount_paid}}* for *{{vehicle_name}}*.\\n\\nYour rental remains fully active with unrestricted access. Your official receipt is ready:\\n{{receipt_url}}\\n\\nSafe travels!\\n— Rentmaikar Billing',
    quickReplies: ['VIEW RECEIPT'],
    designatedProvider: 'sent',
    senderNumber: {
      usa: WHATSAPP_SENDER_CONFIG.usaPublic,
      nigeria: WHATSAPP_SENDER_CONFIG.nigeriaMaster,
    },
  },
  {
    id: 'rentmaikar_owner_payout_processed',
    name: 'Host Payout Processed',
    category: 'payments',
    metaTemplateName: 'owner_payout',
    description: 'Notifies vehicle owners that weekly earnings have been transferred to their bank account.',
    parameters: ['owner_name', 'amount', 'currency', 'payout_date'],
    defaultBody:
      '💸 *Host Payout Processed*\\n\\nHi {{owner_name}}, your payout of *{{currency}} {{amount}}* was processed on {{payout_date}} to your registered payout account.\\n\\nThank you for partnering with Rentmaikar!',
    designatedProvider: 'sent',
    senderNumber: {
      usa: WHATSAPP_SENDER_CONFIG.usaPublic,
      nigeria: WHATSAPP_SENDER_CONFIG.nigeriaMaster,
    },
  },

  // ─── FLEET & TELEMATICS ───
  {
    id: 'rentmaikar_vehicle_assigned',
    name: 'Vehicle Assigned',
    category: 'fleet',
    metaTemplateName: 'vehicle_assigned',
    description: 'Sent when a vehicle VIN is assigned to a driver with hub collection instructions.',
    parameters: ['user_name', 'vehicle_name', 'vehicle_plate', 'hub_address'],
    defaultBody:
      '🚗 *Vehicle Assigned to You!*\\n\\nHi {{user_name}}, you have been assigned to *{{vehicle_name}}* (Plate: *{{vehicle_plate}}*).\\n\\n📍 *Hub Collection Point:* {{hub_address}}\\n\\nPlease inspect the vehicle photos and confirm handover in your portal upon arrival.',
    quickReplies: ['CONFIRM HANDOVER'],
    designatedProvider: 'sent',
    senderNumber: {
      usa: WHATSAPP_SENDER_CONFIG.usaPublic,
      nigeria: WHATSAPP_SENDER_CONFIG.nigeriaMaster,
    },
  },
  {
    id: 'rentmaikar_vehicle_unlocked',
    name: 'Vehicle Remote Unlocked',
    category: 'fleet',
    metaTemplateName: 'vehicle_unlocked',
    description: 'Notification sent when immobilizer has been remotely disengaged following payment clearance.',
    parameters: ['user_name', 'vehicle_name'],
    defaultBody:
      '🔓 *Vehicle Telematics Restored*\\n\\nHi {{user_name}}, payment clearance has been registered. The engine immobilizer for *{{vehicle_name}}* has been unlocked.\\n\\nYou may now start the ignition and proceed normally. Drive safely!',
    designatedProvider: 'sent',
    senderNumber: {
      usa: WHATSAPP_SENDER_CONFIG.usaPublic,
      nigeria: WHATSAPP_SENDER_CONFIG.nigeriaMaster,
    },
  },
  {
    id: 'rentmaikar_vehicle_inspection_due',
    name: 'Weekly Inspection Due',
    category: 'fleet',
    metaTemplateName: 'inspection_reminder',
    description: 'Mandatory weekly vehicle condition and odometer upload prompt.',
    parameters: ['user_name', 'vehicle_name', 'portal_url'],
    defaultBody:
      '📋 *Weekly Inspection Required*\\n\\nHi {{user_name}}, please take 2 minutes to complete your weekly safety check and 4-angle photo upload for *{{vehicle_name}}*.\\n\\nUpload here:\\n{{portal_url}}\\n\\nCompliance keeps your maintenance warranty fully active.',
    quickReplies: ['START INSPECTION'],
    designatedProvider: 'sent',
    senderNumber: {
      usa: WHATSAPP_SENDER_CONFIG.usaPublic,
      nigeria: WHATSAPP_SENDER_CONFIG.nigeriaMaster,
    },
  },

  // ─── VERIFICATION & KYC ───
  {
    id: 'rentmaikar_welcome',
    name: 'Driver Welcome & KYC Intake',
    category: 'verify',
    metaTemplateName: 'driver_welcome',
    description: 'Initial greeting upon driver registration confirming documentation received.',
    parameters: ['user_name'],
    defaultBody:
      '👋 *Welcome to Rentmaikar!*\\n\\nHi {{user_name}}, thank you for submitting your driver onboarding profile. Our compliance officers are verifying your credentials and driving history.\\n\\nWe will update you via WhatsApp as soon as verification completes.\\n— Rentmaikar Team',
    designatedProvider: 'sent',
    senderNumber: {
      usa: WHATSAPP_SENDER_CONFIG.usaPublic,
      nigeria: WHATSAPP_SENDER_CONFIG.nigeriaMaster,
    },
  },
  {
    id: 'rentmaikar_document_verified',
    name: 'KYC Approved & Active',
    category: 'verify',
    metaTemplateName: 'document_verified',
    description: 'Celebratory notification when all driver or host documents pass compliance.',
    parameters: ['user_name', 'portal_url'],
    defaultBody:
      '🎉 *Documents Approved!*\\n\\nHi {{user_name}}, your identity and license documents have been verified.\\n\\nYou can now browse available vehicles or schedule a test drive:\\n{{portal_url}}',
    quickReplies: ['BROWSE VEHICLES'],
    designatedProvider: 'sent',
    senderNumber: {
      usa: WHATSAPP_SENDER_CONFIG.usaPublic,
      nigeria: WHATSAPP_SENDER_CONFIG.nigeriaMaster,
    },
  },
  {
    id: 'rentmaikar_document_request',
    name: 'Document Resubmission Request',
    category: 'verify',
    metaTemplateName: 'document_request',
    description: 'Sent when an uploaded document is blurry, expired, or rejected.',
    parameters: ['user_name', 'document_type', 'reason', 'upload_url'],
    defaultBody:
      '⚠️ *Action Required: Document Update*\\n\\nHi {{user_name}}, your uploaded *{{document_type}}* could not be verified.\\n\\n*Reason:* {{reason}}\\n\\nPlease upload a clear, uncropped copy via your portal:\\n{{upload_url}}\\n\\nOur team will fast-track your review.',
    quickReplies: ['UPLOAD NOW'],
    designatedProvider: 'sent',
    senderNumber: {
      usa: WHATSAPP_SENDER_CONFIG.usaPublic,
      nigeria: WHATSAPP_SENDER_CONFIG.nigeriaMaster,
    },
  },

  // ─── NEGOTIATIONS ───
  {
    id: 'rentmaikar_negotiation_approved',
    name: 'Rental Rate Approved',
    category: 'negotiations',
    metaTemplateName: 'negotiation_approved',
    description: 'Informs driver that their proposed rate offer has been accepted by host/admin.',
    parameters: ['user_name', 'vehicle_name', 'approved_rate', 'checkout_url'],
    defaultBody:
      '🤝 *Rate Offer Accepted!*\\n\\nHi {{user_name}}, your proposed rate of *{{approved_rate}}* for *{{vehicle_name}}* has been approved!\\n\\nLock in your agreement before the hold expires:\\n{{checkout_url}}',
    quickReplies: ['ACCEPT & PAY'],
    designatedProvider: 'sent',
    senderNumber: {
      usa: WHATSAPP_SENDER_CONFIG.usaPublic,
      nigeria: WHATSAPP_SENDER_CONFIG.nigeriaMaster,
    },
  },
  {
    id: 'rentmaikar_negotiation_counter',
    name: 'Counter Offer Proposed',
    category: 'negotiations',
    metaTemplateName: 'negotiation_counter_offer',
    description: 'Informs party that a counter-offer rate has been made.',
    parameters: ['user_name', 'vehicle_name', 'counter_rate', 'review_url'],
    defaultBody:
      '💡 *New Counter Offer Received*\\n\\nHi {{user_name}}, a counter-offer of *{{counter_rate}}* was proposed for *{{vehicle_name}}*.\\n\\nReview and respond directly:\\n{{review_url}}',
    quickReplies: ['REVIEW OFFER'],
    designatedProvider: 'sent',
    senderNumber: {
      usa: WHATSAPP_SENDER_CONFIG.usaPublic,
      nigeria: WHATSAPP_SENDER_CONFIG.nigeriaMaster,
    },
  },

  // ─── SUPPORT & CUSTOMER SERVICE ───
  {
    id: 'rentmaikar_support_help',
    name: '24/7 Support Menu',
    category: 'support',
    metaTemplateName: 'self_service_menu',
    description: 'Interactive self-service menu for fast assistance, roadside help, or account status.',
    parameters: ['user_name'],
    defaultBody:
      '🤖 *Rentmaikar Support Assistant*\\n\\nHello {{user_name}}, how can we assist you today?\\n\\n1️⃣ *Rental Status*\\n2️⃣ *Extend Booking*\\n3️⃣ *Roadside Emergency*\\n4️⃣ *Billing & Receipts*\\n5️⃣ *Speak with Human Agent*\\n\\nReply with a number (1–5) to proceed.',
    quickReplies: ['ROADSIDE HELP', 'HUMAN AGENT'],
    designatedProvider: 'sent',
    senderNumber: {
      usa: WHATSAPP_SENDER_CONFIG.usaPublic,
      nigeria: WHATSAPP_SENDER_CONFIG.nigeriaMaster,
    },
  },
];

// Ensure title and body are always populated for UI consumers
WHATSAPP_TEMPLATES_CATALOG.forEach((t) => {
  if (!t.title) t.title = t.name;
  if (!t.body) t.body = t.defaultBody;
});

export interface WhatsAppSenderRouting {
  designatedSenderNumber: string;
  provider: 'sent' | 'termii' | 'twilio';
  region: 'NIGERIA' | 'USA' | 'GLOBAL';
  label: string;
}

/**
 * Returns the designated WhatsApp sender phone number, provider, and routing region
 * based on recipient phone number and platform compliance rules.
 */
export function getWhatsAppSenderForRecipient(phone?: string | null): WhatsAppSenderRouting {
  const clean = (phone || '').replace(/[^\d+]/g, '');
  if (clean.startsWith('+234') || clean.startsWith('234') || clean.startsWith('0')) {
    return {
      designatedSenderNumber: WHATSAPP_SENDER_CONFIG.nigeriaMaster,
      provider: 'termii',
      region: 'NIGERIA',
      label: 'NG Master Ops (+234 916 307 2576 / Rentmaikar)',
    };
  }
  return {
    designatedSenderNumber: WHATSAPP_SENDER_CONFIG.usaPublic,
    provider: 'sent',
    region: clean.startsWith('+1') || clean.startsWith('1') ? 'USA' : 'GLOBAL',
    label: 'Global Sent.dm (+1 608 548-9220)',
  };
}
