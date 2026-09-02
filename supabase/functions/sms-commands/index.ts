import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireServiceRole } from "../_shared/auth-guards.ts";
import { preloadTemplates, templateFromCache } from "../_shared/message-templates.ts";
import { isOptedOut, setOptOut, isStopKeyword, isStartKeyword } from "../_shared/opt-out.ts";
import { assertTwilioMessagingEnabled } from "../_shared/twilio-messaging-guard.ts";
import { recordKeywordConsent } from "../_shared/sms-consent-audit.ts";

import {
  smsConfig,
  getRegionConfig,
  getFromNumber,
  segmentMessage,
  truncateForSMS,
  checkRateLimit,
  checkGlobalRateLimit,
  type SMSNumberType,
} from "../_shared/sms-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ═══════════════════════════════════════════════════════════
// Emergency Keywords (multi-language)
// ═══════════════════════════════════════════════════════════

const EMERGENCY_KEYWORDS: Record<string, string[]> = {
  en: ["EMERGENCY", "ACCIDENT", "CRASH", "911", "HELP ME", "SOS"],
  pidgin: ["WAHALA", "HELP ME O", "ACCIDENT O"],
  yoruba: ["EGBA MI", "IRANLOWO"],
  igbo: ["NYERE M AKA"],
};

const ALL_EMERGENCY_KEYWORDS = Object.values(EMERGENCY_KEYWORDS).flat();

const isEmergency = (message: string): boolean => {
  const upper = message.toUpperCase().trim();
  return ALL_EMERGENCY_KEYWORDS.some(kw => upper.includes(kw));
};

// ═══════════════════════════════════════════════════════════
// Opt-out handling is centralized in ../_shared/opt-out.ts via isStopKeyword.
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// Country Detection (from recipient "To" number)
// ═══════════════════════════════════════════════════════════

const detectCountry = (fromNumber: string, toNumber?: string): { region: string; code: string } => {
  // Prefer detecting from recipient (our number) for accuracy
  const detectNum = toNumber || fromNumber;
  if (detectNum.startsWith("+234") || detectNum.startsWith("234")) {
    return { region: "NIGERIA", code: "NG" };
  }
  // Fallback: detect from sender
  if (fromNumber.startsWith("+234") || fromNumber.startsWith("234")) {
    return { region: "NIGERIA", code: "NG" };
  }
  return { region: "USA", code: "US" };
};

// ═══════════════════════════════════════════════════════════
// NLP Classifier (intent detection with multi-language support)
// ═══════════════════════════════════════════════════════════

type SMSIntent = "payment" | "status" | "document" | "support" | "greeting" | "complaint" | "negotiation" | "unknown";

interface ClassifiedIntent {
  intent: SMSIntent;
  confidence: number;
  language: string;
}

const INTENT_PATTERNS: Record<SMSIntent, RegExp[]> = {
  payment: [
    /\b(pay|money|owe|due|charge|debit|credit|transfer|send|amount|fee|cost)\b/i,
    /\b(owo|sisan|ego|ika)\b/i, // Yoruba/Igbo: money/payment
    /\b(how much|wetin i dey owe|how much i go pay)\b/i, // Pidgin
  ],
  negotiation: [
    /\b(accept|reject|counter|negotiate|offer|approve|decline|modify|lock|price)\b/i,
    /\b(counter\s*offer|price\s*lock|price\s*change|rate\s*change|adjust\s*rate)\b/i,
    /\b(new\s*price|change\s*price|update\s*rate|finalize|accept\s*offer|reject\s*offer)\b/i,
  ],
  status: [
    /\b(status|car|vehicle|rental|booking|ride|driver|where|when|time)\b/i,
    /\b(moto|oku|ota)\b/i, // Pidgin/Yoruba: car
    /\b(wetin happen|how far|which level)\b/i, // Pidgin
  ],
  document: [
    /\b(document|doc|license|upload|paper|id|insurance|registration|nin|bvn)\b/i,
    /\b(iwe|akwukwo)\b/i, // Yoruba/Igbo: document/paper
  ],
  support: [
    /\b(talk|speak|agent|human|person|call|contact|manager|complaint|complain)\b/i,
    /\b(i want talk|make i talk|i wan speak)\b/i, // Pidgin
  ],
  greeting: [
    /\b(hi|hello|hey|good morning|good afternoon|good evening|sup|wassup)\b/i,
    /\b(bawo ni|kedu|how you dey|e kaaro|e kaasan)\b/i, // Yoruba/Igbo/Pidgin
  ],
  complaint: [
    /\b(problem|issue|wrong|bad|terrible|fix|broken|not working|fail|error)\b/i,
    /\b(wahala|palava|problem dey|e no work|something dey wrong)\b/i, // Pidgin
  ],
  unknown: [],
};

