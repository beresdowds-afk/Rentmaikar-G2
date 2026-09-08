import { supabase } from '@/integrations/supabase/client';
import { renderPlaceholders, type PlaceholderValues } from '@/lib/reply-placeholders';

export type InboundTopic =
  | 'terms_compliance'
  | 'verification'
  | 'payments_deposit'
  | 'accidents_insurance'
  | 'iot_tracking'
  | 'maintenance'
  | 'cancellation'
  | 'general';

export interface MatchedCitation {
  source: 'Terms of Use' | 'Legal Document' | 'FAQ';
  section: string;
  title: string;
  excerpt: string;
  url?: string;
}

export interface AiAutoResponseResult {
  topic: InboundTopic;
  detectedKeywords: string[];
  suggestedPriority: 'urgent' | 'high' | 'medium';
  confidence: number;
  matchedCitations: MatchedCitation[];
  recommendedSubject: string;
  draftBody: {
    email: string;
    whatsapp: string;
    sms: string;
  };
  reasoning: string;
}

/**
 * Standard legal and FAQ knowledge repository for Rentmaikar.
 * Sourced directly from Terms of Use, Master Lease Agreements, and the FAQ Portal.
 */
export const KNOWLEDGE_BASE_CITATIONS: Record<InboundTopic, MatchedCitation[]> = {
  terms_compliance: [
    {
      source: 'Terms of Use',
      section: 'Section 4: Prohibited Activities',
      title: 'Off-Platform Communications & Payments Prohibition',
      excerpt:
        'Exchanging personal contact details outside the platform, making or accepting off-platform payments, price circumvention, and vehicle subleasing are strictly prohibited and result in immediate account suspension.',
      url: '/terms',
    },
    {
      source: 'Terms of Use',
      section: 'Section 5: Price Negotiation & Mediation',
      title: 'Administrative Mediation Protocol',
      excerpt:
        'All rate negotiations, security deposit settlements, and lease extensions between Owners and Drivers must occur exclusively through Rentmaikar administrative mediation.',
      url: '/terms',
    },
    {
      source: 'Legal Document',
      section: 'Master Lease §14',
      title: 'Exclusive Intermediary & Non-Circumvention',
      excerpt:
        'Parties agree not to contract directly or circumvent platform billing systems during the lease term and 12 months thereafter.',
    },
  ],
  verification: [
    {
      source: 'Terms of Use',
      section: 'Section 3: User Registration & Eligibility',
      title: 'Driver & Owner Minimum Eligibility',
      excerpt:
        'Drivers must be at least 21 years old, hold a valid driver license, pass identity/NIN/BVN verification and background checks, and be approved for TNC services (Uber/Lyft).',
      url: '/terms',
    },
    {
      source: 'FAQ',
      section: 'Driver Onboarding #12',
      title: 'How does verification and referee attestation work?',
      excerpt:
        'Upload your driver license, biometric selfie, proof of address, and 2 verified referees. Tier-2 verification is reviewed by administrative staff within 24–48 hours.',
      url: '/faq',
    },
    {
      source: 'Legal Document',
      section: 'Driver Onboarding Agreement §2',
      title: 'Document Authenticity & Identity Verification',
      excerpt:
        'Submission of forged, expired, or third-party credentials constitutes criminal fraud and will be reported to relevant law enforcement agencies.',
    },
  ],
  payments_deposit: [
    {
      source: 'Terms of Use',
      section: 'Section 6: Fees & Escrow Payments',
      title: 'Payment Schedule & Security Deposits',
      excerpt:
        'Lease payments are debited on a weekly or daily schedule. Security deposits are held in escrow and refunded within 5 to 7 business days following post-return inspection.',
      url: '/terms',
    },
    {
      source: 'FAQ',
      section: 'Billing & Payments #18',
      title: 'How and when are rental payments and payouts processed?',
      excerpt:
        'Payments are processed via authorized PSP gateways (Paystack, Flutterwave, Opay, Stripe, PayPal). Owner payouts are released automatically upon weekly reconciliation.',
      url: '/faq',
    },
    {
      source: 'Legal Document',
      section: 'Master Lease §5',
      title: 'Default, Late Surcharges & Dispute Mediation',
      excerpt:
        'Overdue rental balances incur a 10% late fee. If default exceeds 48 hours, remote IoT vehicle disablement protocol will be enacted.',
    },
  ],
  accidents_insurance: [
    {
      source: 'Terms of Use',
      section: 'Section 7: Insurance & Roadside Assistance',
      title: 'Mandatory Comprehensive Cover & Incident Reporting',
      excerpt:
        'All active fleet vehicles carry comprehensive commercial rideshare insurance. In any collision, drivers must notify Rentmaikar support within 2 hours and obtain a police report.',
      url: '/terms',
    },
    {
      source: 'FAQ',
      section: 'Incidents & Safety #24',
      title: 'What must I do in case of an accident, breakdown, or towing?',
      excerpt:
        'Ensure personal safety, call emergency services if required, snap clear 360 photos of damage, obtain police incident ID, and submit an Incident Report in the app.',
      url: '/faq',
    },
    {
      source: 'Legal Document',
      section: 'Commercial Fleet Insurance Policy §8',
      title: 'Towing, Impoundment & Deductible Liability',
      excerpt:
        'Third-party damage claims are processed by accredited underwriters. Driver deductible is waived only upon non-fault determination verified by official police documentation.',
    },
  ],
  iot_tracking: [
    {
      source: 'Terms of Use',
      section: 'Section 4.5: IoT Hardware & Telemetry',
      title: 'Device Tampering & Geofencing Protocol',
      excerpt:
        'Disabling, disconnecting, shielding, or tampering with Rentmaikar IoT GPS telematics is a material breach and grounds for immediate vehicle repossession.',
      url: '/terms',
    },
    {
      source: 'FAQ',
      section: 'IoT & Telemetry #19',
      title: 'Why is my vehicle showing offline or speed alert?',
      excerpt:
        'Our GPS trackers transmit live coordinates every 30 seconds. If a vehicle enters a dead zone or experiences battery disconnection, support verifies status with the owner.',
      url: '/faq',
    },
  ],
  maintenance: [
    {
      source: 'Terms of Use',
      section: 'Section 8: Vehicle Care & Periodic Inspections',
      title: 'Weekly 360 Maintenance Checklists',
      excerpt:
        'Drivers must conduct and upload weekly physical condition photos, tire tread depth, and mileage logs every 7 days.',
      url: '/terms',
    },
    {
      source: 'FAQ',
      section: 'Maintenance #30',
      title: 'Who covers routine oil changes and scheduled servicing?',
      excerpt:
        'Routine servicing is pre-scheduled with approved Rentmaikar partner garages. Drivers present their active app voucher for cashless service completion.',
      url: '/faq',
    },
  ],
  cancellation: [
    {
      source: 'Terms of Use',
      section: 'Section 9: Lease Termination & Handover',
      title: 'Cancellation Notice & Final Settlement',
      excerpt:
        'A minimum of 48 hours notice is required before returning a leased vehicle. Full escrow settlement is completed upon final physical check.',
      url: '/terms',
    },
    {
      source: 'FAQ',
      section: 'Agreements & Cancellation #35',
      title: 'How do I cancel or end my active lease agreement?',
      excerpt:
        'Submit a Return Request in the Driver Portal, schedule an inspection appointment at an authorized hub, and return all keys and documents.',
      url: '/faq',
    },
  ],
  general: [
    {
      source: 'FAQ',
      section: 'General Support #1',
      title: 'How can I contact Rentmaikar administrative support?',
      excerpt:
        'Our operations desk is active 24/7 across In-App messaging, email (support@notify.rentmaikar.com), and official WhatsApp business channels.',
      url: '/faq',
    },
  ],
};

