import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyTwilioRequest } from "../_shared/twilio-signature.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPPORT_NUMBER = "+16083843932";

/**
 * Vehicle Return IVR Handler
 * 
 * Handles Twilio <Gather> callbacks from vehicle return reminder calls.
 * Press 1 → Confirm return (SMS with inspection location)
 * Press 2 → Request extension (check availability, log to admin)
 * Press 3 → Report issue (log to admin tasks)
 * Press 4 → Connect to agent
 */
const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const formData = await req.formData();

    // Reject anything that is not a genuine, signed Twilio callback.

    const twilioDenied = await verifyTwilioRequest(req, formData);

    if (twilioDenied) return twilioDenied;
    const digits = formData.get("Digits")?.toString() || "";
    const callerPhone = formData.get("To")?.toString() || "";
    const callSid = formData.get("CallSid")?.toString() || "";

    const url = new URL(req.url);
    const rentalId = url.searchParams.get("rentalId") || "";
    const vehicleId = url.searchParams.get("vehicleId") || "";
    const driverId = url.searchParams.get("driverId") || "";

    console.log(`Return IVR: Digit=${digits}, Rental=${rentalId}, CallSid=${callSid}`);

    let twiml = "";

    switch (digits) {
      case "1": {
        // Press 1: Confirm return — send SMS with inspection address (via centralized routing)
        const { data: rental } = await supabase
          .from('rentals')
          .select('return_location, end_date')
          .eq('id', rentalId)
          .maybeSingle();

        const returnAddress = rental?.return_location || 'the designated pickup location';
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
              customMessage: `RentMaiKar: Return confirmed. Inspection location: ${returnAddress}. Return inspection will be completed within 2 hours of drop-off. Contact us if you need directions: ${SUPPORT_NUMBER}`,
            }),
          });
        } catch (e) {
          console.error("Return confirmation SMS failed:", e);
        }

        twiml = `<Response>
          <Say voice="alice">
            Thank you for confirming your return. Please ensure the vehicle is clean and fueled.
            A return inspection will be completed within 2 hours of drop-off.
            The inspection location details have been sent to your phone via S M S.
            Goodbye.
          </Say>
        </Response>`;
        break;
      }

      case "2": {
        // Press 2: Request extension — check availability and log
        const { data: rental } = await supabase
          .from('rentals')
          .select('vehicle_id, daily_rate, currency, end_date')
          .eq('id', rentalId)
          .maybeSingle();

        // Check if vehicle has a next booking (simplified: check for overlapping rentals)
        const currentEndDate = rental?.end_date || new Date().toISOString();
        const extensionEndDate = new Date(new Date(currentEndDate).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

        const { data: conflictingRentals } = await supabase
          .from('rentals')
          .select('id')
          .eq('vehicle_id', vehicleId)
          .neq('id', rentalId)
          .eq('status', 'active')
          .lte('start_date', extensionEndDate)
          .gte('end_date', currentEndDate)
          .limit(1);

        const isAvailable = !conflictingRentals || conflictingRentals.length === 0;
        const rate = rental?.daily_rate || 0;
        const curr = rental?.currency === 'NGN' ? '₦' : '$';

        if (isAvailable) {
          // Mark extension requested
          await supabase.from('rentals')
            .update({ extension_requested: true })
            .eq('id', rentalId);

          // Log for admin approval
          await supabase.from('admin_daily_tasks').insert({
            title: `Extension request: Rental ${rentalId}`,
            description: `Driver (${callerPhone}) requested a 7-day extension for vehicle ${vehicleId} at ${curr}${rate}/day. Current end: ${currentEndDate}. Requested via return reminder IVR.`,
            category: 'rental_management',
            priority: 'high',
          });

          twiml = `<Response>
            <Say voice="alice">
              The vehicle is available for extension. A 7-day extension at ${curr}${rate} per day has been submitted for approval.
              An administrator will review your request within 24 hours and you will be notified of the decision.
              Thank you. Goodbye.
            </Say>
          </Response>`;
        } else {
          twiml = `<Response>
            <Gather numDigits="1" action="${supabaseUrl}/functions/v1/vehicle-return-ivr?rentalId=${rentalId}&vehicleId=${vehicleId}&driverId=${driverId}" method="POST" timeout="8">
              <Say voice="alice">
                Unfortunately, the vehicle is not available for extension as it has been reserved for another driver.
                Press 4 to speak with a support agent about alternative arrangements.
                Or hang up to end this call.
              </Say>
            </Gather>
            <Say voice="alice">Thank you. Please return the vehicle as scheduled. Goodbye.</Say>
          </Response>`;
        }
        break;
      }

      case "3": {
        // Press 3: Report issue — log to admin tasks
        await supabase.from('admin_daily_tasks').insert({
          title: `Vehicle issue reported: Rental ${rentalId}`,
          description: `Driver (${callerPhone}) reported an issue with vehicle ${vehicleId} during return reminder call ${callSid}. Requires follow-up.`,
          category: 'vehicle_support',
          priority: 'high',
        });

        twiml = `<Response>
          <Say voice="alice">
            Your issue has been logged and a support team member will contact you within 2 hours.
            If this is an emergency, please press 4 now to speak with an agent immediately.
          </Say>
          <Gather numDigits="1" action="${supabaseUrl}/functions/v1/vehicle-return-ivr?rentalId=${rentalId}&vehicleId=${vehicleId}&driverId=${driverId}" method="POST" timeout="5">
            <Say voice="alice">Press 4 for an agent, or hang up to end this call.</Say>
          </Gather>
          <Say voice="alice">Thank you. A support agent will reach out to you shortly. Goodbye.</Say>
        </Response>`;
        break;
      }

      case "4": {
        // Press 4: Connect to agent
        twiml = `<Response>
          <Say voice="alice">Connecting you to a support agent now. Please hold.</Say>
          <Dial callerId="${SUPPORT_NUMBER}" timeout="30">
            <Number>${SUPPORT_NUMBER}</Number>
          </Dial>
          <Say voice="alice">We're sorry, no agents are available right now. Please try again later. Goodbye.</Say>
        </Response>`;
        break;
      }

      default: {
        twiml = `<Response>
          <Say voice="alice">Invalid selection. Please return the vehicle as scheduled. Goodbye.</Say>
        </Response>`;
        break;
      }
    }

    return new Response(twiml, {
      status: 200,
      headers: { "Content-Type": "application/xml", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Vehicle return IVR error:", error);
    return new Response(
      `<Response><Say>An error occurred. Please contact support. Goodbye.</Say></Response>`,
      { status: 200, headers: { "Content-Type": "application/xml", ...corsHeaders } }
    );
  }
};

serve(handler);