const classifyIntent = (message: string): ClassifiedIntent => {
  const lower = message.toLowerCase();

  // Check for Pidgin/Yoruba/Igbo markers
  const hasPidgin = /\b(dey|wetin|make|no be|abi|sha|o|na)\b/i.test(lower);
  const hasYoruba = /\b(bawo|kedu|owo|iwe|sisan)\b/i.test(lower);
  const language = hasPidgin ? "pidgin" : hasYoruba ? "yoruba" : "en";

  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    if (intent === "unknown") continue;
    for (const pattern of patterns) {
      if (pattern.test(lower)) {
        return { intent: intent as SMSIntent, confidence: 0.8, language };
      }
    }
  }

  return { intent: "unknown", confidence: 0, language };
};

// ═══════════════════════════════════════════════════════════
// SMS Message Templates (160-char SMS-friendly)
//
// Admin-managed copy in public.twilio_message_templates wins when a matching
// active template exists; the literals below stay as the fallback.
// ═══════════════════════════════════════════════════════════

/** Country code (US/NG) for the number being replied to, set per request. */
let currentCountry: string | null = null;
export const setTemplateCountry = (code: string | null) => {
  currentCountry = code;
};

const ov = (
  key: string,
  values: Record<string, string | number | undefined | null>,
  fallback: string,
): string => templateFromCache(key, "sms", currentCountry, values) ?? fallback;

