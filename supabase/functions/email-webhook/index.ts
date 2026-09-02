import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { EMAIL_CONFIG, formatSenderEmail } from "../_shared/email-config.ts";
import { logMessagingEvent } from "../_shared/messaging-events.ts";
import { maybeAutoReply } from "../_shared/auto-reply.ts";
import { forwardInboundEmail } from "../_shared/forwarding.ts";
import { resendSendEmail } from "../_shared/resend-gateway.ts";
import { verifySvixSignature } from "../_shared/svix-verify.ts";



const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature, webhook-id, webhook-timestamp, webhook-signature",
};

// ─── Attachment Validation ───
const ATTACHMENT_CONFIG = {
  maxSizeBytes: 10 * 1024 * 1024, // 10MB per file
  maxFiles: 10,
  allowedTypes: [
    "application/pdf",
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain", "text/csv",
  ],
  documentTypes: {
    "application/pdf": "document",
    "image/jpeg": "image", "image/png": "image", "image/gif": "image", "image/webp": "image",
    "application/msword": "document", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "document",
    "application/vnd.ms-excel": "spreadsheet", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "spreadsheet",
    "text/plain": "text", "text/csv": "spreadsheet",
  } as Record<string, string>,
};

// ─── Email Queue Routing ───
const EMAIL_QUEUES: Record<string, { queue: string; priority: string; category: string }> = {
  "support@rentmaikar.com":       { queue: "support",      priority: "normal",  category: "support_request" },
  "payments@rentmaikar.com":      { queue: "payments",     priority: "high",    category: "payment_query" },
  "documents@rentmaikar.com":     { queue: "documents",    priority: "normal",  category: "document_upload" },
  "admin@rentmaikar.com":         { queue: "admin",        priority: "high",    category: "admin_inquiry" },
  "legal@rentmaikar.com":         { queue: "legal",        priority: "high",    category: "legal" },
  "privacy@rentmaikar.com":       { queue: "legal",        priority: "high",    category: "legal" },
  "dpo@rentmaikar.com":           { queue: "legal",        priority: "high",    category: "legal" },
  "nigeria@rentmaikar.com":       { queue: "support",      priority: "normal",  category: "support_request" },
  "usa@rentmaikar.com":           { queue: "support",      priority: "normal",  category: "support_request" },
  "negotiations@rentmaikar.com":  { queue: "negotiations", priority: "high",    category: "negotiation" },
  "pricing@rentmaikar.com":       { queue: "negotiations", priority: "high",    category: "negotiation" },
  "noreply@rentmaikar.com":       { queue: "automated",    priority: "low",     category: "auto_reply" },
};

// ─── Weighted Classification Engine ───
interface ClassificationResult {
  category: string;
  subCategory: string;
  confidence: number;
  urgency: "low" | "normal" | "high" | "urgent";
  requiresTicket: boolean;
  documentType: string | null;
  isNigeria: boolean;
  language: string;
}

interface CategoryConfig {
  keywords: [string, number][]; // [keyword, weight]
  subCategories: Record<string, [string, number][]>;
  priority: "low" | "normal" | "high" | "urgent";
}

