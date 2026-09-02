import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  selfServiceMenuMessage,
  paymentLinkMessage,
  rentalStatusMessage,
  helpMessage,
  fillTemplate,
  detectTemplateLanguage,
} from "../_shared/whatsapp-templates.ts";
import { requireServiceRole } from "../_shared/auth-guards.ts";
import { verifyTwilioRequestRaw } from "../_shared/twilio-signature.ts";
import { assertTwilioMessagingEnabled } from "../_shared/twilio-messaging-guard.ts";
import { isOptedOut, setOptOut, isStopKeyword, isStartKeyword } from "../_shared/opt-out.ts";
import { recordKeywordConsent } from "../_shared/sms-consent-audit.ts";
import {
  preloadTemplates,
  templateFromCache,
  countryCodeForPhone,
} from "../_shared/message-templates.ts";

/** Keyword replies that admins can override from the template manager. */
const KEYWORD_TEMPLATE_KEYS: Record<string, string> = {
  PAY: "kw_pay",
  PAYMENT: "kw_pay",
  STATUS: "kw_status",
  BALANCE: "kw_balance",
  HELP: "kw_help",
  SUPPORT: "kw_help",
  DOCS: "kw_doc",
  DOC: "kw_doc",
  HUMAN: "kw_human",
  STOP: "kw_stop",
  START: "kw_start",
};

const supportPhoneFor = (region: string): string =>
  region === "NIGERIA"
    ? (Deno.env.get("TWILIO_PHONE_NUMBER_NG") ?? "")
    : (Deno.env.get("TWILIO_PHONE_NUMBER") ?? "");


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ═══════════════════════════════════════════════════════════
// Intent Classification Engine
// ═══════════════════════════════════════════════════════════

interface IntentResult {
  intent: string;
  confidence: number;
  originalText: string;
  context?: {
    userType?: string;
    hasActiveRental: boolean;
    hasPendingPayment: boolean;
    region: string;
  };
}

const INTENT_MAP: Record<string, { keywords: string[]; weight: number }> = {
  // Payment
  payment_make: { keywords: ["pay now", "make payment", "settle", "pay", "payment"], weight: 1.0 },
  payment_status: { keywords: ["payment status", "paid", "money", "balance", "due", "owe", "owing"], weight: 0.9 },
  payment_history: { keywords: ["history", "transactions", "receipt", "records"], weight: 0.8 },

  // Negotiation
  negotiation_accept: { keywords: ["accept", "approve", "agreed", "accept offer", "approve price"], weight: 1.0 },
  negotiation_reject: { keywords: ["reject", "decline", "refuse", "reject offer", "decline offer"], weight: 1.0 },
  negotiation_counter: { keywords: ["counter", "counteroffer", "counter offer", "negotiate", "offer"], weight: 0.9 },
  negotiation_status: { keywords: ["price", "price status", "negotiation", "rate", "pricing"], weight: 0.8 },
  negotiation_modify: { keywords: ["modify", "modify price", "change price", "adjust rate"], weight: 0.9 },
  negotiation_lock: { keywords: ["lock", "lock price", "finalize", "confirm rate"], weight: 0.9 },

  // Document
  document_upload: { keywords: ["upload", "send document", "submit", "docs"], weight: 0.9 },
  document_status: { keywords: ["document status", "verification", "approved", "pending document"], weight: 0.8 },
  police_report: { keywords: ["police", "report", "clearance", "nur"], weight: 0.9 },

  // Vehicle
  vehicle_status: { keywords: ["my car", "vehicle status", "track", "status"], weight: 0.8 },
  vehicle_problem: { keywords: ["problem", "issue", "breakdown", "fault", "not working"], weight: 0.9 },
  vehicle_list: { keywords: ["list vehicle", "add car", "register vehicle"], weight: 0.7 },

  // Rental
  rental_extend: { keywords: ["extend", "more days", "renew", "extension"], weight: 0.9 },
  rental_return: { keywords: ["return", "drop off", "end rental", "done"], weight: 0.8 },
  rental_available: { keywords: ["available cars", "what cars", "search", "browse"], weight: 0.7 },

  // Support
  support: { keywords: ["help", "support", "agent", "human", "talk to someone"], weight: 0.9 },
  emergency: { keywords: ["emergency", "urgent", "accident", "help me", "crash", "fire", "robbery", "attack", "ambulance", "hospital"], weight: 1.0 },
};

// Emergency keywords including Yoruba/Hausa terms
const EMERGENCY_KEYWORDS = [
  "accident", "crash", "police", "ambulance", "hospital",
  "fire", "robbery", "attack", "emergency", "help me",
  "ṣànǹ", "turai", "egba mi", "agbara", "hadari", // Yoruba/Hausa
];

const classifyIntent = (text: string, context: IntentResult["context"]): IntentResult => {
  const normalizedText = text.toLowerCase().trim();

  // Emergency check first (highest priority)
  const isEmergency = EMERGENCY_KEYWORDS.some(kw => normalizedText.includes(kw));
  if (isEmergency) {
    return { intent: "emergency", confidence: 1.0, originalText: text, context };
  }

  // Score each intent
  const scores: Record<string, number> = {};
  for (const [intent, config] of Object.entries(INTENT_MAP)) {
    let score = 0;
    let matches = 0;
    for (const keyword of config.keywords) {
      if (normalizedText.includes(keyword)) {
        matches++;
        score += config.weight / config.keywords.length;
      }
    }
    // Boost exact single-word matches
    if (config.keywords.includes(normalizedText)) {
      score += 0.5;
    }
    scores[intent] = score;
  }

  // Get best match
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [bestIntent, bestScore] = sorted[0];

  if (bestScore > 0) {
    return { intent: bestIntent, confidence: Math.min(bestScore, 1.0), originalText: text, context };
  }

  return { intent: "unknown", confidence: 0, originalText: text, context };
};

// Map classified intents to command actions
const intentToCommand = (intent: string): string | null => {
  const map: Record<string, string> = {
    payment_make: "PAY",
    payment_status: "BALANCE",
    payment_history: "BALANCE",
    document_upload: "DOCS",
    document_status: "STATUS",
    police_report: "3",
    vehicle_status: "STATUS",
    vehicle_problem: "3",
    vehicle_list: "STATUS",
    rental_extend: "STATUS",
    rental_return: "DONE",
    rental_available: "CARS",
    support: "HUMAN",
    emergency: "EMERGENCY",
    negotiation_accept: "ACCEPT",
    negotiation_reject: "REJECT",
    negotiation_counter: "COUNTER",
    negotiation_status: "NEGOTIATE",
    negotiation_modify: "MODIFY",
    negotiation_lock: "LOCK",
  };
  return map[intent] || null;
};

// ═══════════════════════════════════════════════════════════
// Multilingual Chatbot Responses
// ═══════════════════════════════════════════════════════════

type SupportedLang = "en" | "pcm" | "yo";

interface ChatbotResponse {
  text: Record<SupportedLang, string>;
  quickReplies?: string[];
  priority?: "normal" | "high" | "critical";
}

