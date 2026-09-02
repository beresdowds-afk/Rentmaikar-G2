import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyTwilioRequest } from "../_shared/twilio-signature.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPPORT_NUMBER = "+16083843932";

/**
 * Shutdown Warning IVR Handler
 * 
 * Handles Twilio <Gather> callbacks from vehicle shutdown warning calls.
 * 
 * Moving state:
 *   Press 1 → Confirm pulled over (schedule re-check)
 *   Press 2 → Emergency assistance
 * 
 * Parked state:
 *   Press 1 → Dispute shutdown (log for admin review, pause timer)
 *   Press 2 → Connect to agent
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
    const vehicleId = url.searchParams.get("vehicleId") || "";
    const driverId = url.searchParams.get("driverId") || "";
    const defaultId = url.searchParams.get("defaultId") || "";
    const state = url.searchParams.get("state") || "parked";

    console.log(`Shutdown IVR: Digit=${digits}, State=${state}, Vehicle=${vehicleId}, CallSid=${callSid}`);

    let twiml = "";

    if (state === "moving") {
      // MOVING vehicle flow
      switch (digits) {
        case "1": {
          // Press 1: Confirm pulled over — schedule parked flow re-check
          await supabase.from('admin_daily_tasks').insert({
            title: `Driver confirmed pull-over: Vehicle ${vehicleId}`,
            description: `Driver (${callerPhone}) confirmed they have pulled over for vehicle ${vehicleId}. Shutdown pending verification of parked status via IoT telemetry. Call SID: ${callSid}.`,
            category: 'vehicle_emergency',
            priority: 'urgent',
          });

          twiml = `<Response>
            <Say voice="alice">
              Thank you for pulling over safely. Your vehicle's status is being verified.
              If the vehicle is confirmed parked, the shutdown process will begin shortly unless you take action.
              You will receive further instructions. Stay safe. Goodbye.
            </Say>
          </Response>`;
          break;
        }

        case "2": {
          // Press 2: Emergency assistance
          await supabase.from('admin_daily_tasks').insert({
            title: `🚨 Emergency: Driver needs assistance during shutdown`,
            description: `Driver (${callerPhone}) requested emergency assistance during shutdown warning for vehicle ${vehicleId}. IMMEDIATE attention required. Call SID: ${callSid}.`,
            category: 'vehicle_emergency',
            priority: 'urgent',
          });

          twiml = `<Response>
            <Say voice="alice">
              Connecting you to emergency support now. Please stay on the line.
            </Say>
            <Dial callerId="${SUPPORT_NUMBER}" timeout="45">
              <Number>${SUPPORT_NUMBER}</Number>
            </Dial>
            <Say voice="alice">
              We could not reach an agent. Emergency support has been notified and will call you back within 5 minutes. 
              Please remain in a safe location. Goodbye.
            </Say>
          </Response>`;
          break;
        }

        default:
          twiml = `<Response>
            <Say voice="alice">
              Please pull over to a safe location. Your vehicle will not be disabled while in motion. Goodbye.
            </Say>
          </Response>`;
      }
    } else {
      // PARKED vehicle flow
      switch (digits) {
        case "1": {
          // Press 1: Dispute shutdown — pause timer, log for admin
          // If there's a payment default, mark as disputed
          if (defaultId) {
            await supabase.from('payment_defaults')
              .update({
                status: 'disputed',
                deactivation_eligible: false,
              })
              .eq('id', defaultId);
          }

          await supabase.from('admin_daily_tasks').insert({
            title: `⚠️ Shutdown disputed: Vehicle ${vehicleId}`,
            description: `Driver (${callerPhone}) disputed the shutdown of vehicle ${vehicleId}. Default ID: ${defaultId || 'N/A'}. Shutdown timer paused pending admin review. Call SID: ${callSid}.`,
            category: 'vehicle_emergency',
            priority: 'urgent',
          });

          twiml = `<Response>
            <Say voice="alice">
              Your dispute has been logged and the shutdown timer has been paused.
              An administrator will review your case within 1 hour.
              You will be contacted with the decision.
              If you do not hear back within 1 hour, please call our support line.
              Thank you. Goodbye.
            </Say>
          </Response>`;
          break;
        }

        case "2": {
          // Press 2: Connect to agent
          twiml = `<Response>
            <Say voice="alice">
              Connecting you to a support agent now. The shutdown timer has been paused while you speak with an agent. Please hold.
            </Say>
            <Dial callerId="${SUPPORT_NUMBER}" timeout="30">
              <Number>${SUPPORT_NUMBER}</Number>
            </Dial>
            <Say voice="alice">
              We're sorry, no agents are available. Your dispute has been logged automatically and the shutdown has been temporarily paused.
              An agent will call you back within 30 minutes. Goodbye.
            </Say>
          </Response>`;

          // Auto-log dispute if agent unavailable
          await supabase.from('admin_daily_tasks').insert({
            title: `Shutdown: Agent unavailable for Vehicle ${vehicleId}`,
            description: `Driver (${callerPhone}) tried to reach agent during shutdown warning for vehicle ${vehicleId}. No agent available. Auto-dispute logged. Callback required within 30 min.`,
            category: 'vehicle_emergency',
            priority: 'urgent',
          });
          break;
        }

        default:
          twiml = `<Response>
            <Say voice="alice">
              No valid selection received. The shutdown will proceed as scheduled. Contact support at ${SUPPORT_NUMBER} for assistance. Goodbye.
            </Say>
          </Response>`;
      }
    }

    return new Response(twiml, {
      status: 200,
      headers: { "Content-Type": "application/xml", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Shutdown IVR error:", error);
    return new Response(
      `<Response><Say>An error occurred. Please contact support. Goodbye.</Say></Response>`,
      { status: 200, headers: { "Content-Type": "application/xml", ...corsHeaders } }
    );
  }
};

serve(handler);