const CATEGORIES: Record<string, CategoryConfig> = {
  emergency: {
    keywords: [
      ["accident", 3], ["crash", 3], ["emergency", 3], ["towed", 2],
      ["hit and run", 3], ["collision", 3], ["injury", 3], ["fire", 3],
      ["911", 3], ["police report", 2],
    ],
    subCategories: {
      accident: [["accident", 2], ["crash", 2], ["collision", 2], ["hit and run", 2]],
      breakdown: [["breakdown", 2], ["towed", 2], ["stuck", 1], ["won't start", 2]],
      safety: [["fire", 2], ["injury", 2], ["emergency", 2], ["danger", 2]],
    },
    priority: "urgent",
  },
  complaint: {
    keywords: [
      ["complaint", 3], ["unhappy", 2], ["dissatisfied", 2], ["terrible", 2],
      ["awful", 2], ["angry", 2], ["worst", 2], ["disgusted", 2],
      ["unacceptable", 2], ["horrible", 2], ["ridiculous", 2],
    ],
    subCategories: {
      escalation: [["lawyer", 3], ["attorney", 3], ["sue", 3], ["bbb", 2], ["legal action", 3]],
      service: [["rude", 2], ["unprofessional", 2], ["poor service", 2], ["ignored", 2]],
      fraud: [["scam", 3], ["fraud", 3], ["stolen", 3], ["unauthorized", 2]],
    },
    priority: "urgent",
  },
  legal: {
    keywords: [
      ["legal", 2], ["subpoena", 3], ["court order", 3], ["gdpr", 3],
      ["data request", 2], ["privacy request", 2], ["ndpr", 3], ["ccpa", 3],
      ["delete my data", 3], ["lawsuit", 3], ["attorney", 2],
    ],
    subCategories: {
      data_request: [["gdpr", 2], ["ccpa", 2], ["ndpr", 2], ["delete my data", 3], ["data request", 2], ["privacy", 2]],
      court: [["subpoena", 3], ["court order", 3], ["lawsuit", 3], ["summons", 3]],
      inquiry: [["legal question", 1], ["legal", 1]],
    },
    priority: "high",
  },
  payment_query: {
    keywords: [
      ["payment", 2], ["charge", 1], ["bill", 1], ["invoice", 2],
      ["receipt", 1], ["refund", 2], ["billing", 2], ["balance", 1],
      ["payout", 2], ["withdraw", 2], ["transaction", 1],
    ],
    subCategories: {
      failed: [["failed", 2], ["declined", 2], ["didn't work", 2], ["error", 1], ["rejected", 2]],
      dispute: [["dispute", 3], ["wrong charge", 3], ["unauthorized", 2], ["overcharg", 2], ["double charge", 3]],
      refund: [["refund", 3], ["money back", 2], ["reimburse", 2], ["wrong amount", 2]],
      receipt: [["receipt", 2], ["invoice", 2], ["statement", 1], ["history", 1]],
    },
    priority: "normal",
  },
  document_upload: {
    keywords: [
      ["document", 2], ["upload", 2], ["verify", 1], ["submit", 2],
      ["license", 2], ["insurance", 2], ["registration", 2],
      ["expired", 2], ["renewal", 2], ["certificate", 1],
    ],
    subCategories: {
      submission: [["upload", 2], ["send", 1], ["attach", 2], ["submit", 2], ["here is", 1]],
      status: [["status", 2], ["approved", 2], ["pending", 2], ["verified", 2], ["check", 1]],
      expiry: [["expire", 2], ["expiry", 2], ["expiration", 2], ["renew", 2], ["renewal", 2]],
    },
    priority: "normal",
  },
  support_request: {
    keywords: [
      ["help", 1], ["issue", 1], ["problem", 1], ["not working", 2],
      ["error", 1], ["can't", 1], ["vehicle", 1], ["car", 1],
      ["rental", 1], ["booking", 1], ["pickup", 1], ["return", 1],
    ],
    subCategories: {
      technical: [["login", 2], ["app", 2], ["website", 2], ["crash", 1], ["bug", 2], ["glitch", 2]],
      account: [["account", 2], ["profile", 2], ["password", 2], ["locked", 2], ["reset", 1]],
      vehicle: [["car issue", 2], ["breakdown", 2], ["damage", 2], ["vehicle", 1], ["key", 2], ["ignition", 2]],
      iot: [["tracker", 2], ["gps", 2], ["iot", 2], ["device", 1], ["tracking", 2], ["telemetry", 2]],
      booking: [["booking", 2], ["reservation", 2], ["pickup", 2], ["return", 1], ["extend", 2]],
    },
    priority: "normal",
  },
  negotiation: {
    keywords: [
      ["negotiation", 3], ["negotiate", 3], ["price negotiation", 3],
      ["counter offer", 3], ["counteroffer", 3], ["price offer", 2],
      ["accept offer", 3], ["reject offer", 3], ["decline offer", 3],
      ["approve price", 3], ["lock price", 3], ["price lock", 3],
      ["modify price", 2], ["price modification", 3], ["rate change", 2],
      ["daily rate", 2], ["weekly rate", 2], ["rental rate", 2],
      ["price request", 2], ["pricing", 1], ["offer", 1],
    ],
    subCategories: {
      submission: [["submit", 2], ["new negotiation", 3], ["propose", 2], ["request price", 2]],
      approval: [["accept", 3], ["approve", 3], ["agreed", 2], ["confirm price", 3]],
      rejection: [["reject", 3], ["decline", 3], ["refuse", 2], ["too high", 2], ["too expensive", 2]],
      counter: [["counter", 3], ["counteroffer", 3], ["counter offer", 3], ["alternative price", 2]],
      modification: [["modify", 2], ["change price", 2], ["update rate", 2], ["price modification", 3], ["adjust", 2]],
      lock: [["lock", 3], ["finalize", 2], ["lock price", 3], ["confirm rate", 2], ["locked", 2]],
    },
    priority: "high",
  },
};