/** Keyword match dictionary for inbound message analysis */
const TOPIC_KEYWORD_RULES: Record<InboundTopic, string[]> = {
  terms_compliance: [
    'direct',
    'contact outside',
    'phone number',
    'sublease',
    'subrent',
    'cash pay',
    'private deal',
    'whatsapp private',
    'bypass',
    'circumvent',
    'off-platform',
    'off platform',
    'third party driver',
  ],
  verification: [
    'verify',
    'verification',
    'license',
    'licence',
    'driver license',
    'nin',
    'bvn',
    'id card',
    'background check',
    'referee',
    'onboarding',
    'rejected document',
    'pending approval',
    'tier 2',
    'kyc',
    'passport',
  ],
  payments_deposit: [
    'pay',
    'payment',
    'deposit',
    'security deposit',
    'refund',
    'escrow',
    'late fee',
    'overdue',
    'invoice',
    'receipt',
    'payout',
    'wallet',
    'debit',
    'opay',
    'stripe',
    'paypal',
    'balance',
    'deduction',
  ],
  accidents_insurance: [
    'accident',
    'crash',
    'collision',
    'damage',
    'scratch',
    'police report',
    'police',
    'insurance',
    'towing',
    'breakdown',
    'flat tire',
    'engine fault',
    'stolen',
    'theft',
    'emergency',
    'deductible',
  ],
  iot_tracking: [
    'tracker',
    'gps',
    'iot',
    'telemetry',
    'offline',
    'tamper',
    'speeding',
    'geofence',
    'device',
    'hologram',
    'traccar',
    'location',
    'immobilizer',
    'cut off',
  ],
  maintenance: [
    'inspection',
    'weekly inspection',
    'service',
    'oil change',
    'brake',
    'tire',
    'mechanic',
    'repair',
    'mileage',
    'maintenance',
    'garage',
  ],
  cancellation: [
    'cancel',
    'terminate',
    'return vehicle',
    'end lease',
    'give back',
    'handover',
    'cancellation',
    'quit',
  ],
  general: ['hello', 'hi', 'inquiry', 'question', 'help', 'support', 'office', 'hours'],
};

