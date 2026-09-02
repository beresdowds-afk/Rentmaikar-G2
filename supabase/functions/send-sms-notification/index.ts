import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getRegionConfig, getFromNumber, checkRateLimit, checkGlobalRateLimit } from "../_shared/sms-config.ts";
import { logMessagingEvent } from "../_shared/messaging-events.ts";
import { resolveMessage, countryCodeForPhone } from "../_shared/message-templates.ts";
import { isOptedOut } from "../_shared/opt-out.ts";
import { outboundPausedResponse, outboundRegionFromPhone } from "../_shared/channel-guard.ts";
import { logOutboundDecision } from "../_shared/outbound-audit.ts";
import { sendViaSent } from "../_shared/sent-client.ts";
import { twilioFallbackAllowed } from "../_shared/twilio-messaging-guard.ts";



const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type NotificationType = 
  | "verification_code" 
  // Negotiation events
  | "price_approved" 
  | "price_rejected" 
  | "price_counter_offer" 
  | "price_locked"
  | "negotiation_submitted"
  | "negotiation_modification_requested"
  | "negotiation_modification_processed"
  // Payment events
  | "payment_reminder"
  | "payment_received"
  | "payment_failed"
  | "payment_overdue"
  | "owner_payout"
  // Vehicle events
  | "vehicle_assigned"
  | "vehicle_listed"
  | "vehicle_lockdown"
  | "vehicle_unlocked"
  | "vehicle_shutdown"
  | "vehicle_return_reminder"
  | "vehicle_maintenance"
  // Document events
  | "document_verified"
  | "document_rejected"
  | "document_expiry_warning"
  // Booking events
  | "booking_confirmation"
  | "booking_cancellation"
  // Auth events
  | "login_alert"
  | "password_reset"
  | "account_deactivated"
  // Support events
  | "support_ticket_created"
  | "support_ticket_response"
  | "incident_alert"
  | "accident_alert"
  // General
  | "general";

type Channel = "sms" | "whatsapp";

interface SMSNotificationRequest {
  phone: string; // Full international format e.g., +12025550123
  channel: Channel;
  notificationType: NotificationType;
  name?: string;
  verificationCode?: string;
  vehicleInfo?: string;
  amount?: number;
  currency?: string;
  customMessage?: string;
  ticketId?: string;
  dueDate?: string;
  documentType?: string;
  device?: string;
  /** Force a specific provider; omit to use Sent.dm with regional fallback. */
  providerOverride?: "sent" | "twilio" | "termii";
  /** WhatsApp approved template (required outside the 24h session window). */
  whatsappTemplateId?: string;
  whatsappTemplateLanguage?: string;
  whatsappTemplateParams?: Record<string, string | number>;
  /** Public media URLs (WhatsApp only). */
  mediaUrls?: string[];
}


// From numbers sourced from shared sms-config.ts via getFromNumber()

const isValidPhone = (phone: string): boolean => {
  // Basic international phone format validation
  const phoneRegex = /^\+[1-9]\d{6,14}$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
};

const sanitizeString = (input: string): string => {
  return input.replace(/[<>]/g, '').trim().slice(0, 200);
};

const getCurrencySymbol = (currency: string): string => {
  return currency === 'NGN' ? '₦' : '$';
};