const CHATBOT_RESPONSES: Record<string, ChatbotResponse> = {
  greeting: {
    text: {
      en: "Hello! Welcome to Rentmaikar. How can I help you today?",
      pcm: "Hello! Welcome to Rentmaikar. How we go help you today?",
      yo: "Kabọ! Kaabo si Rentmaikar. Bawo ni mo ṣe le ran ọ lọwọ?",
    },
    quickReplies: ["Pay Now", "Check Status", "Get Help"],
  },
  payment_info: {
    text: {
      en: "To make a payment, please click the 'Pay Now' button below or visit your driver dashboard.",
      pcm: "To pay, press 'Pay Now' button below or go your driver dashboard.",
      yo: "Lati ṣe ísanwó, tẹ 'Pay Now' tabi lọ sí dashboard rẹ.",
    },
    quickReplies: ["Pay Now", "Payment History", "Speak to Agent"],
  },
  document_status: {
    text: {
      en: "Your documents are being verified. This usually takes 24-48 hours.",
      pcm: "Dem dey check your documents. E go take 24-48 hours.",
      yo: "A ń ṣàyẹ̀wò àwọn ìwé rẹ. Ó máa gba wákàtí 24-48.",
    },
    quickReplies: ["Check Status", "Upload New", "Why so long?"],
  },
  vehicle_help: {
    text: {
      en: "Having vehicle issues? Please describe the problem and our support team will assist you.",
      pcm: "Your motor get wahala? Tell us wetin happen and our team go help you.",
      yo: "Ọkọ̀ rẹ ní ìṣòro? Ṣàlàyé kí ẹgbẹ́ àtìlẹ́yìn wa le ran ọ lọ́wọ́.",
    },
    quickReplies: ["Breakdown", "Accident", "Maintenance"],
  },
  emergency: {
    text: {
      en: "🚨 EMERGENCY DETECTED\n\nPlease confirm your emergency type:\n1️⃣ Accident\n2️⃣ Breakdown\n3️⃣ Security Issue\n4️⃣ Medical Emergency",
      pcm: "🚨 EMERGENCY!\n\nAbeg confirm wetin happen:\n1️⃣ Accident\n2️⃣ Motor spoil\n3️⃣ Security wahala\n4️⃣ Hospital matter",
      yo: "🚨 PÀJÁWÌRÌ!\n\nJọ̀wọ́ fi ìdí rẹ̀ hàn:\n1️⃣ Ìjàm̀bá\n2️⃣ Ọkọ̀ bàjẹ́\n3️⃣ Ọ̀ṣà àbò\n4️⃣ Pàjáwìrì ìlera",
    },
    priority: "critical",
  },
  no_rental: {
    text: {
      en: "You don't have an active rental at the moment. Visit our website to browse available vehicles.",
      pcm: "You no get active rental now. Go our website check available motors.",
      yo: "O kò ní ìyálọ tó ń ṣiṣẹ́ báyìí. Ṣàbẹ̀wò ojú-ìwé wa láti wo àwọn ọkọ̀.",
    },
    quickReplies: ["Browse Cars", "Get Help"],
  },
  payment_confirmed: {
    text: {
      en: "Your payment has been received successfully! Thank you for staying current.",
      pcm: "We don receive your payment! Thank you for paying on time.",
      yo: "A ti gba ìsanwó rẹ! O ṣeun fún sísanwó lórí àkókò.",
    },
  },
};

// Detect language from region/phone
const detectLanguage = (phone: string, region: string): SupportedLang => {
  // Default: Nigerian numbers get Pidgin context, others get English
  // Could be expanded with user preference storage
  if (region === "NIGERIA" || phone.startsWith("+234")) return "pcm";
  return "en";
};

// Build personalized chatbot response
const buildChatbotResponse = (
  responseKey: string,
  user: { firstName?: string; phone: string; region: string },
  extraContext?: { pendingAmount?: number; currency?: string }
): string => {
  const response = CHATBOT_RESPONSES[responseKey];
  if (!response) return CHATBOT_RESPONSES.greeting.text.en;

  const lang = detectLanguage(user.phone, user.region);
  let text = response.text[lang] || response.text.en;

  // Personalize with name
  if (user.firstName) {
    const greetingPrefix = lang === "pcm"
      ? `Hey ${user.firstName}! `
      : lang === "yo"
        ? `${user.firstName}, `
        : `Hi ${user.firstName}! `;
    text = greetingPrefix + text;
  }

  // Add pending payment context
  if (extraContext?.pendingAmount && responseKey === "payment_info") {
    const curr = extraContext.currency === "NGN" ? "₦" : "$";
    text += `\n\nYou have a pending payment of ${curr}${extraContext.pendingAmount.toLocaleString()}.`;
  }

  // Append quick replies as numbered options
  if (response.quickReplies && response.quickReplies.length > 0) {
    text += "\n\n" + response.quickReplies.map((r, i) => `${i + 1}️⃣ ${r}`).join("\n");
  }

  return text;
};

// ═══════════════════════════════════════════════════════════
// Region-aware WhatsApp message sender with retry & delivery tracking
// ═══════════════════════════════════════════════════════════

type MessagePriority = "critical" | "high" | "normal" | "low";

const PRIORITY_DELAY_MS: Record<MessagePriority, number> = {
  critical: 0,
  high: 0,        // No artificial delay in edge function context
  normal: 0,
  low: 0,
};

const MAX_RETRY_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Core sender — dispatches to Twilio or Termii based on phone prefix.
 * Returns the provider response or throws on failure.
 */
