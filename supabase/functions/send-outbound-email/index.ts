import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { EMAIL_CONFIG, formatSenderEmail } from "../_shared/email-config.ts";
import { logMessagingEvent } from "../_shared/messaging-events.ts";
import { requireServiceRole } from "../_shared/auth-guards.ts";
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

// ─── Template Renderer ───
function renderTemplate(
  templateName: string,
  data: Record<string, unknown>
): { subject: string; html: string; text?: string; from: string } | null {
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

  const fn = templateMap[templateName];
  if (!fn) return null;
  return fn(data);
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

  const result = await res.json();
  return { success: true, messageId: result.id };
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
  const _authError = requireServiceRole(req);
  if (_authError) return _authError;


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
        category = "general",
        data = {},
        priority = "normal",
        country,
      } = body;

      if (!to || !templateName) {
        throw new Error("Missing required fields: to, templateName");
      }

      // ─── Admin outbound kill-switch (email, per region) ───
      {
        const paused = await outboundPausedResponse(supabase, "email", country, corsHeaders, {
          recipient: to,
          notificationType: templateName,
          functionName: "send-outbound-email",
        });
        if (paused) return paused;
      }

      // Render template
      const rendered = renderTemplate(templateName, data);
      if (!rendered) {
        throw new Error(`Unknown template: ${templateName}`);
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
          { name: "template", value: templateName },
          { name: "category", value: category },
          { name: "priority", value: priority },
        ]
      );

      // Log
      await logEmail(supabase, {
        messageId: result.messageId,
        recipient: to,
        template: templateName,
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
        notificationType: templateName,
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
        template_name: templateName,
        provider_message_id: result.messageId,
        error_message: result.error,
        metadata: { category, priority },
      });

      if (!result.success) {
        console.error(`Email to ${to} failed:`, result.error);
      } else {
        console.log(`Email sent to ${to} via template ${templateName}`);
      }

      return new Response(
        JSON.stringify({
          success: result.success,
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
        category = "general",
        baseData = {},
        priority = "normal",
      } = body;

      if (!recipients?.length || !templateName) {
        throw new Error("Missing required fields: recipients, templateName");
      }

      const results: { email: string; success: boolean; messageId?: string; error?: string }[] = [];

      for (const recipient of recipients) {
        const mergedData = {
          ...baseData,
          ...recipient.customData,
          firstName: recipient.firstName || baseData.firstName || "there",
        };

        const rendered = renderTemplate(templateName, mergedData);
        if (!rendered) {
          results.push({ email: recipient.email, success: false, error: `Unknown template: ${templateName}` });
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
            { name: "template", value: templateName },
            { name: "category", value: category },
          ]
        );

        await logEmail(supabase, {
          messageId: result.messageId,
          recipient: recipient.email,
          template: templateName,
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