const SMS_TEMPLATES = {
  welcome: (name: string) =>
    `Rentmaikar: Hi ${name}! Reply PAY, STATUS, BALANCE, DOC, HELP, or STOP. Visit rentmaikar.lovable.app`,

  unregistered: () =>
    `Rentmaikar: We don't recognize this number. Register at rentmaikar.lovable.app to get started.`,

  paymentDue: (amount: string, vehicle: string, link: string) =>
    ov(
      "kw_pay",
      { amount_display: amount, vehicle_name: vehicle, portal_link: link },
      `Rentmaikar: ${amount} due for ${vehicle}. Pay now: ${link} Reply BALANCE for details.`,
    ),

  noPaymentDue: () =>
    `Rentmaikar: No outstanding payments. You're all caught up! Reply STATUS for rental info.`,

  rentalStatus: (vehicle: string, rate: string, freq: string) =>
    ov(
      "kw_status",
      { vehicle_name: vehicle, amount_display: rate, frequency: freq },
      `Rentmaikar: Active rental - ${vehicle} at ${rate}/${freq}. Reply PAY to pay or BALANCE for breakdown.`,
    ),

  noRental: () =>
    `Rentmaikar: No active rental found. Browse vehicles at rentmaikar.lovable.app/catalogue`,

  balance: (amount: string) =>
    ov(
      "kw_balance",
      { amount_display: amount },
      `Rentmaikar: Outstanding balance: ${amount}. Reply PAY to settle now.`,
    ),

  balanceClear: () =>
    `Rentmaikar: No outstanding balance. You're current! Reply STATUS for rental info.`,

  // HELP/INFO reply — must match the A2P 10DLC campaign submission verbatim.
  help: () =>
    ov(
      "kw_help",
      {},
      `Reply STOP to unsubscribe. Msg&Data Rates May Apply.`,
    ),

  docStatus: (pending: number, missing: number) =>
    ov(
      "kw_doc",
      {
        pending_count: pending,
        missing_count: missing,
        portal_link: "rentmaikar.lovable.app/driver/dashboard",
      },
      `Rentmaikar: Docs - ${missing} missing, ${pending} pending review. Upload at rentmaikar.lovable.app/driver/dashboard`,
    ),

  docsComplete: () =>
    `Rentmaikar: All documents verified! No action needed.`,

  // STOP reply — must match the A2P 10DLC campaign submission verbatim.
  optOutConfirm: () =>
    ov(
      "kw_stop",
      {},
      `You have successfully been unsubscribed. You will not receive any more messages from this number. Reply START to resubscribe.`,
    ),

  optIn: () =>
    ov(
      "kw_start",
      {},
      `Rentmaikar: You're re-subscribed to SMS notifications. Reply HELP for commands or STOP to opt out again.`,
    ),

  locationReceived: () =>
    `Rentmaikar: Location received and recorded. Thank you!`,

  supportConnecting: (supportPhone: string) =>
    ov(
      "kw_human",
      { support_phone: supportPhone },
      `Rentmaikar: Connecting you to support. An agent will respond shortly. Hours: 8AM-10PM daily. Call ${supportPhone}`,
    ),

  done: () =>
    `Rentmaikar: Noted! Thank you for confirming. Have a great day!`,

  fallback: () =>
    `Rentmaikar: Command not recognized. Reply HELP for available commands or STOP to opt out.`,

  rateLimited: () =>
    `Rentmaikar: Too many requests. Please wait a moment and try again.`,


  // ─── Emergency templates ───
  emergencyAck: (supportPhone: string) =>
    `Rentmaikar EMERGENCY: Your report has been received. Support is being notified. Call ${supportPhone} for immediate help.`,

  emergencyNoUser: (supportPhone: string) =>
    `Rentmaikar EMERGENCY: Call ${supportPhone} immediately for assistance. Register at rentmaikar.lovable.app for faster support.`,

  // ─── NLP-driven response templates ───
  intentPayment: () =>
    `Rentmaikar: Looks like you need payment help. Reply PAY to pay or BALANCE to check what's due.`,

  intentStatus: () =>
    `Rentmaikar: Need rental info? Reply STATUS for your active rental details.`,

  intentDocument: () =>
    `Rentmaikar: For document questions, reply DOC to check your status or visit rentmaikar.lovable.app/driver/dashboard`,

  intentSupport: (supportPhone: string) =>
    `Rentmaikar: Connecting you to a human agent. Reply HUMAN or call ${supportPhone} (8AM-10PM daily).`,

  intentGreeting: (name: string) =>
    `Rentmaikar: Hi ${name}! How can we help? Reply HELP for commands or type your question.`,

  intentComplaint: (supportPhone: string) =>
    `Rentmaikar: We're sorry you're having trouble. An agent will review your message. Call ${supportPhone} for urgent issues.`,

  intentNegotiation: () =>
    `Rentmaikar: To manage price negotiations, reply ACCEPT, REJECT, or COUNTER. Or visit your dashboard at rentmaikar.lovable.app`,

  intentNegotiationStatus: () =>
    `Rentmaikar: Your negotiation is being reviewed. Log in to your dashboard for full details and to respond.`,
};

// ═══════════════════════════════════════════════════════════
// SMS Sender (region-aware with retry, rate limiting, segmentation)
// ═══════════════════════════════════════════════════════════

const MAX_RETRIES = 3;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface SendSMSOptions {
  numberType?: SMSNumberType;
  supabase?: ReturnType<typeof createClient>;
  /** Only for STOP/START/HELP confirmations, which carriers require. */
  allowOptedOut?: boolean;
}

