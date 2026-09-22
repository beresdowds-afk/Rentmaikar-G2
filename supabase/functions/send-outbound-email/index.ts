import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { EMAIL_CONFIG, formatSenderEmail } from "../_shared/email-config.ts";
import { logMessagingEvent } from "../_shared/messaging-events.ts";
import { requireServiceRoleOrRole } from "../_shared/auth-guards.ts";
import { outboundPausedResponse } from "../_shared/channel-guard.ts";
import { logOutboundDecision } from "../_shared/outbound-audit.ts";
import {
  welcomeDriverEmail,
  welcomeOwnerEmail,
  otpEmail,
  bookingConfirmationEmail,
  ownerBookingNotificationEmail,
  paymentReceiptEmail,
  paymentFailedEmail,
  ownerPayoutEmail,
  paymentReminderEmail,
  paymentOverdueEmail,
  vehicleLockdownEmail,
  vehicleUnlockedEmail,
  planDowngradeEmail,
  documentVerifiedEmail,
  documentVerificationFailedEmail,
  documentExpiryWarningEmail,
  vehicleListedEmail,
  vehicleAssignedEmail,
  vehicleMaintenanceReminderEmail,
  policeReportRequiredEmail,
  ninVerificationEmail,
  supportTicketCreatedEmail,
  supportTicketResponseEmail,
  vehicleShutdownEmail,
  accidentAlertEmail,
  seasonalPromotionEmail,
  adminDailyReportEmail,
  negotiationSubmittedEmail,
  negotiationApprovedEmail,
  negotiationRejectedEmail,
  negotiationCounterOfferEmail,
  negotiationLockedEmail,
  negotiationModificationRequestEmail,
  negotiationModificationProcessedEmail,
  emailVerificationEmail,
  passwordResetEmail,
  loginAlertEmail,
  accountDeactivatedEmail,
  personaStatusUpdateEmail,
  personaStatusDigestEmail,
  providerHealthAlertEmail,
  eventNotificationEmail,

} from "../_shared/email-templates.ts";
import { resendSendEmail } from "../_shared/resend-gateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Priority Mapping ───
const PRIORITY_VALUES: Record<string, number> = {
  critical: 1,
  high: 2,
  normal: 3,
  low: 4,
};

// ─── Source Address Router ───
function getSourceAddress(category: string, country?: string): string {
  if (category === "payment" || category === "payment_receipt" || category === "payment_failed" || category === "owner_payout") {
    return formatSenderEmail("payments");
  }
  if (category === "document" || category === "document_verified" || category === "document_expiry") {
    return formatSenderEmail("support");
  }
  if (category === "admin" || category === "emergency") {
    return formatSenderEmail("admin");
  }
  if (category === "legal") {
    return formatSenderEmail("legal");
  }
  if (category === "support") {
    return formatSenderEmail("support");
  }
  if (category === "negotiation") {
    return formatSenderEmail("negotiations");
  }
  if (category === "verification" || category === "auth") {
    return formatSenderEmail("verify");
  }
  if (category === "notification") {
    return formatSenderEmail("notifications");
  }
  return formatSenderEmail("noreply");
}