// ─── Nigeria-Specific Keywords ───
const NIGERIA_KEYWORDS: [string, string][] = [
  ["police report", "policeReport"], ["police clearance", "policeReport"],
  ["nigerian police", "policeReport"], ["clearance certificate", "policeReport"],
  ["nin", "nin"], ["national id", "nin"], ["national identification", "nin"],
  ["bvn", "bvn"], ["bank verification", "bvn"],
  ["lagos", ""], ["abuja", ""], ["nigeria", ""],
  ["road worthiness", "roadWorthiness"], ["roadworthy", "roadWorthiness"],
  ["c-caution", "safetyEquipment"], ["fire extinguisher", "safetyEquipment"],
  ["wahala", ""], ["wetin", ""], ["abeg", ""],
];

// ─── Language Detection ───
function detectLanguage(text: string): string {
  const lower = text.toLowerCase();
  // Yoruba
  if (/bawo ni|mo fe|e kaaro|e ku irole|o dabo/i.test(lower)) return "yo";
  // Hausa
  if (/ina kwana|yaya|sannu|na gode|barka/i.test(lower)) return "ha";
  // Pidgin English
  if (/how you dey|wetin|abeg|na wa|wahala|no vex|oya/i.test(lower)) return "pcm";
  // Igbo
  if (/kedu|ndewo|daalu|biko/i.test(lower)) return "ig";
  // Spanish (possible US users)
  if (/hola|como estas|gracias|por favor/i.test(lower)) return "es";
  return "en";
}

// ─── Document Type Detection ───
function detectDocumentType(text: string, isNigeria: boolean): string | null {
  const lower = text.toLowerCase();

  // Nigeria-specific documents first
  if (isNigeria) {
    if (/police|clearance/.test(lower)) return "policeReport";
    if (/\bni[n]\b|national\s*id/.test(lower)) return "nin";
    if (/\bbvn\b|bank\s*verification/.test(lower)) return "bvn";
    if (/road\s*worthi?ness/.test(lower)) return "roadWorthiness";
    if (/c-caution|fire\s*extinguisher|safety\s*equipment/.test(lower)) return "safetyEquipment";
  }

  // Universal document types
  if (/driver.?s?\s*licen[sc]e|driving\s*licen[sc]e/.test(lower)) return "driverLicense";
  if (/insurance|policy|coverage/.test(lower)) return "insurance";
  if (/vehicle\s*reg|registration/.test(lower)) return "vehicleRegistration";
  if (/inspection|roadworthy|mot/.test(lower)) return "inspection";
  if (/vin\b|vehicle\s*identification/.test(lower)) return "vin";
  if (/proof\s*of\s*ownership/.test(lower)) return "proofOfOwnership";

  return null;
}