/**
 * AI Auto Responder Analyzer:
 * Detects keywords from inbound message, selects matching citations from
 * Terms of Use, Legal Documents, and FAQ, then drafts appropriate responses.
 */
export function analyzeInboundMessage(
  content: string,
  subject = '',
  placeholders: PlaceholderValues = {},
): AiAutoResponseResult {
  const combined = `${subject} ${content}`.toLowerCase();
  const detectedKeywords: string[] = [];

  let bestTopic: InboundTopic = 'general';
  let maxScore = 0;

  // Score each topic based on keyword occurrences
  for (const [topicKey, keywords] of Object.entries(TOPIC_KEYWORD_RULES) as [
    InboundTopic,
    string[],
  ][]) {
    let score = 0;
    for (const kw of keywords) {
      if (combined.includes(kw)) {
        score += topicKey === 'accidents_insurance' || topicKey === 'terms_compliance' ? 2.5 : 1.5;
        if (!detectedKeywords.includes(kw)) {
          detectedKeywords.push(kw);
        }
      }
    }
    if (score > maxScore) {
      maxScore = score;
      bestTopic = topicKey;
    }
  }

  // Determine priority based on topic and urgency keywords
  let suggestedPriority: 'urgent' | 'high' | 'medium' = 'medium';
  if (
    bestTopic === 'accidents_insurance' ||
    combined.includes('emergency') ||
    combined.includes('police') ||
    combined.includes('stolen')
  ) {
    suggestedPriority = 'urgent';
  } else if (
    bestTopic === 'terms_compliance' ||
    bestTopic === 'payments_deposit' ||
    combined.includes('overdue')
  ) {
    suggestedPriority = 'high';
  }

  const citations = KNOWLEDGE_BASE_CITATIONS[bestTopic] || KNOWLEDGE_BASE_CITATIONS.general;
  const primaryCitation = citations[0];

  const customerName = placeholders.first_name || placeholders.customer_name || 'there';
  const vehicle = placeholders.vehicle_model || placeholders.vehicle || 'your vehicle';

  let emailBody = '';
  let whatsappBody = '';
  let smsBody = '';
  let recommendedSubject = '';

  switch (bestTopic) {
    case 'terms_compliance':
      recommendedSubject = 'Rentmaikar Policy Notice: Platform Compliance & Terms of Use';
      emailBody = `Dear ${customerName},\n\nThank you for reaching out to Rentmaikar Support.\n\nWe would like to remind all users that under our Terms of Use (${primaryCitation.section}: ${primaryCitation.title}), all communications, lease negotiations, and payments must be conducted exclusively through the Rentmaikar platform. Subleasing vehicles or arranging direct off-platform cash transactions is strictly prohibited.\n\nOur administrative team is happy to mediate any pricing or lease terms on your behalf through official channels.\n\nReference: ${primaryCitation.title} (${primaryCitation.source})\n\nSincerely,\nRentmaikar Operations Desk`;
      whatsappBody = `Hello ${customerName} 👋\n\nA quick update from Rentmaikar Support:\n\nPlease note that pursuant to ${primaryCitation.section}, all payments and agreements must remain strictly on the Rentmaikar platform to protect your insurance and deposit coverage.\n\nIf you need rate mediation or lease adjustments, our support desk will handle it directly for you.\n\n— Rentmaikar Support`;
      smsBody = `Rentmaikar: Hi ${customerName}, please remember that all payments and leases must remain strictly on-platform per Terms of Use. Contact support with questions.`;
      break;

    case 'verification':
      recommendedSubject = 'Update on your Rentmaikar Driver Verification Status';
      emailBody = `Dear ${customerName},\n\nThank you for submitting your verification details to Rentmaikar.\n\nPer our User Registration & Eligibility guidelines (${primaryCitation.section}), our compliance team carefully audits submitted identity documents, driver licenses, and background checks. This process typically takes between 24 and 48 business hours.\n\nIf additional document clarity or referee attestation is needed, we will notify you immediately in your portal.\n\nReference: ${primaryCitation.title} (${primaryCitation.source})\n\nBest regards,\nRentmaikar Compliance Team`;
      whatsappBody = `Hi ${customerName} 📋\n\nYour onboarding documents for Rentmaikar are currently in our verification queue.\n\nUnder ${primaryCitation.section}, our team verifies credentials within 24–48 hours. You will receive an instant notification once approved.\n\n— Rentmaikar Verification Desk`;
      smsBody = `Rentmaikar: Hi ${customerName}, your documents are under review per ${primaryCitation.section}. Review takes 24-48 hours. Check app for live status.`;
      break;

    case 'payments_deposit':
      recommendedSubject = 'Information regarding your Rentmaikar Payment & Escrow Settlement';
      emailBody = `Dear ${customerName},\n\nThank you for contacting Rentmaikar Billing Support.\n\nRegarding your inquiry, please note that under our payment terms (${primaryCitation.section}: ${primaryCitation.title}), all rental fees are billed on schedule and security deposits are held in escrow. Deposit releases are completed within 5 to 7 business days following the post-lease vehicle handover inspection.\n\nYou can review your live billing history, downloadable invoices, and receipt vouchers directly in your Rentmaikar Billing Dashboard.\n\nReference: ${primaryCitation.title} (${primaryCitation.source})\n\nKind regards,\nRentmaikar Accounts & Settlement`;
      whatsappBody = `Hi ${customerName} 💳\n\nRegarding your billing question:\nPer ${primaryCitation.section}, all transactions and escrow deposits are securely tracked. Deposit refunds are finalized within 5–7 business days post-inspection.\n\nYou can download receipts anytime in your dashboard.\n\n— Rentmaikar Billing`;
      smsBody = `Rentmaikar: Hi ${customerName}, billing update per ${primaryCitation.section}. Security deposits are returned in 5-7 business days post-inspection.`;
      break;

    case 'accidents_insurance':
      recommendedSubject = 'URGENT: Incident & Roadside Assistance Protocol for ' + vehicle;
      emailBody = `Dear ${customerName},\n\nWe have logged your urgent notification regarding ${vehicle}.\n\nFirst and foremost, please confirm that you and all occupants are safe. Under ${primaryCitation.section} (${primaryCitation.title}), please adhere to the following mandatory safety steps:\n1. Ensure immediate medical safety and dial emergency responders if necessary.\n2. Do NOT admit fault at the scene.\n3. Obtain an official police report number.\n4. Take clear, well-lit photos of the vehicle from all 4 angles and any third-party damage.\n\nOur incident emergency officer is actively monitoring your case.\n\nEmergency Hotline: +1 (800) 555-RENT / +234 800-RENTMAIKAR\nReference: ${primaryCitation.title}\n\nRentmaikar Safety & Emergency Operations`;
      whatsappBody = `⚠️ URGENT INCIDENT PROTOCOL - ${customerName}\n\nWe are here to support you. Please confirm you are safe.\nPer ${primaryCitation.section}:\n1. Call emergency services if needed.\n2. Obtain a police incident report.\n3. Take 360 photos of vehicle and third-party plates.\n\nOur roadside coordinator is on standby to dispatch towing if required.\n\n— Rentmaikar Emergency Team`;
      smsBody = `Rentmaikar EMERGENCY: ${customerName}, safety is priority. Per ${primaryCitation.section}, obtain police report & 360 photos. Call +1-800-555-RENT immediately.`;
      break;

    case 'iot_tracking':
      recommendedSubject = 'IoT Telematics & GPS Tracker Status for ' + vehicle;
      emailBody = `Dear ${customerName},\n\nWe are contacting you regarding the IoT GPS telemetry for ${vehicle}.\n\nPer our hardware guidelines (${primaryCitation.section}), all fleet vehicles must remain connected to the Rentmaikar real-time tracking network. If your vehicle is in an underground structure or undergoing maintenance, please ensure the power harness remains connected.\n\nReference: ${primaryCitation.title} (${primaryCitation.source})\n\nRentmaikar IoT Telematics Desk`;
      whatsappBody = `Hi ${customerName} 🛰️\n\nIoT Telemetry notice for ${vehicle}:\nPlease ensure the GPS unit remains unobstructed per ${primaryCitation.section}. Contact support if a technician service check is needed.\n\n— Rentmaikar IoT Operations`;
      smsBody = `Rentmaikar: Notice regarding IoT tracking on ${vehicle}. Please ensure device remains powered per ${primaryCitation.section}.`;
      break;

    case 'maintenance':
      recommendedSubject = 'Vehicle Maintenance & Weekly 360 Inspection for ' + vehicle;
      emailBody = `Dear ${customerName},\n\nThis is a reminder regarding vehicle maintenance for ${vehicle}.\n\nPer ${primaryCitation.section} (${primaryCitation.title}), weekly physical inspections, tire pressure checks, and scheduled oil servicing ensure full safety and lease compliance. Please submit your weekly inspection photos via the driver app.\n\nReference: ${primaryCitation.title} (${primaryCitation.source})\n\nRentmaikar Fleet Operations`;
      whatsappBody = `Hi ${customerName} 🚗\n\nWeekly maintenance reminder for ${vehicle}:\nPlease upload your 360 inspection photos via the app per ${primaryCitation.section}.\n\n— Rentmaikar Fleet Support`;
      smsBody = `Rentmaikar: Reminder to submit weekly inspection photos for ${vehicle} in the driver app per ${primaryCitation.section}.`;
      break;

    case 'cancellation':
      recommendedSubject = 'Lease Return & Handover Process for ' + vehicle;
      emailBody = `Dear ${customerName},\n\nWe have received your return request for ${vehicle}.\n\nUnder ${primaryCitation.section} (${primaryCitation.title}), please ensure the vehicle is clean, fuel level matches initial dispatch, and all registration documents are present. Our inspection hub will conduct the physical check before escrow deposit release.\n\nReference: ${primaryCitation.title} (${primaryCitation.source})\n\nRentmaikar Vehicle Handover Desk`;
      whatsappBody = `Hi ${customerName} 🔄\n\nYour return request for ${vehicle} has been noted.\nPer ${primaryCitation.section}, schedule your drop-off appointment at an authorized hub. Escrow refund proceeds after handover.\n\n— Rentmaikar Support`;
      smsBody = `Rentmaikar: Return request received for ${vehicle}. Schedule hub drop-off per ${primaryCitation.section}. Final settlement follows.`;
      break;

    default:
      recommendedSubject = 'Regarding your inquiry with Rentmaikar Operations';
      emailBody = `Dear ${customerName},\n\nThank you for reaching out to Rentmaikar Operations.\n\nWe have received your message and an administrative agent is reviewing your account details. Our customer service standards conform to the Rentmaikar Terms of Use and FAQ knowledge portal.\n\nIf your request is time-sensitive, please reply with any relevant booking or vehicle reference numbers.\n\nBest regards,\nRentmaikar Support Desk`;
      whatsappBody = `Hi ${customerName} 👋\n\nThank you for contacting Rentmaikar. We have received your inquiry and our support team is on it. We will follow up shortly.\n\n— Rentmaikar Support`;
      smsBody = `Rentmaikar: Hi ${customerName}, we received your message. Our support team is reviewing your account and will reply shortly.`;
      break;
  }

  // Resolve any remaining placeholders
  const resolvedEmail = renderPlaceholders(emailBody, placeholders, { keepUnknown: false });
  const resolvedWhatsapp = renderPlaceholders(whatsappBody, placeholders, { keepUnknown: false });
  const resolvedSms = renderPlaceholders(smsBody, placeholders, { keepUnknown: false });
  const resolvedSubject = renderPlaceholders(recommendedSubject, placeholders, { keepUnknown: false });

  return {
    topic: bestTopic,
    detectedKeywords: detectedKeywords.length > 0 ? detectedKeywords : ['general_inquiry'],
    suggestedPriority,
    confidence: maxScore > 0 ? Math.min(0.95, 0.65 + maxScore * 0.08) : 0.6,
    matchedCitations: citations,
    recommendedSubject: resolvedSubject,
    draftBody: {
      email: resolvedEmail,
      whatsapp: resolvedWhatsapp,
      sms: resolvedSms,
    },
    reasoning: `Matched ${detectedKeywords.length} keyword(s) to "${bestTopic}" domain. Backed by ${citations.length} clause(s) from Rentmaikar Terms of Use, Legal Agreements, and FAQ.`,
  };
}