const sendWhatsAppRaw = async (to: string, message: string): Promise<{ provider: string; externalId?: string; response: unknown }> => {
  const isNigeria = to.startsWith("+234") || to.startsWith("234");

  if (isNigeria) {
    const termiiApiKey = Deno.env.get("TERMII_API_KEY");
    const termiiSenderId = Deno.env.get("TERMII_SENDER_ID") || "Rentmaikar";
    if (!termiiApiKey) throw new Error("Termii credentials not configured for Nigeria");

    const cleanPhone = to.startsWith("+") ? to.replace("+", "") : to;
    const response = await fetch("https://api.ng.termii.com/api/sms/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: cleanPhone, from: termiiSenderId, sms: message,
        type: "plain", channel: "whatsapp", api_key: termiiApiKey,
        notify_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/termii-webhook`,
      }),

    });
    const body = await response.text();
    if (!response.ok) throw new Error(`Termii error: ${body}`);
    const json = JSON.parse(body);
    return { provider: "termii", externalId: json.message_id, response: json };
  }

  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const fromNumber = Deno.env.get("TWILIO_PHONE_NUMBER");
  assertTwilioMessagingEnabled();
  if (!accountSid || !authToken || !fromNumber) throw new Error("Twilio credentials not configured");

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const formData = new URLSearchParams();
  formData.append("To", `whatsapp:${to}`);
  formData.append("From", `whatsapp:${fromNumber}`);
  formData.append("Body", message);
  formData.append("StatusCallback", `${Deno.env.get("SUPABASE_URL")}/functions/v1/twilio-webhook`);


  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData.toString(),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Twilio error: ${body}`);
  const json = JSON.parse(body);
  return { provider: "twilio", externalId: json.sid, response: json };
};

/**
 * Send WhatsApp message with automatic retry (exponential backoff)
 * and delivery status tracking in whatsapp_message_delivery.
 */
const sendWhatsAppMessage = async (
  to: string,
  message: string,
  options?: {
    priority?: MessagePriority;
    supabase?: ReturnType<typeof createClient>;
    messageId?: string;
    /** Only for STOP/START confirmations. */
    allowOptedOut?: boolean;
  }
): Promise<{ provider: string; externalId?: string; response: unknown }> => {
  // ─── Opt-out guard: never contact a number after STOP ───
  if (!options?.allowOptedOut && await isOptedOut(to, "whatsapp", options?.supabase as never)) {
    console.log(`[WhatsApp] Suppressed — ${to} has opted out`);
    return { provider: "suppressed", response: { suppressed: true } };
  }

  const priority = options?.priority || "normal";
  const msgId = options?.messageId || crypto.randomUUID();
  let lastError: Error | null = null;


  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      if (attempt > 0) {
        const backoffMs = Math.pow(2, attempt) * 1000; // 2s, 4s
        console.log(`[Queue] Retry ${attempt}/${MAX_RETRY_ATTEMPTS} for ${to} in ${backoffMs}ms`);
        await sleep(backoffMs);
      }

      const result = await sendWhatsAppRaw(to, message);

      // Log successful delivery
      if (options?.supabase) {
        await options.supabase.from("whatsapp_message_delivery").insert({
          message_id: msgId,
          status: "delivered",
          error_code: null,
          error_message: null,
        }).catch(e => console.error("[Delivery Log] Insert error:", e));
      }

      console.log(`[Queue] Sent (${priority}) to ${to} via ${result.provider} [attempt ${attempt + 1}]`);
      return result;

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`[Queue] Attempt ${attempt + 1} failed for ${to}: ${lastError.message}`);

      // Log retry/failure
      if (options?.supabase) {
        await options.supabase.from("whatsapp_message_delivery").insert({
          message_id: msgId,
          status: attempt < MAX_RETRY_ATTEMPTS - 1 ? "retry" : "failed",
          error_code: `ATTEMPT_${attempt + 1}`,
          error_message: lastError.message.substring(0, 500),
        }).catch(e => console.error("[Delivery Log] Insert error:", e));
      }
    }
  }

  // All retries exhausted — escalate
  console.error(`[Queue] FAILED after ${MAX_RETRY_ATTEMPTS} attempts for ${to}`);

  if (options?.supabase) {
    // Create inbox conversation for failed message escalation
    await options.supabase.from("inbox_conversations").insert({
      user_phone: to,
      channel: "whatsapp",
      subject: `⚠️ Failed message delivery (${MAX_RETRY_ATTEMPTS} attempts)`,
      status: "open",
      priority: "urgent",
      region: to.startsWith("+234") ? "NIGERIA" : "USA",
    }).catch(e => console.error("[Escalation] Insert error:", e));
  }

  throw lastError || new Error("Message delivery failed");
};

const generatePaymentLink = (driverId: string, amount: number, currency: string): string => {
  const baseUrl = Deno.env.get("SUPABASE_URL")?.replace(".supabase.co", ".lovable.app") ||
    "https://rentmaikar.lovable.app";
  const params = new URLSearchParams({
    driver: driverId, amount: amount.toString(), currency, ts: Date.now().toString(),
  });
  return `${baseUrl}/payment?${params.toString()}`;
};

// ═══════════════════════════════════════════════════════════
// Document Helpers
// ═══════════════════════════════════════════════════════════

const DOCUMENT_LABELS: Record<string, string> = {
  driver_license: "Driver's License",
  nin: "National ID (NIN)",
  bvn: "Bank Verification Number (BVN)",
  police_clearance: "Police Clearance Certificate",
  id_card: "Government-Issued ID",
  insurance: "Vehicle Insurance",
  registration: "Vehicle Registration",
  road_worthiness: "Road Worthiness Certificate",
  proof_of_ownership: "Proof of Ownership",
  vin: "Vehicle Identification Number (VIN)",
  inspection_certificate: "Vehicle Inspection Certificate",
};

const formatDocumentType = (type: string): string =>
  DOCUMENT_LABELS[type] || type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

const getDocumentExpiryDays = (docType: string, country: string): number | null => {
  const expiryMap: Record<string, Record<string, number>> = {
    driver_license: { US: 365 * 4, NG: 365 * 3 },
    insurance: { US: 365, NG: 365 },
    road_worthiness: { NG: 365 },
    police_clearance: { NG: 90 },
    inspection_certificate: { US: 365 },
  };
  return expiryMap[docType]?.[country] || null;
};


// ═══════════════════════════════════════════════════════════
// WhatsApp Analytics & Message Tracking
// ═══════════════════════════════════════════════════════════

const trackWhatsAppMessage = async (
  supabase: ReturnType<typeof createClient>,
  data: {
    messageId?: string;
    userId?: string;
    direction: "inbound" | "outbound";
    messageType: string;
    content: string;
    templateName?: string;
    language?: string;
    status?: string;
    metadata?: Record<string, unknown>;
  }
) => {
  try {
    await supabase.from("whatsapp_messages").insert({
      message_id: data.messageId || crypto.randomUUID(),
      user_id: data.userId || null,
      direction: data.direction,
      message_type: data.messageType,
      content: data.content?.substring(0, 5000) || "",
      template_name: data.templateName || null,
      language: data.language || null,
      status: data.status || "sent",
      metadata: data.metadata || {},
    });
  } catch (err) {
    console.error("[Analytics] Failed to track message:", err);
  }
};

const trackTemplateUsage = async (
  supabase: ReturnType<typeof createClient>,
  templateName: string,
  language: string,
  userId?: string
) => {
  try {
    await supabase.from("whatsapp_template_usage").insert({
      template_name: templateName,
      language,
      user_id: userId || null,
      status: "sent",
    });
  } catch (err) {
    console.error("[Analytics] Failed to track template usage:", err);
  }
};

// ═══════════════════════════════════════════════════════════
// Payment Reminder Helper (Template-based)
// ═══════════════════════════════════════════════════════════