function classifyEmailContent(subject: string, body: string, hasAttachments: boolean): ClassificationResult {
  const text = `${subject} ${body}`.toLowerCase();

  // ─── Detect Nigeria context ───
  const isNigeria = NIGERIA_KEYWORDS.some(([kw]) => text.includes(kw.toLowerCase()));

  // ─── Detect language ───
  const language = detectLanguage(text);

  // ─── Score each category ───
  const scores: Record<string, { total: number; bestSub: string; subScore: number }> = {};

  for (const [catName, config] of Object.entries(CATEGORIES)) {
    let total = 0;
    let bestSub = "general";
    let bestSubScore = 0;

    // Score main keywords
    for (const [keyword, weight] of config.keywords) {
      if (text.includes(keyword.toLowerCase())) {
        total += weight;
      }
    }

    // Score sub-categories (weighted 2x)
    for (const [subName, subKeywords] of Object.entries(config.subCategories)) {
      let subScore = 0;
      for (const [keyword, weight] of subKeywords) {
        if (text.includes(keyword.toLowerCase())) {
          subScore += weight * 2;
        }
      }
      if (subScore > bestSubScore) {
        bestSubScore = subScore;
        bestSub = subName;
      }
      total += subScore;
    }

    scores[catName] = { total, bestSub, subScore: bestSubScore };
  }

  // ─── Attachment bonus for document_upload ───
  if (hasAttachments && scores.document_upload) {
    scores.document_upload.total += 3;
    if (scores.document_upload.subScore === 0) {
      scores.document_upload.bestSub = "submission";
    }
  }

  // ─── Find best category ───
  const sorted = Object.entries(scores).sort((a, b) => b[1].total - a[1].total);
  const best = sorted[0];
  const bestCatName = best[0];
  const bestCatInfo = best[1];

  // Normalize confidence (cap at 1.0)
  const maxPossibleScore = 30; // reasonable max
  const confidence = Math.min(bestCatInfo.total / maxPossibleScore, 1.0);

  // If no meaningful match
  if (bestCatInfo.total === 0) {
    return {
      category: "general_inquiry", subCategory: "general", confidence: 0.1,
      urgency: "low", requiresTicket: false, documentType: null, isNigeria, language,
    };
  }

  const catConfig = CATEGORIES[bestCatName];
  const urgency = catConfig.priority;

  // Determine if ticket required
  const requiresTicket = confidence > 0.15 ||
    bestCatName === "complaint" ||
    bestCatName === "legal" ||
    bestCatName === "emergency" ||
    urgency === "high" || urgency === "urgent";

  // Detect document type
  let documentType: string | null = null;
  if (bestCatName === "document_upload" || hasAttachments) {
    documentType = detectDocumentType(text, isNigeria);
  }

  // Upgrade priority for refund/dispute sub-categories
  let finalUrgency = urgency;
  if (bestCatName === "payment_query" && (bestCatInfo.bestSub === "dispute" || bestCatInfo.bestSub === "refund")) {
    finalUrgency = "high";
  }

  return {
    category: bestCatName,
    subCategory: bestCatInfo.bestSub,
    confidence,
    urgency: finalUrgency,
    requiresTicket,
    documentType,
    isNigeria,
    language,
  };
}

// ─── Auto-Reply Detection ───
function isAutoReply(headers: Record<string, string> | null, subject: string): boolean {
  if (!headers) return false;
  // Check standard auto-reply headers
  if (headers["auto-submitted"] && headers["auto-submitted"] !== "no") return true;
  if (headers["x-auto-response-suppress"]) return true;
  if (headers["precedence"] === "bulk" || headers["precedence"] === "junk") return true;
  // Check subject for auto-reply patterns
  if (/^(Auto:|Automatic reply|Out of office|OOO:)/i.test(subject)) return true;
  return false;
}

// ─── Estimated Response Time ───
function getEstimatedResponseTime(priority: string): string {
  switch (priority) {
    case "urgent": return "2 hours";
    case "high": return "4 hours";
    case "normal": return "24 hours";
    default: return "48 hours";
  }
}

