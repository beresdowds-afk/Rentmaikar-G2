import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hasPlaceholders, renderPlaceholders, resolvePlaceholderValues } from "../_shared/reply-placeholders.ts";
import { requireServiceRoleOrRole } from "../_shared/auth-guards.ts";
import { outboundPausedResponse } from "../_shared/channel-guard.ts";
import { logOutboundDecision } from "../_shared/outbound-audit.ts";
import { resendSendEmail } from "../_shared/resend-gateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Fetch email config from DB, falling back to hardcoded defaults
 */
async function getEmailConfig(supabase: any, key: string) {
  const { data } = await supabase
    .from("platform_email_config")
    .select("email, sender_name")
    .eq("key", key)
    .eq("is_active", true)
    .single();

  if (data) {
    const name = data.sender_name || "Rentmaikar";
    return { email: data.email, formatted: `${name} <${data.email}>` };
  }
  // Fallback
  return { email: "support@rentmaikar.com", formatted: "Rentmaikar Support <support@rentmaikar.com>" };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const _auth = await requireServiceRoleOrRole(req, ["admin","admin_assistant","legal_support","iot_support","vehicle_support","insurance_support"]);
  if (_auth instanceof Response) return _auth;


  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const {
      conversationId,
      messageContent,
      recipientEmail,
      subject,
      fromAlias,
      attachments,
    } = await req.json();

    interface OutboundAttachment {
      filename: string;
      contentType: string;
      size: number;
      storagePath: string;
      url: string;
    }
    const attachmentList: OutboundAttachment[] = Array.isArray(attachments)
      ? (attachments as OutboundAttachment[]).filter((a) => a && typeof a.url === "string" && a.url)
      : [];

    if (!conversationId || !messageContent || !recipientEmail) {
      throw new Error("Missing required fields: conversationId, messageContent, recipientEmail");
    }

    // ─── Resolve {{placeholders}} before the email leaves the platform ───
    let outboundText: string = messageContent;
    let outboundSubject: string | undefined = subject;
    if (hasPlaceholders(messageContent) || (subject && hasPlaceholders(subject))) {
      const values = await resolvePlaceholderValues(supabase, conversationId);
      const rendered = renderPlaceholders(messageContent, values, { keepUnknown: false }).trim();
      if (rendered) outboundText = rendered;
      if (subject) {
        outboundSubject =
          renderPlaceholders(subject, values, { keepUnknown: false }).trim() || subject;
      }
      if (outboundText !== messageContent) {
        await supabase
          .from("inbox_messages")
          .update({ content: outboundText })
          .eq("conversation_id", conversationId)
          .eq("content", messageContent)
          .eq("sender_type", "admin");
      }
    }

    // Get conversation details for context
    const { data: conversation } = await supabase
      .from("inbox_conversations")
      .select("subject, region")
      .eq("id", conversationId)
      .single();

    // ─── Admin outbound kill-switch (email, per region) ───
    {
      const paused = await outboundPausedResponse(supabase, "email", conversation?.region, corsHeaders, {
        recipient: recipientEmail,
        functionName: "send-email-reply",
      });
      if (paused) return paused;
    }

    const emailSubject = outboundSubject || 
      (conversation?.subject ? `Re: ${conversation.subject}` : "Reply from Rentmaikar Support");

    // Use DB-driven email config with fallback for the designated alias
    const targetAlias = fromAlias || 'support';
    const emailConfig = await getEmailConfig(supabase, targetAlias);
    const fromEmail = emailConfig.formatted;

    const isNgRegion = conversation?.region === 'NG';
    const supportPhone = isNgRegion ? '+234 800 RENTMAIKAR' : '+1 (608) 384-3932';

    console.log(`Sending email to ${recipientEmail} from ${emailConfig.email} (alias: ${targetAlias})`);

    // Send email using Resend API directly
    // Replies must come back to the inbound mailbox (Cloudflare Email Worker →
    // email-webhook → this inbox), not to the display-only support@rentmaikar.com.
    const replyToMailbox = "support@backend.rentmaikar.com";

    const emailResponse = await resendSendEmail({
        from: fromEmail,
        reply_to: replyToMailbox,
        to: [recipientEmail],
        subject: emailSubject,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f8fafc; padding: 20px; border-radius: 12px;">
            <div style="background: linear-gradient(135deg, #f97316, #ea580c); padding: 24px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 24px; letter-spacing: 0.5px;">Rentmaikar</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 4px 0 0 0; font-size: 13px;">Smarter Vehicle Rentals for Rideshare Drivers</p>
            </div>
            <div style="padding: 32px; background-color: #ffffff; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0;">
              <div style="white-space: pre-wrap; line-height: 1.7; color: #1e293b; font-size: 15px;">${outboundText.replace(/\n/g, '<br>')}</div>
              <hr style="margin: 28px 0; border: none; border-top: 1px solid #e2e8f0;">
              <p style="color: #64748b; font-size: 13px; margin: 0;">
                This message was sent from Rentmaikar Support. You can reply directly to this email to continue the conversation.
              </p>
            </div>
            <div style="background-color: #f1f5f9; padding: 18px; text-align: center; font-size: 12px; color: #64748b; border-radius: 0 0 10px 10px; border: 1px solid #e2e8f0; border-top: none;">
              <p style="margin: 0 0 4px 0; font-weight: 600; color: #334155;">Rentmaikar Mobility Solutions</p>
              <p style="margin: 0 0 6px 0;">© ${new Date().getFullYear()} Rentmaikar. All rights reserved.</p>
              <p style="margin: 0 0 6px 0;">
                <strong>US & International Support:</strong> +1 (608) 384-3932 &middot; 
                <strong>Nigeria Support:</strong> +234 800 RENTMAIKAR
              </p>
              <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                Dispatched via Rentmaikar Communications Gateway (Resend Verified &middot; TLS 1.3 Encrypted)
              </p>
            </div>
          </div>
        `,
        text: outboundText,
        ...(attachmentList.length
          ? {
              attachments: attachmentList.map((a) => ({
                filename: a.filename,
                path: a.url,
              })),
            }
          : {}),
      }, RESEND_API_KEY);

    if (!emailResponse.ok) {
      const errorData = await emailResponse.text();
      await logOutboundDecision(supabase, {
        channel: "email",
        decision: "failed",
        reason: `provider_error_${emailResponse.status}: ${errorData}`.slice(0, 300),
        region: conversation?.region ?? null,
        provider: "resend",
        recipient: recipientEmail,
        functionName: "send-email-reply",
      });
      throw new Error(`Failed to send email: ${errorData}`);
    }

    const emailResult = await emailResponse.json();
    await logOutboundDecision(supabase, {
      channel: "email",
      decision: "sent",
      reason: "accepted_by_provider",
      region: conversation?.region ?? null,
      provider: "resend",
      recipient: recipientEmail,
      messageId: emailResult?.id ?? null,
      functionName: "send-email-reply",
    });
    console.log("Email sent successfully:", emailResult);

    // Update the message with external_id
    await supabase
      .from("inbox_messages")
      .update({
        external_id: emailResult.id,
        metadata: {
          email_status: "sent",
          sent_at: new Date().toISOString(),
          ...(attachmentList.length ? { attachments_detail: attachmentList } : {}),
        },
      })
      .eq("conversation_id", conversationId)
      .eq("content", outboundText)
      .eq("sender_type", "admin")
      .is("external_id", null)
      .order("created_at", { ascending: false })
      .limit(1);

    return new Response(
      JSON.stringify({
        success: true,
        emailId: emailResult.id,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Send email reply error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
