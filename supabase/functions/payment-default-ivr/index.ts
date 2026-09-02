import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyTwilioRequest } from "../_shared/twilio-signature.ts";

// This endpoint handles Twilio <Gather> callbacks from payment default IVR calls.
// When a driver presses a key during the automated call, Twilio POSTs to this URL.
// Press 1 = Payment link via SMS
// Press 2 = Connect to support agent

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse URL params and form data
    const url = new URL(req.url);
    const defaultId = url.searchParams.get('defaultId');
    const stage = url.searchParams.get('stage');

    const formData = await req.formData();

    // Reject anything that is not a genuine, signed Twilio callback.

    const twilioDenied = await verifyTwilioRequest(req, formData);

    if (twilioDenied) return twilioDenied;
    const digits = formData.get('Digits') as string;
    const callSid = formData.get('CallSid') as string;
    const callerPhone = formData.get('To') as string;

    console.log(`[PaymentDefaultIVR] Digits: ${digits}, DefaultId: ${defaultId}, Stage: ${stage}, CallSid: ${callSid}`);

    // Log the IVR interaction
    if (defaultId) {
      await supabase
        .from('voip_calls')
        .update({ 
          status: 'in-progress',
        })
        .eq('call_sid', callSid);
    }

    if (digits === '1') {
      // ─── OPTION 1: Payment ───
      // Send payment link via SMS, then confirm on call
      if (callerPhone && defaultId) {
        // Fetch the default to get amount
        const { data: paymentDefault } = await supabase
          .from('payment_defaults')
          .select('amount_due, currency, driver_id')
          .eq('id', defaultId)
          .single();

        if (paymentDefault) {
          const sym = paymentDefault.currency === 'NGN' ? '₦' : '$';
          const baseUrl = supabaseUrl.replace('.supabase.co', '.lovable.app').replace('https://bwvocmhcledbwqlpcswp', 'https://rentmaikar');
          const paymentLink = `${baseUrl}/driver/dashboard?tab=payments`;

          // Send payment link SMS
          await fetch(`${supabaseUrl}/functions/v1/send-sms-notification`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              phone: callerPhone,
              channel: 'sms',
              notificationType: 'general',
              customMessage: `Rentmaikar: Pay your overdue amount of ${sym}${paymentDefault.amount_due} now → ${paymentLink}\nValid for 24 hours. Reply HELP for support.`,
            }),
          });
        }
      }

      // Return TwiML confirming payment link sent
      return new Response(
        `<Response>
          <Say voice="alice">Thank you. We have sent a payment link to your phone via SMS. Please complete your payment within the next 24 hours to avoid vehicle lockdown. Goodbye.</Say>
        </Response>`,
        { status: 200, headers: { 'Content-Type': 'text/xml', ...corsHeaders } }
      );
    } else if (digits === '2') {
      // ─── OPTION 2: Connect to support ───
      // Log the support request
      if (defaultId) {
        const { data: paymentDefault } = await supabase
          .from('payment_defaults')
          .select('driver_id')
          .eq('id', defaultId)
          .single();

        if (paymentDefault) {
          // Create a voice call request for admin follow-up
          await supabase
            .from('voip_calls')
            .update({ status: 'in-progress' })
            .eq('call_sid', callSid);
        }
      }

      // Transfer to support number
      const supportNumber = Deno.env.get('TWILIO_PHONE_NUMBER') || '+16083843932';
      return new Response(
        `<Response>
          <Say voice="alice">Connecting you to a support agent now. Please hold.</Say>
          <Dial timeout="30" action="${supabaseUrl}/functions/v1/voip-status-callback">
            ${supportNumber}
          </Dial>
          <Say voice="alice">We were unable to connect you. A support agent will call you back within 30 minutes. Goodbye.</Say>
        </Response>`,
        { status: 200, headers: { 'Content-Type': 'text/xml', ...corsHeaders } }
      );
    } else {
      // Invalid input - retry once
      const actionUrl = `${supabaseUrl}/functions/v1/payment-default-ivr?defaultId=${defaultId}&stage=${stage}&retry=1`;
      const isRetry = url.searchParams.get('retry') === '1';

      if (isRetry) {
        return new Response(
          `<Response>
            <Say voice="alice">We did not receive a valid input. A support agent will follow up with you shortly. Goodbye.</Say>
          </Response>`,
          { status: 200, headers: { 'Content-Type': 'text/xml', ...corsHeaders } }
        );
      }

      return new Response(
        `<Response>
          <Gather numDigits="1" action="${actionUrl}" method="POST" timeout="8">
            <Say voice="alice">Sorry, that was not a valid option. Press 1 to make a payment. Press 2 to speak with support.</Say>
          </Gather>
          <Say voice="alice">Goodbye.</Say>
        </Response>`,
        { status: 200, headers: { 'Content-Type': 'text/xml', ...corsHeaders } }
      );
    }
  } catch (error: any) {
    console.error('[PaymentDefaultIVR] Error:', error);
    return new Response(
      `<Response>
        <Say voice="alice">We encountered an error. A support agent will contact you shortly. Goodbye.</Say>
      </Response>`,
      { status: 200, headers: { 'Content-Type': 'text/xml', ...corsHeaders } }
    );
  }
};

serve(handler);