// ─── Auto-Acknowledgment Templates ───
function getAcknowledgmentHtml(
  category: string,
  senderName: string,
  ticketId: string,
  attachmentsSummary: { accepted: number; rejected: string[] },
  responseTime: string,
): { subject: string; html: string } {
  const name = senderName.split(/[<@]/)[0].trim() || "there";
  const ref = ticketId.slice(0, 8).toUpperCase();

  // Attachment status section
  let attachmentHtml = "";
  if (attachmentsSummary.accepted > 0 || attachmentsSummary.rejected.length > 0) {
    attachmentHtml = `<div style="background:#f0f9ff;border-radius:8px;padding:16px;margin:16px 0;">
      <strong>📎 Attachments:</strong><br/>`;
    if (attachmentsSummary.accepted > 0) {
      attachmentHtml += `<span style="color:#16a34a;">✓ ${attachmentsSummary.accepted} file(s) received successfully</span><br/>`;
    }
    for (const reason of attachmentsSummary.rejected) {
      attachmentHtml += `<span style="color:#dc2626;">✗ ${reason}</span><br/>`;
    }
    attachmentHtml += `</div>`;
  }

  const templates: Record<string, { subject: string; body: string }> = {
    complaint: {
      subject: `We've received your concern [#${ref}]`,
      body: `<p>Hi ${name},</p>
        <p>We take your concerns very seriously. A senior support specialist has been assigned to your case and will respond within <strong>${responseTime}</strong>.</p>
        <p>Your reference number: <strong>#${ref}</strong></p>
        ${attachmentHtml}`,
    },
    emergency: {
      subject: `URGENT: Your emergency report [#${ref}]`,
      body: `<p>Hi ${name},</p>
        <p>We've received your emergency report and our team has been <strong>immediately notified</strong>.</p>
        <p>If you need immediate assistance, please call:</p>
        <ul>
          <li>🇺🇸 USA: <strong>+1 (608) 384-3932</strong></li>
          <li>🇳🇬 Nigeria: <strong>+234 803 555 0123</strong></li>
        </ul>
        <p>Reference: <strong>#${ref}</strong></p>
        ${attachmentHtml}`,
    },
    legal: {
      subject: `Legal inquiry received [#${ref}]`,
      body: `<p>Hi ${name},</p>
        <p>Your legal inquiry has been forwarded to our legal team at <strong>${EMAIL_CONFIG.legal}</strong>. We will respond within <strong>${responseTime}</strong>.</p>
        <p>Reference: <strong>#${ref}</strong></p>
        ${attachmentHtml}`,
    },
    payment_query: {
      subject: `Payment inquiry received [#${ref}]`,
      body: `<p>Hi ${name},</p>
        <p>We've received your payment-related inquiry. Our billing team will review and respond within <strong>${responseTime}</strong>.</p>
        <p>Reference: <strong>#${ref}</strong></p>
        ${attachmentHtml}`,
    },
    document_upload: {
      subject: `Document submission received [#${ref}]`,
      body: `<p>Hi ${name},</p>
        <p>We've received your document submission. Our verification team will review it within <strong>1-2 business days</strong>.</p>
        <p>Reference: <strong>#${ref}</strong></p>
        ${attachmentHtml}`,
    },
    support_request: {
      subject: `We received your message [#${ref}]`,
      body: `<p>Hi ${name},</p>
        <p>Thank you for reaching out. A support agent will respond within <strong>${responseTime}</strong>.</p>
        <p>Reference: <strong>#${ref}</strong></p>
        ${attachmentHtml}`,
    },
    negotiation: {
      subject: `Price negotiation received [#${ref}]`,
      body: `<p>Hi ${name},</p>
        <p>We've received your price negotiation request. Our team will review your proposal and respond within <strong>${responseTime}</strong>.</p>
        <p>You can also manage your negotiations directly from your dashboard for faster processing.</p>
        <p>Reference: <strong>#${ref}</strong></p>
        ${attachmentHtml}`,
    },
    general_inquiry: {
      subject: `Thanks for contacting Rentmaikar [#${ref}]`,
      body: `<p>Hi ${name},</p>
        <p>We received your email and will get back to you as soon as possible.</p>
        <p>Reference: <strong>#${ref}</strong></p>
        ${attachmentHtml}`,
    },
  };

  const t = templates[category] || templates.general_inquiry;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #2563eb, #3b82f6); padding: 24px; text-align: center; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">🚗 Rentmaikar</h1>
      </div>
      <div style="padding: 32px; background: #fff; border: 1px solid #e2e8f0;">
        ${t.body}
        <hr style="margin: 24px 0; border: none; border-top: 1px solid #e2e8f0;">
        <p style="color: #64748b; font-size: 13px;">
          Please do not change the subject line when replying so we can track your conversation.
        </p>
      </div>
      <div style="background: #f8fafc; padding: 16px; text-align: center; font-size: 12px; color: #94a3b8; border-radius: 0 0 12px 12px;">
        <p>© ${new Date().getFullYear()} Rentmaikar. All rights reserved.</p>
        <p>Email: ${EMAIL_CONFIG.support}</p>
      </div>
    </div>`;

  return { subject: t.subject, html };
}

// ─── Inbound Email Webhook Signature Verification ───
// Uses the shared Svix verifier so `svix-id`/`svix-timestamp` signed payloads
// (Resend / Lovable email events) validate correctly, with a raw-body HMAC
// fallback. Fails closed when RESEND_WEBHOOK_SECRET is not configured.
const verifyResendSignature = async (req: Request): Promise<boolean> => {
  try {
    const webhookSecret = Deno.env.get('RESEND_WEBHOOK_SECRET');
    if (!webhookSecret) {
      console.error('RESEND_WEBHOOK_SECRET not configured - rejecting email webhook request');
      return false;
    }
    const body = await req.clone().text();
    return await verifySvixSignature(req, body, webhookSecret);
  } catch {
    return false;
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ─── Email Webhook Signature Verification ───
  if (req.method === "POST") {
    const isValid = await verifyResendSignature(req);
    if (!isValid) {
      console.warn('Invalid email webhook signature - rejecting request');
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload = await req.json();
    console.log("Email webhook received:", JSON.stringify(payload).slice(0, 500));

    const { from, to, subject, text, html: htmlBody, headers: emailHeaders, attachments } = payload;

    // ─── Sender parsing ───
    const senderRaw = Array.isArray(from) ? from[0] : from;
    const recipientEmail = (Array.isArray(to) ? to[0] : to)?.toLowerCase() || "";
    let senderName = senderRaw;
    let senderAddress = senderRaw;
    const emailMatch = senderRaw.match(/^(.+?)\s*<(.+)>$/);
    if (emailMatch) {
      senderName = emailMatch[1].trim();
      senderAddress = emailMatch[2].trim();
    }

    // ─── Auto-reply / bounce detection ───
    if (isAutoReply(emailHeaders, subject || "")) {
      console.log("Ignoring auto-reply from:", senderAddress);
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "auto_reply" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Queue routing by recipient ───
    const queueInfo = EMAIL_QUEUES[recipientEmail] || { queue: "support", priority: "normal", category: "support_request" };

    if (queueInfo.category === "auto_reply") {
      console.log("Ignoring noreply bounce from:", senderAddress);
      return new Response(JSON.stringify({ success: true, skipped: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Multi-recipient routing (handle CC / multiple To) ───
    const allRecipients = Array.isArray(to) ? to.map((t: string) => t.toLowerCase()) : [recipientEmail];
    const queuesHit = allRecipients
      .map((addr: string) => EMAIL_QUEUES[addr])
      .filter(Boolean);
    // Use highest priority queue if multiple matched
    const effectiveQueue = queuesHit.sort((a: typeof queueInfo, b: typeof queueInfo) => {
      const priorityOrder: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
      return (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3);
    })[0] || queueInfo;

    // ─── Content extraction ───
    let messageContent = text || "";
    if (!messageContent && htmlBody) {
      messageContent = htmlBody
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    // ─── Look up sender in profiles ───
    let userId: string | null = null;
    const { data: profile } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .eq("email", senderAddress)
      .limit(1)
      .single();
    if (profile) {
      userId = profile.user_id;
      if (!senderName || senderName === senderAddress) {
        senderName = profile.full_name || senderName;
      }
    }

    // ─── Content classification (weighted scoring) ───
    const hasAttachments = attachments && Array.isArray(attachments) && attachments.length > 0;
    const classification = classifyEmailContent(subject || "", messageContent, !!hasAttachments);

    // ─── Region detection (recipient + classifier Nigeria flag) ───
    let region = "USA";
    if (recipientEmail.includes("nigeria") || recipientEmail.includes(".ng") || classification.isNigeria) {
      region = "Nigeria";
    }

    const finalCategory = classification.confidence > 0.15 ? classification.category : effectiveQueue.category;
    const finalPriority = classification.urgency === "urgent" ? "urgent" :
      classification.urgency === "high" ? "high" : effectiveQueue.priority;

    console.log(`Email classified: queue=${effectiveQueue.queue}, category=${finalCategory}, sub=${classification.subCategory}, priority=${finalPriority}, lang=${classification.language}, nigeria=${classification.isNigeria}, user=${userId || "unknown"}`);

    // ─── Find or create conversation ───
    const { data: existingConversation, error: findError } = await supabase
      .from("inbox_conversations")
      .select("*")
      .eq("user_email", senderAddress)
      .eq("channel", "email")
      .neq("status", "closed")
      .order("last_message_at", { ascending: false })
      .limit(1)
      .single();

    let conversationId: string;

    if (existingConversation && !findError) {
      conversationId = existingConversation.id;
      await supabase
        .from("inbox_conversations")
        .update({
          last_message_at: new Date().toISOString(),
          status: "open",
          priority: finalPriority,
          updated_at: new Date().toISOString(),
          subject: subject || existingConversation.subject,
          user_id: userId || existingConversation.user_id,
        })
        .eq("id", conversationId);
      console.log("Updated conversation:", conversationId);
    } else {
      const { data: newConv, error: createError } = await supabase
        .from("inbox_conversations")
        .insert({
          channel: "email",
          region,
          user_email: senderAddress,
          user_name: senderName,
          user_id: userId,
          status: "open",
          priority: finalPriority,
          subject: subject || "No subject",
          last_message_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (createError) throw createError;
      conversationId = newConv.id;
      console.log("Created conversation:", conversationId);
    }

    // ─── Attachment processing with validation ───
    interface ProcessedAttachment {
      filename: string;
      status: "accepted" | "rejected";
      reason?: string;
      url?: string;
      contentType?: string;
      size?: number;
      fileType?: string;
    }

    const processedAttachments: ProcessedAttachment[] = [];
    const attachmentUrls: string[] = [];

    if (hasAttachments) {
      const files = attachments.slice(0, ATTACHMENT_CONFIG.maxFiles);
      if (attachments.length > ATTACHMENT_CONFIG.maxFiles) {
        processedAttachments.push({
          filename: `(${attachments.length - ATTACHMENT_CONFIG.maxFiles} extra files)`,
          status: "rejected",
          reason: `Maximum ${ATTACHMENT_CONFIG.maxFiles} files allowed`,
        });
      }

      for (const attachment of files) {
        try {
          const { filename, content, contentType, size } = attachment;
          if (!content || !filename) continue;

          // Size validation
          const estimatedSize = size || Math.ceil(content.length * 0.75); // base64 to bytes estimate
          if (estimatedSize > ATTACHMENT_CONFIG.maxSizeBytes) {
            processedAttachments.push({
              filename,
              status: "rejected",
              reason: `File too large (max ${ATTACHMENT_CONFIG.maxSizeBytes / 1024 / 1024}MB)`,
            });
            console.warn(`Attachment rejected (too large): ${filename} (${estimatedSize} bytes)`);
            continue;
          }

          // Type validation
          const mimeType = (contentType || "application/octet-stream").split(";")[0].trim();
          if (!ATTACHMENT_CONFIG.allowedTypes.includes(mimeType)) {
            processedAttachments.push({
              filename,
              status: "rejected",
              reason: `File type not allowed: ${mimeType}`,
            });
            console.warn(`Attachment rejected (type): ${filename} (${mimeType})`);
            continue;
          }

          // Decode and upload
          const binaryData = Uint8Array.from(atob(content), (c) => c.charCodeAt(0));
          const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
          const filePath = `email-attachments/${conversationId}/${Date.now()}-${sanitizedFilename}`;

          const { error: uploadError } = await supabase.storage
            .from("chat-attachments")
            .upload(filePath, binaryData, { contentType: mimeType });

          if (uploadError) {
            processedAttachments.push({ filename, status: "rejected", reason: `Upload failed: ${uploadError.message}` });
            console.warn("Upload failed:", filename, uploadError.message);
          } else {
            const { data: urlData } = supabase.storage.from("chat-attachments").getPublicUrl(filePath);
            attachmentUrls.push(urlData.publicUrl);
            const fileType = ATTACHMENT_CONFIG.documentTypes[mimeType] || "other";
            processedAttachments.push({
              filename, status: "accepted", url: urlData.publicUrl,
              contentType: mimeType, size: estimatedSize, fileType,
            });
            console.log(`Attachment accepted: ${filename} (${fileType})`);
          }
        } catch (e) {
          console.warn("Attachment processing error:", e);
        }
      }
    }

    // ─── Save message ───
    const messageIdHeader = emailHeaders?.["message-id"] || emailHeaders?.["Message-ID"] || null;
    const { error: messageError } = await supabase
      .from("inbox_messages")
      .insert({
        conversation_id: conversationId,
        channel: "email",
        content: messageContent,
        sender_type: "user",
        sender_name: senderName,
        sender_id: userId,
        external_id: messageIdHeader,
        metadata: {
          subject,
          from: senderAddress,
          to: recipientEmail,
          all_recipients: allRecipients,
          queue: effectiveQueue.queue,
          category: finalCategory,
          sub_category: classification.subCategory,
          classification_confidence: classification.confidence,
          priority: finalPriority,
          requires_ticket: classification.requiresTicket,
          document_type: classification.documentType,
          is_nigeria: classification.isNigeria,
          language: classification.language,
          has_attachments: attachmentUrls.length > 0,
          attachment_count: attachmentUrls.length,
          attachment_urls: attachmentUrls,
          attachments_detail: processedAttachments,
        },
      });

    if (messageError) throw messageError;

    // ─── Log to unified_message_log ───
    try {
      await supabase.from("unified_message_log").insert({
        user_id: userId,
        user_name: senderName,
        region,
        provider: "resend",
        direction: "inbound",
        message_type: finalCategory,
        message_body: messageContent.slice(0, 2000),
        delivery_status: "delivered",
        provider_message_id: messageIdHeader,
        conversation_id: conversationId,
        template_name: null,
        language: classification.language,
        metadata: { queue: effectiveQueue.queue, sub_category: classification.subCategory, is_nigeria: classification.isNigeria, document_type: classification.documentType, attachments: processedAttachments.length },
      });
    } catch (logErr) {
      console.warn("Unified log insert error:", logErr);
    }

    console.log("Email message saved successfully");

    // Optional keyword auto-reply
    await maybeAutoReply(supabase, {
      conversationId,
      content: messageContent || "",
      channel: "email",
      region,
      recipientEmail: senderAddress,
    });


    // ─── Notify support team for urgent/high priority ───
    if (finalPriority === "urgent" || finalPriority === "high") {
      try {
        await supabase.from("admin_daily_tasks").insert({
          category: finalCategory === "emergency" ? "incident" : "support",
          title: `${finalPriority.toUpperCase()} email: ${(subject || "No subject").slice(0, 80)}`,
          description: `From ${senderName} (${senderAddress}). Category: ${finalCategory}/${classification.subCategory}. Conversation: ${conversationId}`,
          priority: finalPriority === "urgent" ? "critical" : "high",
          source_table: "inbox_conversations",
          source_id: conversationId,
        });
        console.log("Admin task created for priority email");
      } catch (taskErr) {
        console.warn("Admin task creation error:", taskErr);
      }
    }

    // ─── Send auto-acknowledgment ───
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (RESEND_API_KEY) {
      try {
        const responseTime = getEstimatedResponseTime(finalPriority);
        const attachmentsSummary = {
          accepted: processedAttachments.filter(a => a.status === "accepted").length,
          rejected: processedAttachments.filter(a => a.status === "rejected").map(a => `${a.filename}: ${a.reason}`),
        };
        const ack = getAcknowledgmentHtml(finalCategory, senderName, conversationId, attachmentsSummary, responseTime);
        if (ack.subject) {
          // Use the appropriate from address based on category
          const fromType = finalCategory === "legal" ? "legal" :
            finalCategory === "payment_query" ? "payments" : "support";

          const ackResponse = await resendSendEmail({
              from: formatSenderEmail(fromType as keyof typeof EMAIL_CONFIG),
              to: [senderAddress],
              subject: ack.subject,
              html: ack.html,
            }, RESEND_API_KEY);

          if (ackResponse.ok) {
            const ackResult = await ackResponse.json();
            console.log("Auto-acknowledgment sent:", ackResult.id);
            // Log outbound ack
            try {
              await supabase.from("unified_message_log").insert({
                user_id: userId,
                user_name: senderName,
                region,
                provider: "resend",
                direction: "outbound",
                message_type: "auto_acknowledgment",
                message_body: `Auto-ack for ${finalCategory} [#${conversationId.slice(0, 8)}]`,
                delivery_status: "sent",
                provider_message_id: ackResult.id,
                conversation_id: conversationId,
                template_name: `ack_${finalCategory}`,
                language: "en",
              });
            } catch (_) { /* non-critical */ }
          } else {
            const errText = await ackResponse.text();
            console.warn("Ack email failed:", errText);
          }
        }
      } catch (ackErr) {
        console.warn("Auto-acknowledgment error:", ackErr);
      }
    }

    // ─── Forward a copy to the configured regional support mailbox ───
    const emailForward = await forwardInboundEmail(supabase, {
      region,
      fromAddress: senderAddress,
      fromName: senderName,
      subject: subject || "",
      body: messageContent,
      htmlBody: htmlBody || null,
    });
    if (emailForward.forwarded) {
      await logMessagingEvent(supabase, {
        channel: "email",
        provider: "resend",
        event_type: "forwarded",
        direction: "outbound",
        sender: recipientAddress,
        region,
        conversation_id: conversationId,
        user_id: userId,
        metadata: { forwarded_from: senderAddress },
      });
    }

    // Log inbound email event

    await logMessagingEvent(supabase, {
      channel: 'email',
      provider: 'resend',
      event_type: 'received',
      direction: 'inbound',
      recipient: recipientAddress,
      sender: senderAddress,
      region,
      conversation_id: conversationId,
      user_id: userId,
      metadata: { category: finalCategory, sub_category: classification.subCategory, priority: finalPriority },
    });

    return new Response(
      JSON.stringify({
        success: true,
        conversationId,
        category: finalCategory,
        subCategory: classification.subCategory,
        priority: finalPriority,
        attachments: {
          accepted: processedAttachments.filter(a => a.status === "accepted").length,
          rejected: processedAttachments.filter(a => a.status === "rejected").length,
        },
        userId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Email webhook error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