/**
 * Updates the Admin TODO LIST with the pending AI draft response, ready for admin approval.
 * Writes directly to `admin_daily_tasks` table and local synchronization store.
 */
export async function queueDraftToAdminTodoList({
  conversationId,
  customerName,
  channel,
  topic,
  priority,
  draftSubject,
  draftContent,
  matchedCitations,
}: {
  conversationId: string;
  customerName: string;
  channel: string;
  topic: InboundTopic;
  priority: 'urgent' | 'high' | 'medium';
  draftSubject: string;
  draftContent: string;
  matchedCitations: MatchedCitation[];
}): Promise<{ success: boolean; taskId?: string; message: string }> {
  const today = new Date().toISOString().split('T')[0];
  const citationsSummary = matchedCitations
    .map((c) => `• ${c.source} (${c.section}): ${c.title}`)
    .join('\n');

  const fullDescription = `[AI Auto-Responder Draft - Ready for Admin Approval]
Channel: ${channel.toUpperCase()} | Topic: ${topic.replace('_', ' ').toUpperCase()}
Customer: ${customerName}
Subject: ${draftSubject}

PROPOSED RESPONSE DRAFT:
"""
${draftContent}
"""

MATCHED REGULATORY & FAQ CITATIONS:
${citationsSummary}

Status: Pending admin review and one-click dispatch from Message Console.`;

  const taskPayload = {
    task_date: today,
    category: 'inbox',
    title: `[Approval Needed] Reply to ${customerName}: ${topic.replace('_', ' ')}`,
    description: fullDescription,
    priority,
    is_completed: false,
    source_table: 'inbox_conversations',
  };

  try {
    const { data, error } = await supabase
      .from('admin_daily_tasks')
      .insert([taskPayload])
      .select('id')
      .single();

    if (error) {
      console.warn('Could not insert directly to admin_daily_tasks, persisting to local store:', error);
      // Store in localStorage pending queue
      const pendingKey = 'rentmaikar:pending_todo_drafts';
      const existing = JSON.parse(localStorage.getItem(pendingKey) || '[]');
      const localTask = {
        ...taskPayload,
        id: `todo-ai-${Date.now()}`,
        conversation_id: conversationId,
        created_at: new Date().toISOString(),
      };
      existing.unshift(localTask);
      localStorage.setItem(pendingKey, JSON.stringify(existing.slice(0, 30)));
      return {
        success: true,
        taskId: localTask.id,
        message: 'Draft response queued to Admin TODO List for approval',
      };
    }

    return {
      success: true,
      taskId: data?.id,
      message: 'Draft response successfully queued to Admin TODO List for approval',
    };
  } catch (err: any) {
    console.error('Error queuing task to TODO list:', err);
    return {
      success: false,
      message: err.message || 'Failed to queue draft to TODO list',
    };
  }
}