// ─── Composed Email HTML Formatter ───
function formatComposedEmailHtml(bodyText: string, recipientName?: string): string {
  const greeting = recipientName && recipientName !== "Customer" && recipientName !== "there"
    ? `<p style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #0f172a;">Hello ${recipientName},</p>`
    : "";
  const paragraphs = String(bodyText)
    .split(/\n\n+/)
    .map((p) => `<p style="margin: 0 0 16px 0; line-height: 1.6; color: #334155; font-size: 15px;">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f8fafc;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
          <tr>
            <td style="background-color:#0f172a;padding:24px 32px;text-align:left;">
              <span style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">Rentmaikar</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;color:#334155;">
              ${greeting}
              ${paragraphs}
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;padding:20px 32px;border-top:1px solid #f1f5f9;text-align:center;font-size:12px;color:#64748b;">
              <p style="margin:0 0 6px 0;">Rentmaikar Mobility Solutions &middot; Communications Hub</p>
              <p style="margin:0;">Support: <a href="mailto:support@rentmaikar.com" style="color:#0284c7;text-decoration:none;">support@rentmaikar.com</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Template Renderer ───
function renderTemplate(
  templateName?: string | null,
  data: Record<string, unknown> = {}
): { subject: string; html: string; text?: string; from: string } | null {
  const tData = (
    (data.templateData && typeof data.templateData === "object" ? data.templateData : null) ||
    {}
  ) as Record<string, unknown>;

  // Check templateData for subject and body first, then root data
  const rawSubject = (
    (tData.subject !== undefined && tData.subject !== null && String(tData.subject).trim() !== "")
      ? String(tData.subject)
      : (data.subject !== undefined && data.subject !== null ? String(data.subject) : "")
  );

  const rawBody = (
    tData.body ||
    tData.content ||
    tData.html ||
    tData.text ||
    tData.message ||
    tData.messageContent ||
    data.html ||
    data.body ||
    data.content ||
    data.text ||
    data.message ||
    data.messageContent ||
    ""
  ) as string;

  const recipientName = (
    tData.recipientName ||
    tData.firstName ||
    data.recipientName ||
    data.firstName ||
    (typeof data.name === "string" ? data.name : undefined)
  ) as string | undefined;

  // Fallback handler: Check for templateData (containing subject and body) when templateName is missing or direct/custom/composed
  // Routes to the internal composed mail dispatch service without requiring a template ID or templateName
  const hasTemplateDataContent = Boolean(rawSubject && rawBody);
  if (!templateName || templateName === "custom" || templateName === "composed" || templateName === "direct") {
    if (hasTemplateDataContent) {
      const htmlContent = (data.html || tData.html)
        ? String(data.html || tData.html)
        : formatComposedEmailHtml(rawBody, recipientName);
      return {
        subject: String(rawSubject),
        html: htmlContent,
        text: typeof data.text === "string" ? data.text : (typeof tData.text === "string" ? tData.text : (typeof rawBody === "string" ? rawBody : undefined)),
        from: (typeof data.from === "string" && data.from) ? data.from : ((typeof tData.from === "string" && tData.from) ? tData.from : formatSenderEmail("support")),
      };
    }
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const futureStr = new Date(now.getTime() + 7 * 86400000).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  const resolvedData: Record<string, unknown> = {
    firstName: data.firstName || data.first_name || (typeof data.name === "string" ? data.name.split(" ")[0] : "there"),
    lastName: data.lastName || data.last_name || "",
    userType: data.userType || "driver",
    dashboardUrl: data.dashboardUrl || data.deepLink || data.deep_link || "https://rentmaikar.com",
    deepLink: data.deepLink || data.deep_link || data.dashboardUrl || "https://rentmaikar.com",
    paymentUrl: data.paymentUrl || data.payment_url || (data.deepLink as string) || "https://rentmaikar.com/dashboard/billing",
    amount: typeof data.amount === "number" ? data.amount : Number(data.amount) || 0,
    currency: (data.currency === "USD" ? "USD" : "NGN") as "USD" | "NGN",
    vehicleName: data.vehicleName || data.vehicle || data.vehicle_name || "Assigned Rental Vehicle",
    plateNumber: data.plateNumber || data.plate_number || "RM-FLEET",
    pickupDate: data.pickupDate || data.pickup_date || dateStr,
    returnDate: data.returnDate || data.return_date || futureStr,
    pickupLocation: data.pickupLocation || data.pickup_location || "Designated Rentmaikar Hub",
    bookingId: data.bookingId || data.recordId || data.record_id || "RM-" + Math.floor(100000 + Math.random() * 900000),
    transactionId: data.transactionId || data.transaction_id || data.recordId || data.record_id || "TX-" + Date.now(),
    paymentDate: data.paymentDate || data.payment_date || dateStr,
    paymentMethod: data.paymentMethod || data.payment_method || "Online Card / Transfer",
    periodStart: data.periodStart || data.period_start || dateStr,
    periodEnd: data.periodEnd || data.period_end || futureStr,
    failureReason: data.failureReason || data.failure_reason || "Card declined or payment window expired",
    dueDate: data.dueDate || data.due_date || futureStr,
    daysOverdue: data.daysOverdue || data.days_overdue || 3,
    dailyRate: data.dailyRate || data.daily_rate || 15000,
    lockdownReason: data.lockdownReason || data.lockdown_reason || "Overdue rental balance / Inspection required",
    estimatedEarnings: data.estimatedEarnings || data.estimated_earnings || 45000,
    payoutAmount: data.payoutAmount || data.amount || 45000,
    reference: data.reference || data.transactionId || "REF-" + Date.now(),
    title: data.title || (data.subject as string) || "Rentmaikar Notification",
    body: data.body || (data.text as string) || "",
    category: data.category || "notification",
    status: data.status,
    recordId: data.recordId || data.record_id,
    ...data,
  };

  const templateMap: Record<string, (d: any) => any> = {
    welcome_driver: welcomeDriverEmail,
    welcome_owner: welcomeOwnerEmail,
    otp: otpEmail,
    booking_confirmation: bookingConfirmationEmail,
    owner_booking_notification: ownerBookingNotificationEmail,
    payment_receipt: paymentReceiptEmail,
    payment_failed: paymentFailedEmail,
    owner_payout: ownerPayoutEmail,
    payment_reminder: paymentReminderEmail,
    payment_overdue: paymentOverdueEmail,
    vehicle_lockdown: vehicleLockdownEmail,
    vehicle_unlocked: vehicleUnlockedEmail,
    plan_downgrade: planDowngradeEmail,
    document_verified: documentVerifiedEmail,
    document_verification_failed: documentVerificationFailedEmail,
    document_expiry_warning: documentExpiryWarningEmail,
    vehicle_listed: vehicleListedEmail,
    vehicle_assigned: vehicleAssignedEmail,
    vehicle_maintenance_reminder: vehicleMaintenanceReminderEmail,
    police_report_required: policeReportRequiredEmail,
    nin_verification: ninVerificationEmail,
    support_ticket_created: supportTicketCreatedEmail,
    support_ticket_response: supportTicketResponseEmail,
    vehicle_shutdown: vehicleShutdownEmail,
    accident_alert: accidentAlertEmail,
    seasonal_promotion: seasonalPromotionEmail,
    admin_daily_report: adminDailyReportEmail,
    // Negotiation templates
    negotiation_submitted: negotiationSubmittedEmail,
    negotiation_approved: negotiationApprovedEmail,
    negotiation_rejected: negotiationRejectedEmail,
    negotiation_counter_offer: negotiationCounterOfferEmail,
    negotiation_locked: negotiationLockedEmail,
    negotiation_modification_request: negotiationModificationRequestEmail,
    negotiation_modification_processed: negotiationModificationProcessedEmail,
    // Auth & Verification templates
    email_verification: emailVerificationEmail,
    password_reset: passwordResetEmail,
    login_alert: loginAlertEmail,
    account_deactivated: accountDeactivatedEmail,
    persona_status_update: personaStatusUpdateEmail,
    persona_status_digest: personaStatusDigestEmail,
    provider_health_alert: providerHealthAlertEmail,
    event_notification: eventNotificationEmail,
  };

  if (templateName) {
    const fn = templateMap[templateName];
    if (fn) return fn(resolvedData);
  }

  // Fallback: If templateName wasn't found in templateMap, but subject and body are provided (via templateData or data)
  if (rawSubject && rawBody) {
    const htmlContent = (data.html || tData.html)
      ? String(data.html || tData.html)
      : formatComposedEmailHtml(rawBody, recipientName);
    return {
      subject: String(rawSubject),
      html: htmlContent,
      text: typeof data.text === "string" ? data.text : (typeof tData.text === "string" ? tData.text : (typeof rawBody === "string" ? rawBody : undefined)),
      from: (typeof data.from === "string" && data.from) ? data.from : ((typeof tData.from === "string" && tData.from) ? tData.from : formatSenderEmail("support")),
    };
  }

  return null;
}

// ─── Send Single Email via Resend ───
async function sendViaResend(
  apiKey: string,
  to: string,
  from: string,
  subject: string,
  html: string,
  text?: string,
  tags?: { name: string; value: string }[]
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const body: Record<string, unknown> = {
    from,
    to: [to],
    subject,
    html,
  };
  if (text) body.text = text;
  if (tags) body.tags = tags;

  const res = await resendSendEmail(body, apiKey);

  if (!res.ok) {
    const errText = await res.text();
    return { success: false, error: errText };
  }

  const result = await res.json().catch(() => ({} as Record<string, unknown>));
  const messageId =
    (result as any)?.id ??
    (result as any)?.data?.recipients?.[0]?.message_id ??
    (result as any)?.messageId ??
    `msg_${Date.now()}`;
  return { success: true, messageId };
}

// ─── Log Email ───
async function logEmail(
  supabase: any,
  data: {
    messageId?: string;
    recipient: string;
    template: string;
    category: string;
    status: string;
    priority: string;
    country?: string;
    error?: string;
    metadata?: Record<string, unknown>;
    retryCount?: number;
  }
) {
  await supabase.from("email_logs").insert({
    message_id: data.messageId || null,
    recipient: data.recipient,
    template: data.template,
    category: data.category,
    status: data.status,
    priority: data.priority,
    country: data.country || null,
    sent_at: data.status === "sent" ? new Date().toISOString() : null,
    failed_at: data.status === "failed" ? new Date().toISOString() : null,
    error: data.error || null,
    metadata: data.metadata || {},
    retry_count: data.retryCount || 0,
  });
}

// ─── Update Analytics ───
async function updateAnalytics(
  supabase: any,
  category: string,
  status: string
) {
  // Try upsert via RPC-like approach
  const today = new Date().toISOString().split("T")[0];
  const { data: existing } = await supabase
    .from("email_analytics")
    .select("id, count")
    .eq("date", today)
    .eq("category", category)
    .eq("status", status)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("email_analytics")
      .update({ count: existing.count + 1 })
      .eq("id", existing.id);
  } else {
    await supabase.from("email_analytics").insert({
      date: today,
      category,
      status,
      count: 1,
    });
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const _auth = await requireServiceRoleOrRole(req, [
    "admin",
    "super_admin",
    "admin_assistant",
    "legal_support",
    "iot_support",
    "vehicle_support",
    "insurance_support",
  ]);
  if (_auth instanceof Response) return _auth;


  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { action = "send" } = body;

    // ─── SINGLE SEND ───
    if (action === "send") {
      const {
        to,
        templateName,
        templateData = {},
        category = "general",
        data = {},
        priority = "normal",
        country,
        subject,
        body: emailBody,
        content,
        html,
        text,
        recipientName,
      } = body;

      if (!to) {
        throw new Error("Missing required field: to");
      }

      const tData = (
        (templateData && typeof templateData === "object" ? templateData : null) ||
        (data?.templateData && typeof data.templateData === "object" ? data.templateData : null) ||
        {}
      ) as Record<string, unknown>;

      // Prioritize subject from templateData if provided, then direct subject or data.subject
      const effectiveSubject =
        (tData.subject !== undefined && tData.subject !== null && String(tData.subject).trim() !== "")
          ? String(tData.subject)
          : (subject !== undefined && subject !== null && String(subject).trim() !== ""
              ? String(subject)
              : (data?.subject ? String(data.subject) : undefined));

      // Prioritize body from templateData if provided, then direct body/content/html/text
      const effectiveBody =
        tData.body ||
        tData.content ||
        tData.text ||
        tData.html ||
        tData.message ||
        tData.messageContent ||
        emailBody ||
        content ||
        html ||
        text ||
        body.message ||
        body.messageContent ||
        (data?.body as string | undefined) ||
        (data?.content as string | undefined);

      const mergedData: Record<string, unknown> = {
        ...data,
        ...tData,
        templateData: tData,
        ...(effectiveSubject !== undefined ? { subject: effectiveSubject } : {}),
        ...(effectiveBody !== undefined ? { body: effectiveBody } : {}),
        ...(content !== undefined ? { content } : (tData.content ? { content: tData.content } : {})),
        ...(html !== undefined ? { html } : (tData.html ? { html: tData.html } : {})),
        ...(text !== undefined ? { text } : (tData.text ? { text: tData.text } : {})),
        ...(recipientName !== undefined
          ? { recipientName, firstName: String(recipientName).split(" ")[0] }
          : (tData.recipientName
              ? { recipientName: tData.recipientName, firstName: String(tData.recipientName).split(" ")[0] }
              : {})),
      };

      const hasDirectContent = Boolean(
        mergedData.subject &&
        (mergedData.body || mergedData.html || mergedData.content || mergedData.text)
      );

      let resolvedTemplate: string;
      if (hasDirectContent) {
        resolvedTemplate = templateName || "composed";
      } else if (templateName) {
        resolvedTemplate = templateName;
      } else {
        throw new Error("Missing required fields: to, and either templateData (with subject and body), direct subject and body, or a templateName must be provided");
      }

      // ─── Admin outbound kill-switch (email, per region) ───
      {
        const paused = await outboundPausedResponse(supabase, "email", country, corsHeaders, {
          recipient: to,
          notificationType: resolvedTemplate,
          functionName: "send-outbound-email",
        });
        if (paused) return paused;
      }

      // Render template
      const rendered = renderTemplate(resolvedTemplate, mergedData);
      if (!rendered) {
        throw new Error(`Unknown template: ${resolvedTemplate}`);
      }

      // Override from address based on category
      const fromAddress = rendered.from || getSourceAddress(category, country);

      // Send
      const result = await sendViaResend(
        RESEND_API_KEY,
        to,
        fromAddress,
        rendered.subject,
        rendered.html,
        rendered.text,
        [
          { name: "template", value: resolvedTemplate },
          { name: "category", value: category },
          { name: "priority", value: priority },
        ]
      );

      // Log
      await logEmail(supabase, {
        messageId: result.messageId,
        recipient: to,
        template: resolvedTemplate,
        category,
        status: result.success ? "sent" : "failed",
        priority,
        country,
        error: result.error,
      });

      // Analytics
      await updateAnalytics(supabase, category, result.success ? "sent" : "failed");
      await logOutboundDecision(supabase, {
        channel: "email",
        decision: result.success ? "sent" : "failed",
        reason: result.success ? "accepted_by_provider" : String(result.error ?? "provider_error").slice(0, 300),
        region: country ?? null,
        provider: "resend",
        recipient: to,
        notificationType: resolvedTemplate,
        messageId: result.messageId,
        functionName: "send-outbound-email",
      });

      // Log messaging event
      await logMessagingEvent(supabase, {
        channel: 'email',
        provider: 'resend',
        event_type: result.success ? 'sent' : 'failed',
        direction: 'outbound',
        recipient: to,
        sender: fromAddress,
        template_name: resolvedTemplate,
        provider_message_id: result.messageId,
        error_message: result.error,
        metadata: { category, priority },
      });

      if (!result.success) {
        console.error(`Email to ${to} failed:`, result.error);
      } else {
        console.log(`Email sent to ${to} via template ${resolvedTemplate}`);
      }

      return new Response(
        JSON.stringify({
          success: result.success,
          ok: result.success,
          messageId: result.messageId,
          error: result.error,
        }),
        { status: result.success ? 200 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── BULK SEND ───
    if (action === "bulk") {
      const {
        recipients,
        templateName,
        templateData = {},
        category = "general",
        baseData = {},
        priority = "normal",
        subject,
        body: emailBody,
        content,
        html,
        text,
      } = body;

      if (!recipients?.length) {
        throw new Error("Missing required field: recipients");
      }

      const tData = (
        (templateData && typeof templateData === "object" ? templateData : null) ||
        (baseData?.templateData && typeof baseData.templateData === "object" ? baseData.templateData : null) ||
        {}
      ) as Record<string, unknown>;

      // Prioritize subject from templateData if provided, then direct subject or baseData.subject
      const effectiveSubject =
        (tData.subject !== undefined && tData.subject !== null && String(tData.subject).trim() !== "")
          ? String(tData.subject)
          : (subject !== undefined && subject !== null && String(subject).trim() !== ""
              ? String(subject)
              : (baseData?.subject ? String(baseData.subject) : undefined));

      // Prioritize body from templateData if provided, then direct body/content/html/text
      const effectiveBody =
        tData.body ||
        tData.content ||
        tData.text ||
        tData.html ||
        tData.message ||
        tData.messageContent ||
        emailBody ||
        content ||
        html ||
        text ||
        body.message ||
        body.messageContent ||
        (baseData?.body as string | undefined) ||
        (baseData?.content as string | undefined);

      const mergedBaseData: Record<string, unknown> = {
        ...baseData,
        ...tData,
        templateData: tData,
        ...(effectiveSubject !== undefined ? { subject: effectiveSubject } : {}),
        ...(effectiveBody !== undefined ? { body: effectiveBody } : {}),
        ...(content !== undefined ? { content } : (tData.content ? { content: tData.content } : {})),
        ...(html !== undefined ? { html } : (tData.html ? { html: tData.html } : {})),
        ...(text !== undefined ? { text } : (tData.text ? { text: tData.text } : {})),
      };

      const hasBulkDirectContent = Boolean(
        mergedBaseData.subject &&
        (mergedBaseData.body || mergedBaseData.html || mergedBaseData.content || mergedBaseData.text)
      );

      let resolvedTemplate: string;
      if (hasBulkDirectContent) {
        resolvedTemplate = templateName || "composed";
      } else if (templateName) {
        resolvedTemplate = templateName;
      } else {
        throw new Error("Missing required fields: recipients, and either templateData (with subject and body), direct subject and body, or a templateName must be provided");
      }

      const results: { email: string; success: boolean; messageId?: string; error?: string }[] = [];

      for (const recipient of recipients) {
        const recTData = (recipient.templateData && typeof recipient.templateData === "object" ? recipient.templateData : {}) as Record<string, unknown>;
        const mergedData = {
          ...mergedBaseData,
          ...recipient.customData,
          ...recTData,
          firstName: recipient.firstName || recipient.recipientName?.split(' ')[0] || (recTData.firstName as string) || mergedBaseData.firstName || "there",
          recipientName: recipient.recipientName || recipient.name || (recTData.recipientName as string) || mergedBaseData.recipientName,
          ...(recipient.subject ? { subject: recipient.subject } : (recTData.subject ? { subject: recTData.subject } : {})),
          ...(recipient.body ? { body: recipient.body } : (recTData.body ? { body: recTData.body } : {})),
          ...(recipient.html ? { html: recipient.html } : (recTData.html ? { html: recTData.html } : {})),
        };

        const rendered = renderTemplate(resolvedTemplate, mergedData);
        if (!rendered) {
          results.push({ email: recipient.email, success: false, error: `Unknown template: ${resolvedTemplate}` });
          continue;
        }

        const fromAddress = rendered.from || getSourceAddress(category, recipient.country);

        const result = await sendViaResend(
          RESEND_API_KEY,
          recipient.email,
          fromAddress,
          rendered.subject,
          rendered.html,
          rendered.text,
          [
            { name: "template", value: resolvedTemplate },
            { name: "category", value: category },
          ]
        );

        await logEmail(supabase, {
          messageId: result.messageId,
          recipient: recipient.email,
          template: resolvedTemplate,
          category,
          status: result.success ? "sent" : "failed",
          priority,
          country: recipient.country,
          error: result.error,
        });

        await updateAnalytics(supabase, category, result.success ? "sent" : "failed");

        results.push({
          email: recipient.email,
          success: result.success,
          messageId: result.messageId,
          error: result.error,
        });

        // Small delay to respect rate limits
        await new Promise((r) => setTimeout(r, 100));
      }

      const sent = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;
      console.log(`Bulk send complete: ${sent} sent, ${failed} failed`);

      return new Response(
        JSON.stringify({ success: true, sent, failed, results }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── LIST TEMPLATES ───
    if (action === "list_templates") {
      const templates = [
        "welcome_driver", "welcome_owner", "otp", "booking_confirmation",
        "owner_booking_notification", "payment_receipt", "payment_failed",
        "owner_payout", "payment_reminder", "payment_overdue",
        "vehicle_lockdown", "vehicle_unlocked", "plan_downgrade",
        "document_verified", "document_verification_failed", "document_expiry_warning",
        "vehicle_listed", "vehicle_assigned", "vehicle_maintenance_reminder",
        "police_report_required", "nin_verification",
        "support_ticket_created", "support_ticket_response",
        "vehicle_shutdown", "accident_alert",
        "seasonal_promotion", "admin_daily_report",
        "negotiation_submitted", "negotiation_approved", "negotiation_rejected",
        "negotiation_counter_offer", "negotiation_locked",
        "negotiation_modification_request", "negotiation_modification_processed",
        "email_verification", "password_reset", "login_alert", "account_deactivated",
      ];
      return new Response(
        JSON.stringify({ templates }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── EMAIL ANALYTICS ───
    if (action === "analytics") {
      const { days = 7 } = body;
      const since = new Date();
      since.setDate(since.getDate() - days);

      const { data: analytics } = await supabase
        .from("email_analytics")
        .select("*")
        .gte("date", since.toISOString().split("T")[0])
        .order("date", { ascending: false });

      const { data: recentLogs } = await supabase
        .from("email_logs")
        .select("*")
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false })
        .limit(50);

      return new Response(
        JSON.stringify({ analytics, recentLogs }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error) {
    console.error("Outbound email error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