const sendPaymentReminder = async (
  supabase: ReturnType<typeof createClient>,
  user: { userId: string; phone: string; language?: string; country?: string },
  payment: { amount: number; dueDate: string; vehicleName: string; defaultDay?: number; currency: string }
) => {
  const templateName = `payment_reminder_day${payment.defaultDay || 1}`;
  const lang = detectTemplateLanguage(user.country || "US");

  const filled = fillTemplate(templateName, lang, [
    payment.amount.toLocaleString(),
    payment.dueDate,
    payment.vehicleName,
  ]);

  // Build text message whether or not structured template exists
  const curr = payment.currency === "NGN" ? "₦" : "$";
  const message = filled
    ? `⏰ *Payment Reminder*\n\nAmount Due: ${curr}${payment.amount.toLocaleString()}\nVehicle: ${payment.vehicleName}\nDue: ${payment.dueDate}\n\nReply *PAY* to settle now.`
    : `⏰ *Payment Reminder*\n\nAmount: ${curr}${payment.amount.toLocaleString()}\nDue: ${payment.dueDate}\n\nReply *PAY* to pay now.`;

  await sendWhatsAppMessage(user.phone, message);

  // Track
  await trackWhatsAppMessage(supabase, {
    userId: user.userId,
    direction: "outbound",
    messageType: "template",
    content: message,
    templateName,
    language: lang,
    status: "sent",
  });

  await trackTemplateUsage(supabase, templateName, lang, user.userId);
};

// ═══════════════════════════════════════════════════════════
// Document Request Helper
// ═══════════════════════════════════════════════════════════

const requestDocument = async (
  supabase: ReturnType<typeof createClient>,
  user: { userId: string; phone: string; fullName?: string },
  docType: string,
  reason?: string
) => {
  const docLabel = formatDocumentType(docType);
  const message = [
    `📄 *Document Required*`,
    ``,
    `Type: ${docLabel}`,
    reason ? `Reason: ${reason}` : "",
    ``,
    `Please upload your ${docLabel}:`,
    `1️⃣ Send the file directly in this chat`,
    `2️⃣ Or upload at: https://rentmaikar.lovable.app/driver/dashboard`,
    ``,
    `Supported: PDF, JPG, PNG (Max 10MB)`,
  ].filter(Boolean).join("\n");

  await sendWhatsAppMessage(user.phone, message);

  await trackWhatsAppMessage(supabase, {
    userId: user.userId,
    direction: "outbound",
    messageType: "interactive",
    content: message,
    status: "sent",
    metadata: { docType, reason },
  });

  // Create interactive flow for document upload tracking
  await supabase.from("whatsapp_interactive_flows").insert({
    user_id: user.userId,
    flow_id: `doc_upload_${docType}_${Date.now()}`,
    flow_type: "document_upload",
    current_step: 0,
    data: { docType, reason, requestedAt: new Date().toISOString() },
    completed: false,
  });
};