const sendSMS = async (
  to: string,
  message: string,
  options: SendSMSOptions = {},
): Promise<{ provider: string; externalId?: string; segments: number }> => {
  // ─── Opt-out guard: never contact a number after STOP ───
  if (!options.allowOptedOut && await isOptedOut(to, "sms", options.supabase as never)) {
    console.log(`[SMS] Suppressed — ${to} has opted out`);
    return { provider: "suppressed", segments: 0 };
  }

  const regionConfig = getRegionConfig(to);
  const region = to.startsWith("+234") ? "NIGERIA" : "USA";


  // ─── Rate limiting ───
  if (!checkGlobalRateLimit() || !checkRateLimit(region)) {
    console.warn(`[SMS] Rate limited for ${region}`);
    throw new Error("Rate limited — try again shortly");
  }

  // ─── Message segmentation ───
  const { segments, totalSegments, isConcatenated } = segmentMessage(message);
  if (isConcatenated) {
    console.log(`[SMS] Message segmented into ${totalSegments} parts for ${to}`);
  }

  const fromNumber = getFromNumber(to, options.numberType || "main");
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) await sleep(Math.pow(2, attempt) * 1000);

      if (regionConfig.provider === "termii") {
        const termiiApiKey = Deno.env.get("TERMII_API_KEY");
        if (!termiiApiKey) throw new Error("Termii SMS not configured");

        const cleanPhone = to.startsWith("+") ? to.replace("+", "") : to;

        for (const segment of segments) {
          const res = await fetch("https://api.ng.termii.com/api/sms/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: cleanPhone,
              from: regionConfig.senderId,
              sms: segment,
              type: "plain",
              channel: "generic",
              api_key: termiiApiKey,
              notify_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/termii-webhook`,
            }),
          });

          const data = await res.json();
          if (!res.ok || data.code !== "ok") throw new Error(data.message || "Termii SMS failed");
        }

        console.log(`[SMS] Sent ${totalSegments} segment(s) via Termii to ${to} [attempt ${attempt + 1}]`);
        return { provider: "termii", segments: totalSegments };
      }

      // ─── Twilio (USA / Default) ───
      const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
      const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
      assertTwilioMessagingEnabled();
      if (!accountSid || !authToken) throw new Error("Twilio SMS not configured");

      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
      const formData = new URLSearchParams();

      if (regionConfig.messagingServiceSid) {
        formData.append("MessagingServiceSid", regionConfig.messagingServiceSid);
      } else {
        formData.append("From", fromNumber);
      }

      formData.append("To", to);
      formData.append("Body", message);

      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      if (supabaseUrl) {
        formData.append("StatusCallback", `${supabaseUrl}/functions/v1/twilio-webhook`);
      }


      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Twilio SMS failed");

      console.log(`[SMS] Sent via Twilio to ${to} (${data.num_segments || totalSegments} segments) [attempt ${attempt + 1}]`);
      return { provider: "twilio", externalId: data.sid, segments: data.num_segments || totalSegments };

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`[SMS] Attempt ${attempt + 1} failed: ${lastError.message}`);
    }
  }

  // Escalate failed delivery
  if (options.supabase) {
    try {
      await options.supabase.from("inbox_conversations").insert({
        user_phone: to,
        channel: "sms",
        subject: `⚠️ Failed SMS delivery (${MAX_RETRIES} attempts)`,
        status: "open",
        priority: "urgent",
        region,
      });
    } catch (e) {
      console.error("[SMS Escalation]", e);
    }
  }

  throw lastError || new Error("SMS delivery failed");
};

// ═══════════════════════════════════════════════════════════
// Opt-out / Opt-in Management
// ═══════════════════════════════════════════════════════════

const handleOptOut = async (
  supabase: ReturnType<typeof createClient>,
  userId: string | null,
  phone: string,
  keyword: string,
): Promise<string> => {
  // Stops SMS *and* WhatsApp for this number, registered or not.
  await setOptOut(phone, true, {
    channel: "all",
    userId,
    source: "sms_keyword",
    keyword,
    supabase: supabase as never,
  });
  await recordKeywordConsent(supabase as never, {
    event: "stop",
    phone,
    userId,
    keyword,
    channel: "sms",
  });
  console.log(`[SMS Opt-Out] user=${userId ?? "unregistered"} phone=${phone}`);
  return SMS_TEMPLATES.optOutConfirm();
};

const handleOptIn = async (
  supabase: ReturnType<typeof createClient>,
  userId: string | null,
  phone: string,
  keyword: string,
): Promise<string> => {
  await setOptOut(phone, false, {
    channel: "all",
    userId,
    source: "sms_keyword",
    keyword,
    supabase: supabase as never,
  });
  await recordKeywordConsent(supabase as never, {
    event: "start",
    phone,
    userId,
    keyword,
    channel: "sms",
  });
  return SMS_TEMPLATES.optIn();
};



// ═══════════════════════════════════════════════════════════
// Emergency Handler
// ═══════════════════════════════════════════════════════════

const handleEmergency = async (
  supabase: ReturnType<typeof createClient>,
  phone: string,
  message: string,
  region: string,
  userId?: string,
  userName?: string,
): Promise<string> => {
  const supportPhone = getRegionConfig(phone).emergency;

  // Create urgent inbox conversation
  await supabase.from("inbox_conversations").insert({
    user_id: userId || null,
    user_name: userName || null,
    user_phone: phone,
    channel: "sms",
    subject: `🚨 EMERGENCY SMS from ${phone}`,
    status: "open",
    priority: "urgent",
    region,
  });

  // Create incident record if user is known
  if (userId) {
    try {
      // Check for active rental to link incident
      const { data: rental } = await supabase
        .from("rentals")
        .select("id, vehicle_id")
        .eq("driver_id", userId)
        .eq("status", "active")
        .limit(1)
        .single();

      if (rental) {
        await supabase.from("incidents").insert({
          reporter_id: userId,
          rental_id: rental.id,
          vehicle_id: rental.vehicle_id,
          incident_type: "accident",
          description: `Emergency SMS: ${message}`,
          status: "reported",
          severity: "high",
          reported_at: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn("[Emergency] Incident creation failed:", e);
    }

    // Attempt to notify admin via edge function
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      await fetch(`${supabaseUrl}/functions/v1/send-incident-notification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          type: "emergency_sms",
          phone,
          message,
          userId,
          userName,
          region,
        }),
      });
    } catch (e) {
      console.warn("[Emergency] Admin notification failed:", e);
    }
  }

  console.log(`[SMS EMERGENCY] phone=${phone} region=${region} user=${userId || "unknown"}`);

  return userId
    ? SMS_TEMPLATES.emergencyAck(supportPhone)
    : SMS_TEMPLATES.emergencyNoUser(supportPhone);
};