const getMessageContent = (data: SMSNotificationRequest): string => {
  const { notificationType, name, verificationCode, vehicleInfo, amount, currency, customMessage, ticketId, dueDate, documentType, device } = data;
  const safeName = name ? sanitizeString(name) : 'User';
  const safeVehicle = vehicleInfo ? sanitizeString(vehicleInfo) : 'your vehicle';
  const sym = currency ? getCurrencySymbol(currency) : '$';
  
  switch (notificationType) {
    // Auth
    case 'verification_code':
      return `Rentmaikar: Your verification code is ${verificationCode}. This code expires in 10 minutes. Do not share this code with anyone.`;
    case 'login_alert':
      return `Rentmaikar: New login to your account${device ? ` from ${sanitizeString(device)}` : ''}. If this wasn't you, secure your account immediately.`;
    case 'password_reset':
      return `Rentmaikar: A password reset was requested for your account. If this wasn't you, please contact support.`;
    case 'account_deactivated':
      return `Rentmaikar: Your account has been deactivated. Contact support@rentmaikar.com for assistance.`;

    // Negotiations
    case 'price_approved':
      return `Rentmaikar: Great news, ${safeName}! Your price request for ${safeVehicle} has been approved at ${sym}${amount}. Log in to view details.`;
    case 'price_rejected':
      return `Rentmaikar: Hi ${safeName}, your price request for ${safeVehicle} was not approved. Please log in to submit a new request.`;
    case 'price_counter_offer':
      return `Rentmaikar: Hi ${safeName}, you've received a counter offer of ${sym}${amount} for ${safeVehicle}. Log in to respond.`;
    case 'price_locked':
      return `Rentmaikar: Your rate for ${safeVehicle} is now locked at ${sym}${amount}. Contact support if you need changes.`;
    case 'negotiation_submitted':
      return `Rentmaikar: Hi ${safeName}, your price negotiation for ${safeVehicle} has been submitted. We'll review it shortly.`;
    case 'negotiation_modification_requested':
      return `Rentmaikar: Hi ${safeName}, a price modification request for ${safeVehicle} has been submitted. We'll process it soon.`;
    case 'negotiation_modification_processed':
      return `Rentmaikar: Hi ${safeName}, your price modification request for ${safeVehicle} has been processed. Log in to view the result.`;

    // Payments
    case 'payment_reminder':
      return `Rentmaikar: Reminder - Your payment of ${sym}${amount} is due${dueDate ? ` on ${dueDate}` : ''}. Please log in to complete your payment.`;
    case 'payment_received':
      return `Rentmaikar: Payment of ${sym}${amount} received. Thank you, ${safeName}!`;
    case 'payment_failed':
      return `Rentmaikar: Your payment of ${sym}${amount} failed. Please update your payment method and try again.`;
    case 'payment_overdue':
      return `Rentmaikar: URGENT - Your payment of ${sym}${amount} is overdue. Please pay immediately to avoid service disruption.`;
    case 'owner_payout':
      return `Rentmaikar: Hi ${safeName}, your weekly payout of ${sym}${amount} has been processed. Check your account for details.`;

    // Vehicles
    case 'vehicle_assigned':
      return `Rentmaikar: ${safeVehicle} has been assigned to a driver. Log in to view rental details.`;
    case 'vehicle_listed':
      return `Rentmaikar: ${safeVehicle} is now listed and available for rental on the platform.`;
    case 'vehicle_lockdown':
      return `Rentmaikar: NOTICE - ${safeVehicle} has been locked due to a payment issue. Please contact support.`;
    case 'vehicle_unlocked':
      return `Rentmaikar: ${safeVehicle} has been unlocked. Thank you for resolving the payment.`;
    case 'vehicle_shutdown':
      return `Rentmaikar: WARNING - ${safeVehicle} shutdown initiated. Contact support immediately.`;
    case 'vehicle_return_reminder':
      return `Rentmaikar: Reminder - ${safeVehicle} is due for return${dueDate ? ` on ${dueDate}` : ' soon'}. Please plan accordingly.`;
    case 'vehicle_maintenance':
      return `Rentmaikar: ${safeVehicle} is due for scheduled maintenance. Please log in for details.`;

    // Documents
    case 'document_verified':
      return `Rentmaikar: Your ${documentType || 'document'} has been verified successfully. Thank you!`;
    case 'document_rejected':
      return `Rentmaikar: Your ${documentType || 'document'} could not be verified. Please log in and resubmit.`;
    case 'document_expiry_warning':
      return `Rentmaikar: Your ${documentType || 'document'} expires${dueDate ? ` on ${dueDate}` : ' soon'}. Please renew to avoid service interruption.`;

    // Bookings
    case 'booking_confirmation':
      return `Rentmaikar: Booking confirmed for ${safeVehicle}. Log in to view pickup details.`;
    case 'booking_cancellation':
      return `Rentmaikar: Your booking for ${safeVehicle} has been cancelled. Contact support if you have questions.`;

    // Support
    case 'support_ticket_created':
      return `Rentmaikar: Support ticket${ticketId ? ` #${ticketId}` : ''} created. We'll respond within 24 hours.`;
    case 'support_ticket_response':
      return `Rentmaikar: New response on your support ticket${ticketId ? ` #${ticketId}` : ''}. Log in to view.`;
    case 'incident_alert':
      return `Rentmaikar: An incident has been reported for ${safeVehicle}. Log in for details.`;
    case 'accident_alert':
      return `Rentmaikar: URGENT - An accident has been reported for ${safeVehicle}. Emergency services have been notified.`;

    // General
    case 'general':
      return customMessage ? `Rentmaikar: ${sanitizeString(customMessage)}` : 'Rentmaikar: You have a new notification. Please log in to view details.';
      
    default:
      return 'Rentmaikar: You have a new notification. Please log in to view details.';
  }
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Security: Verify service role key authorization
  const authHeader = req.headers.get('Authorization');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!authHeader || !supabaseServiceKey) {
    console.error('Missing authorization header or service key');
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized' }),
      { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  // Check if the authorization includes the service role key (Bearer token)
  const token = authHeader.replace('Bearer ', '');
  if (token !== supabaseServiceKey) {
    console.error('Invalid authorization - service role key mismatch');
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized' }),
      { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  try {
    const body: SMSNotificationRequest = await req.json();
    
    // Log request for audit (mask phone number)
    console.log('SMS request:', {
      timestamp: new Date().toISOString(),
      phone: body.phone ? body.phone.substring(0, 6) + '****' : 'none',
      channel: body.channel,
      type: body.notificationType,
    });
    
    // Validate phone
    if (!body.phone || !isValidPhone(body.phone)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid phone number format. Use international format (e.g., +12025550123)" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // ─── Opt-out guard: never contact a number after STOP ───
    // User-initiated security codes and emergencies are exempt (they are not
    // marketing/notification traffic and are requested in the moment).
    const OPT_OUT_EXEMPT = new Set([
      'verification_code', 'two_factor_code', 'otp', 'login_code', 'emergency',
    ]);
    if (!OPT_OUT_EXEMPT.has(body.notificationType)) {
      const channel = body.channel === 'whatsapp' ? 'whatsapp' : 'sms';
      if (await isOptedOut(body.phone, channel)) {
        console.log(`[send-sms-notification] Suppressed ${body.notificationType} — ${body.phone} opted out`);
        await logOutboundDecision(
          createClient(Deno.env.get("SUPABASE_URL")!, supabaseServiceKey),
          {
            channel,
            decision: 'blocked',
            reason: 'recipient_opted_out',
            region: outboundRegionFromPhone(body.phone),
            recipient: body.phone,
            notificationType: body.notificationType,
            functionName: 'send-sms-notification',
          },
        );
        return new Response(
          JSON.stringify({ success: false, suppressed: true, reason: 'recipient_opted_out' }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    // ─── Admin outbound kill-switch (per channel + region) ───
    {
      const guardClient = createClient(Deno.env.get("SUPABASE_URL")!, supabaseServiceKey);
      const paused = await outboundPausedResponse(
        guardClient,
        body.channel === 'whatsapp' ? 'whatsapp' : 'sms',
        outboundRegionFromPhone(body.phone),
        corsHeaders,
        { recipient: body.phone, notificationType: body.notificationType, functionName: 'send-sms-notification' },
      );
      if (paused) return paused;
    }

    // ─── Rate limiting ───

    const region = body.phone.startsWith('+234') ? 'NIGERIA' : 'USA';
    if (!checkGlobalRateLimit() || !checkRateLimit(region)) {
      return new Response(
        JSON.stringify({ success: false, error: "Rate limited. Try again shortly." }),
        { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const regionConfig = getRegionConfig(body.phone);
    const isNigeria = body.phone.startsWith('+234');
    // Admin-managed template first; hardcoded copy stays as the safety net.
    const sym = body.currency ? getCurrencySymbol(body.currency) : '$';
    const message = await resolveMessage({
      key: body.notificationType,
      channel: body.channel === 'whatsapp' ? 'whatsapp' : 'sms',
      countryCode: countryCodeForPhone(body.phone),
      values: {
        first_name: body.name ? sanitizeString(body.name) : 'there',
        vehicle_name: body.vehicleInfo ? sanitizeString(body.vehicleInfo) : 'your vehicle',
        amount_display: body.amount !== undefined && body.amount !== null ? `${sym}${body.amount}` : '',
        currency: body.currency ?? '',
        due_date: body.dueDate ? `on ${sanitizeString(body.dueDate)}` : '',
        document_type: body.documentType ? sanitizeString(body.documentType) : 'document',
        ticket_id: body.ticketId ? `#${sanitizeString(body.ticketId)}` : '',
        verification_code: body.verificationCode ?? '',
        device: body.device ? `from ${sanitizeString(body.device)}` : '',
        custom_message: body.customMessage
          ? sanitizeString(body.customMessage)
          : 'You have a new notification. Please log in to view details.',
      },
      fallback: getMessageContent(body),
    });

    // ─── SENT.dm (global default CPaaS) ───
    // Sent is attempted first for every destination. Twilio (USA) and Termii
    // (Nigeria) remain as automatic regional fallbacks.
    if (body.providerOverride !== 'twilio' && body.providerOverride !== 'termii') {
      const isWa = body.channel === 'whatsapp';
      const sentResult = await sendViaSent({
        to: body.phone,
        channel: isWa ? 'whatsapp' : 'sms',
        text: message,
        template: isWa && body.whatsappTemplateId
          ? {
              id: body.whatsappTemplateId,
              language: body.whatsappTemplateLanguage,
              parameters: body.whatsappTemplateParams,
            }
          : undefined,
        mediaUrls: isWa ? body.mediaUrls : undefined,
        metadata: { notification_type: body.notificationType, region: isNigeria ? 'NIGERIA' : 'USA' },
      });


      if (sentResult.ok) {
        console.log(`${body.channel.toUpperCase()} sent via Sent.dm:`, sentResult.messageId);
        const supabase = createClient(Deno.env.get("SUPABASE_URL")!, supabaseServiceKey);
        await logMessagingEvent(supabase, {
          channel: body.channel === 'whatsapp' ? 'whatsapp' : 'sms',
          provider: 'sent',
          event_type: 'sent',
          direction: 'outbound',
          recipient: body.phone,
          region: isNigeria ? 'NIGERIA' : 'USA',
          provider_message_id: sentResult.messageId,
          template_name: body.notificationType,
          metadata: { notification_type: body.notificationType, sandbox: sentResult.sandbox },
        });
        await logOutboundDecision(supabase, {
          channel: body.channel === 'whatsapp' ? 'whatsapp' : 'sms',
          decision: 'sent',
          reason: 'accepted_by_provider',
          region: isNigeria ? 'Nigeria' : 'USA',
          provider: 'sent',
          recipient: body.phone,
          notificationType: body.notificationType,
          messageId: sentResult.messageId,
          functionName: 'send-sms-notification',
        });

        return new Response(
          JSON.stringify({
            success: true,
            messageId: sentResult.messageId,
            channel: body.channel,
            provider: 'sent',
            region: isNigeria ? 'NIGERIA' : 'USA',
            sandbox: sentResult.sandbox,
          }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      if (!sentResult.skipped) {
        console.warn(`[send-sms-notification] Sent.dm dispatch failed, falling back: ${sentResult.error}`);
      }
    }

    if (isNigeria) {

      // ─── TERMII (Nigeria) ───
      const termiiApiKey = Deno.env.get("TERMII_API_KEY");

      if (!termiiApiKey) {
        console.error("Termii credentials not configured for Nigeria");
        throw new Error("Nigeria SMS service not configured");
      }

      const isWhatsApp = body.channel === 'whatsapp';
      const termiiChannel = isWhatsApp ? 'whatsapp' : 'generic';

      console.log(`Sending ${body.channel.toUpperCase()} via Termii to ${body.phone}: ${body.notificationType}`);

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const termiiResponse = await fetch('https://api.ng.termii.com/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: body.phone.replace('+', ''),
          from: regionConfig.senderId,
          sms: message,
          type: 'plain',
          channel: termiiChannel,
          api_key: termiiApiKey,
          notify_url: `${supabaseUrl}/functions/v1/termii-webhook`,
        }),
      });


      const termiiData = await termiiResponse.json();

      if (!termiiResponse.ok || termiiData.code !== 'ok') {
        console.error("Termii API error:", termiiData);
        throw new Error(termiiData.message || `Failed to send ${body.channel} via Termii`);
      }

      console.log(`${body.channel.toUpperCase()} sent via Termii:`, termiiData.message_id);

      const supabase = createClient(Deno.env.get("SUPABASE_URL")!, supabaseServiceKey);
      await logMessagingEvent(supabase, {
        channel: body.channel === 'whatsapp' ? 'whatsapp' : 'sms',
        provider: 'termii',
        event_type: 'sent',
        direction: 'outbound',
        recipient: body.phone,
        region: 'NIGERIA',
        provider_message_id: termiiData.message_id,
        template_name: body.notificationType,
        metadata: { notification_type: body.notificationType },
      });
      await logOutboundDecision(supabase, {
        channel: body.channel === 'whatsapp' ? 'whatsapp' : 'sms',
        decision: 'sent',
        reason: 'accepted_by_provider',
        region: 'Nigeria',
        provider: 'termii',
        recipient: body.phone,
        notificationType: body.notificationType,
        messageId: termiiData.message_id,
        functionName: 'send-sms-notification',
      });

      return new Response(
        JSON.stringify({ 
          success: true, 
          messageId: termiiData.message_id,
          channel: body.channel,
          provider: 'termii',
          region: 'NIGERIA',
        }), 
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // ─── TWILIO (USA fallback) ───
    // Sent.dm is the global default; Twilio only carries USA (+1) traffic once
    // a Sent dispatch has failed or Sent is unavailable.
    if (!twilioFallbackAllowed(body.phone)) {
      throw new Error(
        "Twilio fallback is not available for this destination. SMS/WhatsApp must route via Sent.dm.",
      );
    }


    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");

    if (!accountSid || !authToken) {
      console.error("Twilio credentials not configured");
      throw new Error("SMS service not configured");
    }

    const isWhatsApp = body.channel === 'whatsapp';
    const mainNumber = getFromNumber(body.phone, 'main');
    const fromNumber = isWhatsApp ? `whatsapp:${mainNumber}` : mainNumber;
    const toNumber = isWhatsApp ? `whatsapp:${body.phone}` : body.phone;

    console.log(`Sending ${body.channel.toUpperCase()} via Twilio to ${body.phone}: ${body.notificationType}`);

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const twilioAuth = btoa(`${accountSid}:${authToken}`);
    
    const formData = new URLSearchParams();

    // Use Messaging Service SID if available
    if (regionConfig.messagingServiceSid && !isWhatsApp) {
      formData.append('MessagingServiceSid', regionConfig.messagingServiceSid);
    } else {
      formData.append('From', fromNumber);
    }

    formData.append('To', toNumber);
    formData.append('Body', message);
    formData.append('StatusCallback', `${Deno.env.get("SUPABASE_URL")}/functions/v1/twilio-webhook`);


    const twilioResponse = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${twilioAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    const responseData = await twilioResponse.json();

    if (!twilioResponse.ok) {
      console.error("Twilio API error:", responseData);
      throw new Error(responseData.message || `Failed to send ${body.channel}`);
    }

    console.log(`${body.channel.toUpperCase()} sent via Twilio:`, responseData.sid);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, supabaseServiceKey);
    await logMessagingEvent(supabase, {
      channel: body.channel === 'whatsapp' ? 'whatsapp' : 'sms',
      provider: 'twilio',
      event_type: 'sent',
      direction: 'outbound',
      recipient: body.phone,
      region: 'USA',
      provider_message_id: responseData.sid,
      template_name: body.notificationType,
      metadata: { notification_type: body.notificationType, segments: responseData.num_segments || 1 },
    });
    await logOutboundDecision(supabase, {
      channel: body.channel === 'whatsapp' ? 'whatsapp' : 'sms',
      decision: 'sent',
      reason: 'accepted_by_provider',
      region: 'USA',
      provider: 'twilio',
      recipient: body.phone,
      notificationType: body.notificationType,
      messageId: responseData.sid,
      functionName: 'send-sms-notification',
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageId: responseData.sid,
        channel: body.channel,
        provider: 'twilio',
        region: 'USA',
        segments: responseData.num_segments || 1,
      }), 
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("Error in send-sms-notification function:", errorMessage);

    try {
      const supabase = createClient(Deno.env.get("SUPABASE_URL")!, supabaseServiceKey);
      await logMessagingEvent(supabase, {
        channel: 'sms',
        provider: 'twilio',
        event_type: 'failed',
        direction: 'outbound',
        error_message: errorMessage,
        metadata: { notification_type: body?.notificationType },
      });
      await logOutboundDecision(supabase, {
        channel: body?.channel === 'whatsapp' ? 'whatsapp' : 'sms',
        decision: 'failed',
        reason: errorMessage.slice(0, 300),
        region: outboundRegionFromPhone(body?.phone),
        recipient: body?.phone,
        notificationType: body?.notificationType,
        functionName: 'send-sms-notification',
      });
    } catch (_) { /* ignore logging errors */ }

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