// ═══════════════════════════════════════════════════════════
// Main Handler
// ═══════════════════════════════════════════════════════════

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse incoming webhook (form data from Twilio or JSON from Termii)
    let from = "";
    let rawBody = "";
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      // Inbound WhatsApp/SMS commands must be genuine Twilio callbacks.
      const denied = await verifyTwilioRequestRaw(req);
      if (denied) return denied;
      const formData = await req.formData();
      from = formData.get("From")?.toString().replace("whatsapp:", "") || "";
      rawBody = formData.get("Body")?.toString().trim() || "";
    } else {
      const jsonData = await req.json();

      // ─── Internal JSON action branch (service-role only) ───
      // These actions mutate payments, documents, and rental state and must
      // never be callable by anonymous or driver/owner-authenticated requests.
      if (jsonData.action) {
        const authError = requireServiceRole(req);
        if (authError) return authError;
      }

      // ─── Internal payment completion webhook ───
      if (jsonData.action === "payment_completed") {
        const { userId, rentalId, transactionId, status, amount, currency } = jsonData;

        console.log(`[Payment Completion] user=${userId} rental=${rentalId} txn=${transactionId}`);

        // Update payment default to resolved
        if (rentalId) {
          await supabase.from("payment_defaults")
            .update({ status: "resolved", resolved_at: new Date().toISOString() })
            .eq("rental_id", rentalId)
            .eq("driver_id", userId)
            .eq("status", "active");
        }

        // Record payment
        const { data: rental } = await supabase.from("rentals")
          .select("owner_id, vehicle_id")
          .eq("id", rentalId)
          .single();

        if (rental) {
          await supabase.from("payments").insert({
            driver_id: userId,
            owner_id: rental.owner_id,
            vehicle_id: rental.vehicle_id,
            rental_id: rentalId,
            amount: amount || 0,
            currency: currency || "USD",
            status: status || "completed",
            transaction_id: transactionId,
            payment_method: "whatsapp_flow",
            processed_at: new Date().toISOString(),
          });
        }

        // Send confirmation to driver
        const { data: driverProfile } = await supabase.from("profiles")
          .select("phone, full_name").eq("user_id", userId).single();

        if (driverProfile?.phone) {
          const curr = (currency || "USD") === "NGN" ? "₦" : "$";
          await sendWhatsAppMessage(driverProfile.phone, [
            `✅ *Payment Received*`,
            ``,
            `Amount: ${curr}${Number(amount || 0).toLocaleString()}`,
            `Transaction: ${transactionId}`,
            `Date: ${new Date().toLocaleDateString()}`,
            ``,
            `Thank you for your payment! 🎉`,
          ].join("\n"));
        }

        // Notify owner
        if (rental) {
          const { data: ownerProfile } = await supabase.from("profiles")
            .select("phone, full_name").eq("user_id", rental.owner_id).single();

          if (ownerProfile?.phone) {
            const curr = (currency || "USD") === "NGN" ? "₦" : "$";
            await sendWhatsAppMessage(ownerProfile.phone, [
              `💰 *Payment Received for Your Vehicle*`,
              ``,
              `Driver: ${driverProfile?.full_name || "N/A"}`,
              `Amount: ${curr}${Number(amount || 0).toLocaleString()}`,
              `Transaction: ${transactionId}`,
              ``,
              `Your payout will be processed according to your schedule.`,
            ].join("\n"));
          }
        }

        return new Response(JSON.stringify({ success: true }), {
          status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // ─── Internal document upload handler ───
      if (jsonData.action === "document_uploaded") {
        const { userId, documentType, fileUrl, metadata } = jsonData;
        console.log(`[Document Upload] user=${userId} type=${documentType}`);

        const { data: userProfile } = await supabase.from("profiles")
          .select("phone, full_name").eq("user_id", userId).single();

        // Determine region-specific document requirements
        const isNigeria = userProfile?.phone?.startsWith("+234");
        const expiryDays = getDocumentExpiryDays(documentType, isNigeria ? "NG" : "US");

        // Check if document record exists, update or insert
        const { data: existingDoc } = await supabase.from("user_documents")
          .select("id")
          .eq("user_id", userId)
          .eq("document_type", documentType)
          .limit(1)
          .single();

        const docData = {
          user_id: userId,
          document_type: documentType,
          file_url: fileUrl,
          status: "pending" as const,
          uploaded_at: new Date().toISOString(),
          metadata: metadata || {},
        };

        if (existingDoc) {
          await supabase.from("user_documents")
            .update({ ...docData })
            .eq("id", existingDoc.id);
        } else {
          await supabase.from("user_documents").insert(docData);
        }

        // Send confirmation to user
        if (userProfile?.phone) {
          const docLabel = formatDocumentType(documentType);
          await sendWhatsAppMessage(userProfile.phone, [
            `📄 *Document Received*`,
            ``,
            `Type: ${docLabel}`,
            `Status: ⏳ Pending Review`,
            ``,
            `Our team will verify your document within 24-48 hours.`,
            expiryDays ? `\n📅 This document expires in ${expiryDays} days after verification.` : "",
            ``,
            `_Reply *STATUS* to check document status._`,
          ].filter(Boolean).join("\n"));
        }

        return new Response(JSON.stringify({ success: true }), {
          status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // ─── Internal document verification result ───
      if (jsonData.action === "document_verified" || jsonData.action === "document_rejected") {
        const { userId, documentType, reason, expiryDate } = jsonData;
        const isVerified = jsonData.action === "document_verified";

        const { data: userProfile } = await supabase.from("profiles")
          .select("phone, full_name").eq("user_id", userId).single();

        if (userProfile?.phone) {
          const docLabel = formatDocumentType(documentType);

          if (isVerified) {
            await sendWhatsAppMessage(userProfile.phone, [
              `✅ *Document Verified*`,
              ``,
              `Type: ${docLabel}`,
              expiryDate ? `Expires: ${new Date(expiryDate).toLocaleDateString()}` : "",
              ``,
              `Your ${docLabel} has been approved! ✨`,
            ].filter(Boolean).join("\n"));
          } else {
            await sendWhatsAppMessage(userProfile.phone, [
              `❌ *Document Rejected*`,
              ``,
              `Type: ${docLabel}`,
              `Reason: ${reason || "Does not meet requirements"}`,
              ``,
              `Please re-upload a valid document.`,
              `Supported formats: PDF, JPG, PNG (Max 10MB)`,
              ``,
              `👉 Upload at: https://rentmaikar.lovable.app/driver/dashboard`,
              `Or send the file directly in this chat.`,
            ].join("\n"));
          }
        }

        return new Response(JSON.stringify({ success: true }), {
          status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // ─── Internal document request handler ───
      if (jsonData.action === "document_request") {
        const { userId, documentType, reason } = jsonData;
        console.log(`[Document Request] user=${userId} type=${documentType}`);

        const { data: userProfile } = await supabase.from("profiles")
          .select("phone, full_name").eq("user_id", userId).single();

        if (userProfile?.phone) {
          await requestDocument(supabase, {
            userId,
            phone: userProfile.phone,
            fullName: userProfile.full_name || undefined,
          }, documentType, reason || "Document required for verification");
        }

        return new Response(JSON.stringify({ success: true }), {
          status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // ─── Internal payment reminder handler ───
      if (jsonData.action === "send_payment_reminder") {
        const { userId, amount, dueDate, vehicleName, defaultDay, currency, country } = jsonData;
        console.log(`[Payment Reminder] user=${userId} amount=${amount}`);

        const { data: userProfile } = await supabase.from("profiles")
          .select("phone, full_name").eq("user_id", userId).single();

        if (userProfile?.phone) {
          await sendPaymentReminder(supabase, {
            userId,
            phone: userProfile.phone,
            language: undefined,
            country: country || (userProfile.phone.startsWith("+234") ? "NG" : "US"),
          }, {
            amount: Number(amount),
            dueDate,
            vehicleName: vehicleName || "your vehicle",
            defaultDay: defaultDay || 1,
            currency: currency || "USD",
          });
        }

        return new Response(JSON.stringify({ success: true }), {
          status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // ─── Vehicle selection handler ───
      if (jsonData.action === "vehicle_selected") {
        const { userId, vehicleId } = jsonData;
        console.log(`[Vehicle Selection] user=${userId} vehicle=${vehicleId}`);

        const { data: vehicle } = await supabase
          .from("vehicles")
          .select("id, make, model, year, category, daily_rate, currency, region, description")
          .eq("id", vehicleId)
          .single();

        const { data: userProfile } = await supabase.from("profiles")
          .select("phone, full_name").eq("user_id", userId).single();

        if (vehicle && userProfile?.phone) {
          const curr = vehicle.currency === "NGN" ? "₦" : "$";
          const weeklyRate = vehicle.daily_rate * 7;
          const detailMsg = [
            `🚗 *${vehicle.year} ${vehicle.make} ${vehicle.model}*`,
            ``,
            `📋 *Vehicle Details*`,
            `• Category: ${vehicle.category || "Standard"}`,
            `• Daily Rate: ${curr}${vehicle.daily_rate.toLocaleString()}/day`,
            `• Weekly Rate: ${curr}${weeklyRate.toLocaleString()}/week`,
            vehicle.description ? `• Info: ${vehicle.description}` : "",
            ``,
            `✅ Includes GPS tracking & insurance`,
            ``,
            `📱 *Book Now:*`,
            `https://rentmaikar.lovable.app/catalogue?vehicle=${vehicle.id}`,
            ``,
            `_Reply *1* for booking support or *4* to talk to an agent._`,
          ].filter(Boolean).join("\n");

          await sendWhatsAppMessage(userProfile.phone, detailMsg);

          // Track the interactive flow
          await supabase.from("whatsapp_interactive_flows").insert({
            user_id: userId,
            flow_id: `vehicle_select_${vehicleId}_${Date.now()}`,
            flow_type: "vehicle_selection",
            current_step: 1,
            data: {
              vehicleId,
              vehicleName: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
              dailyRate: vehicle.daily_rate,
              currency: vehicle.currency,
            },
            completed: false,
          });

          await trackWhatsAppMessage(supabase, {
            userId,
            direction: "outbound",
            messageType: "interactive",
            content: detailMsg,
            status: "sent",
            metadata: { vehicleId, action: "vehicle_details" },
          });
        }

        return new Response(JSON.stringify({ success: true }), {
          status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      from = jsonData.from || jsonData.mobile || jsonData.phone || "";
      rawBody = (jsonData.text || jsonData.body || jsonData.message || "").trim();
      if (from && !from.startsWith("+")) {
        from = from.startsWith("234") ? `+${from}` : `+234${from}`;
      }
    }

    const body = rawBody.toUpperCase();
    const region = from.startsWith("+234") ? "NIGERIA" : "USA";

    console.log(`[WhatsApp Command] From: ${from}, Body: ${body}, Region: ${region}`);

    // ─── STOP / START handled first, for registered and unregistered numbers ───
    if (isStopKeyword(rawBody) || isStartKeyword(rawBody)) {
      const stopping = isStopKeyword(rawBody);
      const { data: optProfile } = await supabase
        .from("profiles").select("user_id").eq("phone", from).maybeSingle();
      const optUserId = (optProfile as { user_id?: string } | null)?.user_id ?? null;
      await setOptOut(from, stopping, {
        channel: "all",
        userId: optUserId,
        source: "whatsapp_keyword",
        keyword: body,
        supabase: supabase as never,
      });
      await recordKeywordConsent(supabase as never, {
        event: stopping ? "stop" : "start",
        phone: from,
        userId: optUserId,
        keyword: body,
        channel: "whatsapp",
      });
      // Opt-out wording must match the A2P 10DLC campaign submission verbatim.
      const confirm = stopping
        ? "You have successfully been unsubscribed. You will not receive any more messages from this number. Reply START to resubscribe."
        : "You're subscribed again. Rentmaikar will resume sending you SMS and WhatsApp updates. Reply STOP to unsubscribe.";
      await sendWhatsAppMessage(from, confirm, { supabase, allowOptedOut: true });
      return new Response("OK", { status: 200, headers: corsHeaders });
    }



    // Find user by phone number
    const { data: profile } = await supabase
      .from("profiles")
      .select("user_id, full_name, phone")
      .eq("phone", from)
      .single();

    if (!profile) {
      const lang = detectLanguage(from, region);
      const welcomeMsg = lang === "pcm"
        ? "👋 Welcome to Rentmaikar!\n\nWe no know this number. Abeg register for https://rentmaikar.lovable.app make you start."
        : lang === "yo"
          ? "👋 Kaabo si Rentmaikar!\n\nA kò mọ nọ́mbà yìí. Jọ̀wọ́ forúkọsílẹ̀ ní https://rentmaikar.lovable.app."
          : "👋 Welcome to Rentmaikar!\n\nWe don't recognize this number. Please register at https://rentmaikar.lovable.app to get started.";
      await sendWhatsAppMessage(from, welcomeMsg);
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // ─── Build user context for intent classification ───
    const { data: activeRental } = await supabase
      .from("rentals")
      .select("id")
      .eq("driver_id", profile.user_id)
      .eq("status", "active")
      .limit(1)
      .single();

    const { data: pendingPayment } = await supabase
      .from("payment_defaults")
      .select("id")
      .eq("driver_id", profile.user_id)
      .eq("status", "active")
      .limit(1)
      .single();

    const userContext: IntentResult["context"] = {
      hasActiveRental: !!activeRental,
      hasPendingPayment: !!pendingPayment,
      region,
    };

    // ─── Determine command: exact match first, then intent classification ───
    let command = body;
    let intentResult: IntentResult | null = null;

    const exactCommands = [
      "PAY", "PAYMENT", "STATUS", "BALANCE", "HELP", "INFO", "SUPPORT",
      "OK", "DONE", "1", "BOOKING", "2", "3", "4", "HUMAN", "CARS", "DOCS",
    ];

    if (!exactCommands.includes(body)) {
      // No exact match — classify intent from natural language
      intentResult = classifyIntent(rawBody, userContext);
      console.log(`[Intent] ${intentResult.intent} (confidence: ${intentResult.confidence})`);

      if (intentResult.confidence >= 0.3) {
        const mappedCommand = intentToCommand(intentResult.intent);
        if (mappedCommand) {
          command = mappedCommand;
        }
      }
    }

    // ─── Process command ───
    let responseMessage = "";

    switch (command) {
      case "PAY":
      case "PAYMENT": {
        // Look for active payment defaults first
        const { data: defaultPayment } = await supabase
          .from("payment_defaults")
          .select("*, rental_id")
          .eq("driver_id", profile.user_id)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (defaultPayment) {
          // Get rental & vehicle details for the interactive payment message
          const { data: rental } = await supabase
            .from("rentals")
            .select("id, vehicle_id, daily_rate, currency")
            .eq("id", defaultPayment.rental_id)
            .single();

          const vehicleLabel = rental?.vehicle_id
            ? (await supabase.from("vehicles").select("make, model, year").eq("id", rental.vehicle_id).single()).data
            : null;

          const vehicleName = vehicleLabel
            ? `${vehicleLabel.year} ${vehicleLabel.make} ${vehicleLabel.model}`
            : "your vehicle";

          const curr = defaultPayment.currency === "NGN" ? "₦" : "$";
          const amount = Number(defaultPayment.amount_due);
          const paymentUrl = generatePaymentLink(
            profile.user_id, amount, defaultPayment.currency
          );

          // Interactive-style payment message with structured sections
          responseMessage = [
            `💳 *Secure Payment*`,
            ``,
            `Complete payment of ${curr}${amount.toLocaleString()} for ${vehicleName}.`,
            ``,
            `📋 *Payment Details*`,
            `• Amount: ${curr}${amount.toLocaleString()}`,
            `• Vehicle: ${vehicleName}`,
            `• Frequency: ${defaultPayment.payment_frequency || "Daily"}`,
            `• Hours Overdue: ${defaultPayment.hours_overdue || 0}h`,
            ``,
            `🔒 Secured by ${defaultPayment.currency === "NGN" ? "Paystack" : "PayPal"}`,
            ``,
            `👉 Pay now: ${paymentUrl}`,
            ``,
            `_Reply *BALANCE* to see full breakdown or *4* for help._`,
          ].join("\n");
        } else {
          // Check for upcoming payments even if not overdue
          const { data: activeRentalForPay } = await supabase
            .from("rentals")
            .select("id, daily_rate, currency, vehicle_id, payment_frequency")
            .eq("driver_id", profile.user_id)
            .eq("status", "active")
            .limit(1)
            .single();

          if (activeRentalForPay) {
            const curr = activeRentalForPay.currency === "NGN" ? "₦" : "$";
            const paymentUrl = generatePaymentLink(
              profile.user_id, activeRentalForPay.daily_rate, activeRentalForPay.currency
            );
            responseMessage = [
              `✅ *No Overdue Payments*`,
              ``,
              `You're all caught up! 🎉`,
              ``,
              `Want to make an early payment?`,
              `• ${activeRentalForPay.payment_frequency === "weekly" ? "Weekly" : "Daily"} rate: ${curr}${activeRentalForPay.daily_rate.toLocaleString()}`,
              ``,
              `👉 Pay ahead: ${paymentUrl}`,
            ].join("\n");
          } else {
            responseMessage = `✅ No Outstanding Payments\n\nYou're all caught up! No pending payments or active rentals found.`;
          }
        }
        break;
      }

      case "STATUS": {
        const { data: negotiation } = await supabase
          .from("price_negotiations")
          .select("*")
          .eq("driver_id", profile.user_id)
          .eq("status", "approved")
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (negotiation) {
          const weeklyRate = negotiation.final_daily_rate ? negotiation.final_daily_rate * 7 : 0;
          responseMessage = rentalStatusMessage({
            vehicleName: `${negotiation.vehicle_make} ${negotiation.vehicle_model}`,
            status: "Active",
            nextPaymentDue: "Weekly",
            amount: weeklyRate,
            currency: negotiation.currency as "USD" | "NGN",
          });
        } else {
          const firstName = profile.full_name?.split(" ")[0];
          responseMessage = buildChatbotResponse("no_rental", { firstName, phone: from, region });
        }
        break;
      }

      case "BALANCE": {
        const { data: defaults } = await supabase
          .from("payment_defaults")
          .select("amount_due, currency")
          .eq("driver_id", profile.user_id)
          .eq("status", "active");

        const totalDue = defaults?.reduce((sum, d) => sum + Number(d.amount_due), 0) || 0;
        const currency = defaults?.[0]?.currency || "USD";

        if (totalDue > 0) {
          responseMessage = `💰 Payment Balance\n\nTotal outstanding: ${currency === "NGN" ? "₦" : "$"}${totalDue.toLocaleString()}\n\nReply *PAY* to make payment.`;
        } else {
          responseMessage = `💰 Payment Balance\n\n✅ You have no outstanding balance!\n\nKeep up the great work! 🎉`;
        }
        break;
      }

      case "HELP":
      case "INFO":
      case "SUPPORT": {
        const firstName = profile.full_name?.split(" ")[0];
        responseMessage = buildChatbotResponse("greeting", { firstName, phone: from, region }) +
          "\n\n" + helpMessage();
        break;
      }

      case "OK":
      case "DONE": {
        responseMessage = `✅ Noted!\n\nThank you for confirming. Have a great day! 🚗`;
        break;
      }

      case "1":
      case "BOOKING": {
        responseMessage = `📋 Booking Support\n\nFor booking issues, please:\n1. Check your dashboard for booking details\n2. Reply *STATUS* to view current rental\n\nOr visit: https://rentmaikar.lovable.app/driver/dashboard`;
        break;
      }

      case "2": {
        responseMessage = `💳 Payment Support\n\nReply *PAY* to make a payment\nReply *BALANCE* to check your balance\n\nFor payment disputes, please email support@rentmaikar.com`;
        break;
      }

      case "3": {
        const firstName = profile.full_name?.split(" ")[0];
        responseMessage = buildChatbotResponse("vehicle_help", { firstName, phone: from, region });
        break;
      }

      case "EMERGENCY": {
        // High-priority emergency escalation with multilingual response
        const firstName = profile.full_name?.split(" ")[0];
        const emergencyBase = buildChatbotResponse("emergency", { firstName, phone: from, region });
        responseMessage = emergencyBase + `\n\nIf you are in danger, please call:\n🇺🇸 USA: 911\n🇳🇬 Nigeria: 112 or 199\n\nA support agent will contact you shortly.`;

        await supabase.from("inbox_conversations").insert({
          user_id: profile.user_id,
          user_name: profile.full_name,
          user_phone: from,
          channel: "whatsapp",
          subject: `🚨 EMERGENCY: ${rawBody.substring(0, 80)}`,
          status: "open",
          priority: "urgent",
          region,
        });
        break;
      }

      case "4":
      case "HUMAN": {
        responseMessage = `👤 Connecting to Support\n\nA support agent will respond shortly.\n\nIn the meantime, please describe your issue in a message.\n\nSupport hours: 8AM - 10PM daily`;

        await supabase.from("inbox_conversations").insert({
          user_id: profile.user_id,
          user_name: profile.full_name,
          user_phone: from,
          channel: "whatsapp",
          subject: "Support Request via WhatsApp",
          status: "open",
          priority: "normal",
          region,
        });
        break;
      }

      case "ACCEPT":
      case "REJECT":
      case "COUNTER":
      case "NEGOTIATE":
      case "PRICE":
      case "OFFER":
      case "APPROVE":
      case "DECLINE":
      case "MODIFY":
      case "LOCK": {
        // Look up active negotiations for this user
        const { data: negotiations } = await supabase
          .from("price_negotiations")
          .select("id, vehicle_id, proposed_rate, status, negotiation_type")
          .eq("user_id", profile.user_id)
          .in("status", ["pending", "counter_offered"])
          .order("created_at", { ascending: false })
          .limit(3);

        if (!negotiations || negotiations.length === 0) {
          responseMessage = `🤝 *Price Negotiations*\n\nYou have no active negotiations at this time.\n\nTo start a new negotiation, visit your dashboard:\n🔗 rentmaikar.lovable.app`;
        } else {
          const negotiationLines = negotiations.map((n, i) =>
            `${i + 1}. ${n.negotiation_type === 'daily' ? 'Daily' : 'Weekly'} rate: ${n.proposed_rate} (${n.status.replace('_', ' ')})`
          );

          const actionMap: Record<string, string> = {
            ACCEPT: "accept", APPROVE: "accept",
            REJECT: "reject", DECLINE: "reject",
            COUNTER: "counter offer", MODIFY: "modify", LOCK: "lock",
          };
          const action = actionMap[command] || "view";

          responseMessage = `🤝 *Price Negotiations*\n\nYou requested to *${action}*.\n\n📋 *Active Negotiations:*\n${negotiationLines.join('\n')}\n\n⚠️ Please log in to your dashboard to complete this action securely:\n🔗 rentmaikar.lovable.app\n\nOr reply *HUMAN* to speak with an agent.`;

          // Create inbox conversation for admin visibility
          await supabase.from("inbox_conversations").insert({
            user_id: profile.user_id,
            user_name: profile.full_name,
            user_phone: from,
            channel: "whatsapp",
            subject: `🤝 Negotiation ${action} from ${profile.full_name?.split(" ")[0] || from}`,
            status: "open",
            priority: "high",
            region,
          });
        }
        break;
      }

      case "DOCS": {
        // Query user's pending/missing documents
        const { data: userDocs } = await supabase
          .from("user_documents")
          .select("document_type, status")
          .eq("user_id", profile.user_id);

        const pendingDocs = userDocs?.filter(d => d.status === "pending") || [];
        const rejectedDocs = userDocs?.filter(d => d.status === "rejected") || [];
        const uploadedTypes = new Set(userDocs?.map(d => d.document_type) || []);

        // Determine required docs by region
        const requiredDocs = region === "NIGERIA"
          ? ["driver_license", "nin", "bvn", "police_clearance"]
          : ["driver_license", "id_card"];

        const missingDocs = requiredDocs.filter(d => !uploadedTypes.has(d));

        const lines = [`📄 *Document Upload Center*`, ``];

        if (missingDocs.length > 0) {
          lines.push(`⚠️ *Missing Documents:*`);
          missingDocs.forEach(d => lines.push(`  • ${formatDocumentType(d)}`));
          lines.push(``);
        }

        if (pendingDocs.length > 0) {
          lines.push(`⏳ *Pending Review:*`);
          pendingDocs.forEach(d => lines.push(`  • ${formatDocumentType(d.document_type)}`));
          lines.push(``);
        }

        if (rejectedDocs.length > 0) {
          lines.push(`❌ *Needs Re-upload:*`);
          rejectedDocs.forEach(d => lines.push(`  • ${formatDocumentType(d.document_type)}`));
          lines.push(``);
        }

        if (missingDocs.length === 0 && pendingDocs.length === 0 && rejectedDocs.length === 0) {
          lines.push(`✅ All documents are verified!`);
        } else {
          lines.push(
            `📎 *How to upload:*`,
            `1. Send the file directly in this chat`,
            `2. Or visit: https://rentmaikar.lovable.app/driver/dashboard`,
            ``,
            `Supported: PDF, JPG, PNG (Max 10MB)`,
          );
        }

        responseMessage = lines.join("\n");
        break;
      }

      case "CARS": {
        // Interactive vehicle list with selection flow
        const { data: vehicles } = await supabase
          .from("vehicles")
          .select("id, make, model, year, category, daily_rate, currency, city")
          .eq("status", "available")
          .eq("region", region === "NIGERIA" ? "nigeria" : "usa")
          .order("daily_rate", { ascending: true })
          .limit(10);

        if (vehicles && vehicles.length > 0) {
          const vehicleLines = vehicles.map((v, i) => {
            const curr = v.currency === "NGN" ? "₦" : "$";
            return [
              `${i + 1}️⃣ *${v.year} ${v.make} ${v.model}*`,
              `   ${v.category || "Standard"} • ${curr}${v.daily_rate}/day`,
              v.city ? `   📍 ${v.city}` : "",
            ].filter(Boolean).join("\n");
          });

          responseMessage = [
            `🚗 *Available Vehicles (${vehicles.length})*`,
            ``,
            `Here are vehicles available for you:`,
            ``,
            ...vehicleLines,
            ``,
            `─────────────────`,
            `📱 Full catalogue: https://rentmaikar.lovable.app/catalogue`,
            ``,
            `_Reply with a vehicle number (e.g. *1*) for details,_`,
            `_or *4* to speak with an agent._`,
          ].join("\n");

          // Store vehicle list in session for number-based selection
          await supabase.from("whatsapp_sessions").upsert({
            user_id: profile.user_id,
            session_data: {
              activeFlow: "vehicle_list",
              vehicles: vehicles.map(v => ({
                id: v.id,
                name: `${v.year} ${v.make} ${v.model}`,
              })),
              createdAt: new Date().toISOString(),
            },
            last_activity: new Date().toISOString(),
            expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min
          }, { onConflict: "user_id" });
        } else {
          responseMessage = [
            `🚗 *Available Vehicles*`,
            ``,
            `No vehicles currently available in your region.`,
            ``,
            `Check back soon or browse online:`,
            `📱 https://rentmaikar.lovable.app/catalogue`,
          ].join("\n");
        }
        break;
      }

      default: {
        // Check if user has an active vehicle selection session
        const numericInput = parseInt(rawBody);
        if (!isNaN(numericInput) && numericInput >= 1 && numericInput <= 10) {
          const { data: session } = await supabase
            .from("whatsapp_sessions")
            .select("session_data, expires_at")
            .eq("user_id", profile.user_id)
            .single();

          if (
            session?.session_data?.activeFlow === "vehicle_list" &&
            session?.expires_at &&
            new Date(session.expires_at) > new Date()
          ) {
            const vehicleList = session.session_data.vehicles || [];
            const selectedVehicle = vehicleList[numericInput - 1];

            if (selectedVehicle) {
              // Fetch full vehicle details
              const { data: vehicle } = await supabase
                .from("vehicles")
                .select("id, make, model, year, category, daily_rate, currency, city, description")
                .eq("id", selectedVehicle.id)
                .single();

              if (vehicle) {
                const curr = vehicle.currency === "NGN" ? "₦" : "$";
                const weeklyRate = vehicle.daily_rate * 7;
                responseMessage = [
                  `🚗 *${vehicle.year} ${vehicle.make} ${vehicle.model}*`,
                  ``,
                  `📋 *Vehicle Details*`,
                  `• Category: ${vehicle.category || "Standard"}`,
                  `• Daily Rate: ${curr}${vehicle.daily_rate.toLocaleString()}/day`,
                  `• Weekly Rate: ${curr}${weeklyRate.toLocaleString()}/week`,
                  vehicle.city ? `• Location: 📍 ${vehicle.city}` : "",
                  vehicle.description ? `• Info: ${vehicle.description}` : "",
                  ``,
                  `✅ Includes GPS tracking & insurance`,
                  ``,
                  `📱 *Book Now:*`,
                  `https://rentmaikar.lovable.app/catalogue?vehicle=${vehicle.id}`,
                  ``,
                  `_Reply *CARS* to see other vehicles or *4* to speak with an agent._`,
                ].filter(Boolean).join("\n");

                // Track selection flow
                await supabase.from("whatsapp_interactive_flows").insert({
                  user_id: profile.user_id,
                  flow_id: `vehicle_select_${vehicle.id}_${Date.now()}`,
                  flow_type: "vehicle_selection",
                  current_step: 1,
                  data: {
                    vehicleId: vehicle.id,
                    vehicleName: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
                    dailyRate: vehicle.daily_rate,
                    currency: vehicle.currency,
                    selectedFrom: "whatsapp_list",
                  },
                  completed: false,
                });

                break;
              }
            }
          }
        }

        // If intent was classified but below threshold, or truly unknown
        if (intentResult && intentResult.confidence > 0 && intentResult.confidence < 0.3) {
          responseMessage = `🤔 I'm not sure I understood that.\n\nDid you mean one of these?\n\n• *PAY* - Make a payment\n• *STATUS* - Check rental status\n• *BALANCE* - View balance\n• *CARS* - Browse vehicles\n• *HELP* - Get support\n\nOr reply *4* to talk to a human.`;
        } else {
          responseMessage = selfServiceMenuMessage();
        }
        break;
      }
    }

    // ─── Admin-managed template override (falls back to built-in copy) ───
    const templateKey = KEYWORD_TEMPLATE_KEYS[command];
    if (templateKey) {
      await preloadTemplates(supabase);
      const managed = templateFromCache(templateKey, "whatsapp", countryCodeForPhone(from), {
        first_name: profile?.full_name?.split(" ")[0] || "there",
        portal_link: "https://rentmaikar.lovable.app",
        support_phone: supportPhoneFor(region),
      });
      if (managed) responseMessage = managed;
    }

    await sendWhatsAppMessage(from, responseMessage);


    // ─── Track inbound + outbound messages ───
    await trackWhatsAppMessage(supabase, {
      userId: profile.user_id,
      direction: "inbound",
      messageType: "text",
      content: rawBody,
      language: detectLanguage(from, region),
      status: "received",
      metadata: {
        command,
        intent: intentResult?.intent,
        confidence: intentResult?.confidence,
        region,
      },
    });

    await trackWhatsAppMessage(supabase, {
      userId: profile.user_id,
      direction: "outbound",
      messageType: "text",
      content: responseMessage,
      language: detectLanguage(from, region),
      status: "sent",
      metadata: { command, region },
    });

    // Log the intent classification for analytics
    if (intentResult) {
      console.log(`[Intent Log] user=${profile.user_id} intent=${intentResult.intent} confidence=${intentResult.confidence} command=${command} region=${region}`);
    }

    return new Response("OK", { status: 200, headers: corsHeaders });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[WhatsApp Commands Error]", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
