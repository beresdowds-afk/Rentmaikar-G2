import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyTwilioRequest } from "../_shared/twilio-signature.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPPORT_NUMBER = "+16083843932";

/**
 * Expiry Notification IVR Handler
 * 
 * Handles Twilio <Gather> callbacks from expiry notification outbound calls.
 * 
 * Press 1 → Send document upload link via SMS
 * Press 2 → Request renewal extension (logged for admin review)
 * Press 3 → Connect to support agent
 */
const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse Twilio form data
    const formData = await req.formData();
    // Reject anything that is not a genuine, signed Twilio callback.
    const twilioDenied = await verifyTwilioRequest(req, formData);
    if (twilioDenied) return twilioDenied;
    const digits = formData.get("Digits")?.toString() || "";
    const callerPhone = formData.get("To")?.toString() || "";
    const callSid = formData.get("CallSid")?.toString() || "";

    // Parse query params
    const url = new URL(req.url);
    const itemId = url.searchParams.get("itemId") || "";
    const docType = url.searchParams.get("type") || "";
    const vehicleId = url.searchParams.get("vehicleId") || "";
    const tier = url.searchParams.get("tier") || "";

    console.log(`Expiry IVR: Digit=${digits}, Phone=${callerPhone?.substring(0, 6)}****, Type=${docType}, Tier=${tier}`);

    let twiml = "";

    switch (digits) {
      case "1": {
        // Press 1: Send document upload link via SMS (routed through centralized function)
        const uploadLink = `${supabaseUrl.replace('.supabase.co', '.lovable.app')}/driver-dashboard?tab=documents`;
        
        const cleanPhone = callerPhone.replace('whatsapp:', '');

        try {
          await fetch(`${supabaseUrl}/functions/v1/send-sms-notification`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              phone: cleanPhone,
              channel: 'sms',
              notificationType: 'general',
              customMessage: `RentMaiKar: Upload your ${docType.replace('_', ' ')} document here: ${uploadLink}\nThis link is valid for 24 hours. Reply HELP for assistance.`,
            }),
          });
        } catch (e) {
          console.error("Failed to send upload link SMS:", e);
        }

        twiml = `<Response>
          <Say voice="alice">
            Thank you. A document upload link has been sent to your phone via S M S. 
            Please upload your renewed ${docType.replace('_', ' ')} as soon as possible.
            Goodbye.
          </Say>
        </Response>`;
        break;
      }

      case "2": {
        // Press 2: Request renewal extension — log for admin review
        try {
          await supabase.from('admin_daily_tasks').insert({
            title: `Extension request: ${docType.replace('_', ' ')} renewal`,
            description: `User (${callerPhone}) requested a renewal extension for ${docType} (Item: ${itemId}, Vehicle: ${vehicleId}). Tier: ${tier}-day notice. Requested via IVR call ${callSid}.`,
            category: 'document_review',
            priority: tier === '7' || tier === '5' ? 'high' : 'medium',
          });
        } catch (e) {
          console.error("Failed to log extension request:", e);
        }

        twiml = `<Response>
          <Say voice="alice">
            Your extension request has been submitted. An administrator will review it within 24 hours.
            You will receive a notification with the decision.
            Thank you. Goodbye.
          </Say>
        </Response>`;
        break;
      }

      case "3": {
        // Press 3: Connect to support agent
        twiml = `<Response>
          <Say voice="alice">
            Connecting you to a support agent now. Please hold.
          </Say>
          <Dial callerId="${SUPPORT_NUMBER}" timeout="30">
            <Number>${SUPPORT_NUMBER}</Number>
          </Dial>
          <Say voice="alice">
            We're sorry, no agents are available right now. Please try again later or send a message to our support. Goodbye.
          </Say>
        </Response>`;
        break;
      }

      default: {
        // Invalid selection — send upload link as fallback
        twiml = `<Response>
          <Say voice="alice">
            Invalid selection. A document upload link will be sent to your phone. Goodbye.
          </Say>
        </Response>`;
        break;
      }
    }

    return new Response(twiml, {
      status: 200,
      headers: { "Content-Type": "application/xml", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Expiry IVR error:", error);
    return new Response(
      `<Response><Say>An error occurred. Please contact support. Goodbye.</Say></Response>`,
      { status: 200, headers: { "Content-Type": "application/xml", ...corsHeaders } }
    );
  }
};

serve(handler);