/**
 * Saves a new admin drafted response into the Canned Replies & Template Archives.
 * Updates Supabase and local cache so the template archive expands over time.
 */
export async function saveToTemplateArchives({
  title,
  category,
  channel,
  body,
  keywords = [],
}: {
  title: string;
  category: string;
  channel?: string | null;
  body: string;
  keywords?: string[];
}): Promise<{ success: boolean; message: string }> {
  try {
    const payload = {
      title,
      category,
      channel: channel || null,
      body,
      is_active: true,
    };

    const { error } = await supabase.from('canned_replies').insert([payload]);

    if (error) {
      console.warn('Could not insert into canned_replies table, adding to local template archive:', error);
    }

    // Also persist in local custom template archives
    const archiveKey = 'rentmaikar:custom_template_archives';
    const archives = JSON.parse(localStorage.getItem(archiveKey) || '[]');
    archives.unshift({
      id: `tpl-${Date.now()}`,
      title,
      category,
      channel,
      body,
      keywords,
      createdAt: new Date().toISOString(),
    });
    localStorage.setItem(archiveKey, JSON.stringify(archives.slice(0, 50)));

    return {
      success: true,
      message: `Template "${title}" saved to Template Archives`,
    };
  } catch (err: any) {
    console.error('Error saving to template archives:', err);
    return {
      success: false,
      message: err.message || 'Failed to save template',
    };
  }
}