// ═══════════════════════════════════════════════════════════
// Payment Link Generator
// ═══════════════════════════════════════════════════════════

const generatePaymentLink = (driverId: string, amount: number, currency: string): string => {
  const baseUrl = "https://rentmaikar.lovable.app";
  const params = new URLSearchParams({
    driver: driverId, amount: amount.toString(), currency, ts: Date.now().toString(),
  });
  return `${baseUrl}/payment?${params.toString()}`;
};

// ═══════════════════════════════════════════════════════════
// Main Handler
// ═══════════════════════════════════════════════════════════

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const _authError = requireServiceRole(req);
  if (_authError) return _authError;


  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { from, to, text, channel } = await req.json();
    const rawBody = (text || "").trim();
    const command = rawBody.toUpperCase();

    // ─── Country detection from recipient number ───
    const { region, code: countryCode } = detectCountry(from, to);

    // Warm admin-managed message templates for this request.
    setTemplateCountry(countryCode);
    await preloadTemplates();



    console.log(`[SMS Command] From: ${from}, To: ${to || "N/A"}, Body: ${command}, Region: ${region}, Country: ${countryCode}`);

    // ════════════════════════════════════════════════
    // Priority 1: Emergency detection (before anything else)
    // ════════════════════════════════════════════════
    if (isEmergency(rawBody)) {
      // Quick user lookup for context
      const { data: profile } = await supabase
        .from("profiles").select("user_id, full_name").eq("phone", from).single();

      const emergencyMsg = await handleEmergency(
        supabase, from, rawBody, region,
        profile?.user_id, profile?.full_name
      );
      await sendSMS(from, emergencyMsg, { numberType: "emergency", supabase, allowOptedOut: true });

      // Log emergency
      try {
        await supabase.from("unified_message_log").insert([
          { user_id: profile?.user_id || null, channel: "sms", direction: "inbound", content: rawBody, status: "received", metadata: { type: "emergency", region } },
          { user_id: profile?.user_id || null, channel: "sms", direction: "outbound", content: emergencyMsg, status: "sent", metadata: { type: "emergency_response", region } },
        ]);
      } catch (e) { console.error("[SMS Log]", e); }

      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // ════════════════════════════════════════════════
    // Priority 2: Opt-out (before profile check to ensure compliance)
    // ════════════════════════════════════════════════
    if (isStopKeyword(rawBody)) {
      const { data: profile } = await supabase
        .from("profiles").select("user_id").eq("phone", from).maybeSingle();

      // Registered or not, the number is suppressed and gets one final confirmation.
      const msg = await handleOptOut(
        supabase,
        (profile as { user_id?: string } | null)?.user_id ?? null,
        from,
        command,
      );
      await sendSMS(from, msg, { supabase, allowOptedOut: true });
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // ════════════════════════════════════════════════
    // Priority 3: Opt-in (START)
    // ════════════════════════════════════════════════
    if (isStartKeyword(rawBody)) {
      const { data: profile } = await supabase
        .from("profiles").select("user_id").eq("phone", from).maybeSingle();
      const msg = await handleOptIn(
        supabase,
        (profile as { user_id?: string } | null)?.user_id ?? null,
        from,
        command,
      );
      await sendSMS(from, msg, { supabase, allowOptedOut: true });
      return new Response("OK", { status: 200, headers: corsHeaders });
    }


    // ─── Find user ───
    const { data: profile } = await supabase
      .from("profiles")
      .select("user_id, full_name, phone, notification_sms")
      .eq("phone", from)
      .single();

    if (!profile) {
      // HELP/INFO must be answered even for unregistered numbers (carrier requirement).
      if (command === "HELP" || command === "INFO") {
        await sendSMS(from, SMS_TEMPLATES.help(), { supabase, allowOptedOut: true });
        await recordKeywordConsent(supabase as never, {
          event: "help",
          phone: from,
          userId: null,
          keyword: command,
          channel: "sms",
        });
        return new Response("OK", { status: 200, headers: corsHeaders });
      }
      await sendSMS(from, SMS_TEMPLATES.unregistered(), { supabase });
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    const firstName = profile.full_name?.split(" ")[0] || "there";

    // ─── Check opt-out status (except for HELP/INFO) ───
    if (profile.notification_sms === false && command !== "HELP" && command !== "INFO") {
      console.log(`[SMS] User ${profile.user_id} opted out, skipping response`);
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // ════════════════════════════════════════════════
    // Keyword Processing
    // ════════════════════════════════════════════════
    let responseMessage = "";

    switch (command) {
      case "PAY":
      case "PAYMENT": {
        const { data: defaultPayment } = await supabase
          .from("payment_defaults")
          .select("amount_due, currency, rental_id")
          .eq("driver_id", profile.user_id)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (defaultPayment) {
          const curr = defaultPayment.currency === "NGN" ? "₦" : "$";
          const amount = `${curr}${Number(defaultPayment.amount_due).toLocaleString()}`;
          const link = generatePaymentLink(profile.user_id, Number(defaultPayment.amount_due), defaultPayment.currency);

          const { data: rental } = await supabase
            .from("rentals").select("vehicle_id").eq("id", defaultPayment.rental_id).single();
          let vehicleName = "your vehicle";
          if (rental?.vehicle_id) {
            const { data: v } = await supabase
              .from("vehicles").select("make, model").eq("id", rental.vehicle_id).single();
            if (v) vehicleName = `${v.make} ${v.model}`;
          }

          responseMessage = SMS_TEMPLATES.paymentDue(amount, vehicleName, link);
        } else {
          responseMessage = SMS_TEMPLATES.noPaymentDue();
        }
        break;
      }

      case "STATUS": {
        const { data: rental } = await supabase
          .from("rentals")
          .select("vehicle_id, daily_rate, currency, payment_frequency")
          .eq("driver_id", profile.user_id)
          .eq("status", "active")
          .limit(1)
          .single();

        if (rental) {
          const { data: v } = await supabase
            .from("vehicles").select("make, model, year").eq("id", rental.vehicle_id).single();
          const vehicleName = v ? `${v.year} ${v.make} ${v.model}` : "your vehicle";
          const curr = rental.currency === "NGN" ? "₦" : "$";
          const rate = `${curr}${rental.daily_rate}`;
          const freq = rental.payment_frequency === "weekly" ? "week" : "day";
          responseMessage = SMS_TEMPLATES.rentalStatus(vehicleName, rate, freq);
        } else {
          responseMessage = SMS_TEMPLATES.noRental();
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
        if (totalDue > 0) {
          const currency = defaults?.[0]?.currency || "USD";
          const curr = currency === "NGN" ? "₦" : "$";
          responseMessage = SMS_TEMPLATES.balance(`${curr}${totalDue.toLocaleString()}`);
        } else {
          responseMessage = SMS_TEMPLATES.balanceClear();
        }
        break;
      }

      case "DOC":
      case "DOCS": {
        const { data: userDocs } = await supabase
          .from("user_documents")
          .select("document_type, status")
          .eq("user_id", profile.user_id);

        const pending = userDocs?.filter(d => d.status === "pending").length || 0;
        const uploadedTypes = new Set(userDocs?.map(d => d.document_type) || []);
        const requiredDocs = region === "NIGERIA"
          ? ["driver_license", "nin", "bvn", "police_clearance"]
          : ["driver_license", "id_card"];
        const missing = requiredDocs.filter(d => !uploadedTypes.has(d)).length;

        if (missing === 0 && pending === 0) {
          responseMessage = SMS_TEMPLATES.docsComplete();
        } else {
          responseMessage = SMS_TEMPLATES.docStatus(pending, missing);
        }
        break;
      }

      case "HELP":
      case "INFO": {
        responseMessage = SMS_TEMPLATES.help();
        await recordKeywordConsent(supabase as never, {
          event: "help",
          phone: from,
          userId: profile.user_id ?? null,
          keyword: command,
          channel: "sms",
        });
        break;
      }


      case "LOCATION": {
        responseMessage = SMS_TEMPLATES.locationReceived();
        break;
      }

      case "DONE": {
        responseMessage = SMS_TEMPLATES.done();
        break;
      }

      case "4":
      case "HUMAN": {
        const supportNum = getRegionConfig(from).support;
        responseMessage = SMS_TEMPLATES.supportConnecting(supportNum);

        await supabase.from("inbox_conversations").insert({
          user_id: profile.user_id,
          user_name: profile.full_name,
          user_phone: from,
          channel: "sms",
          subject: `SMS Support Request from ${firstName}`,
          status: "open",
          priority: "normal",
          region,
        });
        break;
      }

      default: {
        // ════════════════════════════════════════════════
        // NLP Classification for natural language messages
        // ════════════════════════════════════════════════
        const classified = classifyIntent(rawBody);
        const supportPhone = getRegionConfig(from).support;

        console.log(`[SMS NLP] Intent: ${classified.intent} (${classified.confidence}), Language: ${classified.language}, Message: "${rawBody}"`);

        switch (classified.intent) {
          case "payment":
            responseMessage = SMS_TEMPLATES.intentPayment();
            break;
          case "status":
            responseMessage = SMS_TEMPLATES.intentStatus();
            break;
          case "document":
            responseMessage = SMS_TEMPLATES.intentDocument();
            break;
          case "support":
            responseMessage = SMS_TEMPLATES.intentSupport(supportPhone);
            // Also escalate to inbox
            await supabase.from("inbox_conversations").insert({
              user_id: profile.user_id,
              user_name: profile.full_name,
              user_phone: from,
              channel: "sms",
              subject: `SMS Support (NLP detected) from ${firstName}`,
              status: "open",
              priority: "normal",
              region,
            });
            break;
          case "greeting":
            responseMessage = SMS_TEMPLATES.intentGreeting(firstName);
            break;
          case "complaint":
            responseMessage = SMS_TEMPLATES.intentComplaint(supportPhone);
            // Escalate complaints
            await supabase.from("inbox_conversations").insert({
              user_id: profile.user_id,
              user_name: profile.full_name,
              user_phone: from,
              channel: "sms",
              subject: `⚠️ SMS Complaint from ${firstName}`,
              status: "open",
              priority: "high",
              region,
            });
            break;
          case "negotiation":
            responseMessage = SMS_TEMPLATES.intentNegotiation();
            // Escalate negotiation replies to inbox
            await supabase.from("inbox_conversations").insert({
              user_id: profile.user_id,
              user_name: profile.full_name,
              user_phone: from,
              channel: "sms",
              subject: `🤝 Negotiation reply from ${firstName}`,
              status: "open",
              priority: "high",
              region,
            });
            break;
          default:
            responseMessage = SMS_TEMPLATES.fallback();
        }
        break;
      }
    }

    // ─── Send response ───
    await sendSMS(from, responseMessage, { supabase, allowOptedOut: command === "HELP" || command === "INFO" });

    // ─── Log to unified_message_log ───
    try {
      await supabase.from("unified_message_log").insert([
        {
          user_id: profile.user_id,
          channel: "sms",
          direction: "inbound",
          content: rawBody,
          status: "received",
          metadata: { command, region, countryCode, provider: region === "NIGERIA" ? "termii" : "twilio" },
        },
        {
          user_id: profile.user_id,
          channel: "sms",
          direction: "outbound",
          content: responseMessage,
          status: "sent",
          metadata: { command, region, type: "auto_response" },
        },
      ]);
    } catch (e) {
      console.error("[SMS Log]", e);
    }

    return new Response("OK", { status: 200, headers: corsHeaders });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[SMS Commands Error]", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
