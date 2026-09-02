import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireCronSecret } from "../_shared/cron-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPPORT_NUMBER = "+16083843932";

/**
 * Vehicle Return Reminder
 * 
 * Triggered daily — finds rentals ending within 24 hours and calls drivers with IVR:
 * Press 1 → Confirm return time (+ confirmation SMS)
 * Press 2 → Request extension (check availability)
 * Press 3 → Report issue (log to admin tasks)
 * Press 4 → Speak to agent
 */
const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const cronDenied = requireCronSecret(req);
  if (cronDenied) return cronDenied;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioPhoneNumber = Deno.env.get("TWILIO_PHONE_NUMBER") || SUPPORT_NUMBER;
    const termiiApiKey = Deno.env.get("TERMII_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find active rentals ending within the next 24 hours that haven't been reminded yet
    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const { data: expiringRentals, error: rentalsError } = await supabase
      .from('rentals')
      .select(`
        id, vehicle_id, driver_id, owner_id, end_date, 
        daily_rate, currency, region, return_location,
        return_reminder_sent, extension_requested
      `)
      .eq('status', 'active')
      .eq('return_reminder_sent', false)
      .lte('end_date', in24Hours.toISOString())
      .gte('end_date', now.toISOString());

    if (rentalsError) {
      console.error("Error fetching expiring rentals:", rentalsError);
      throw new Error(`Failed to fetch rentals: ${rentalsError.message}`);
    }

    const results = {
      processed: 0,
      callsMade: 0,
      smsSent: 0,
      errors: [] as string[],
    };

    for (const rental of expiringRentals || []) {
      try {
        // Fetch driver profile
        const { data: driverProfile } = await supabase
          .from('profiles')
          .select('user_id, full_name, phone, email, notification_sms')
          .eq('user_id', rental.driver_id)
          .maybeSingle();

        if (!driverProfile?.phone) {
          results.errors.push(`No phone for driver ${rental.driver_id}`);
          continue;
        }

        // Fetch vehicle info
        const { data: vehicle } = await supabase
          .from('vehicles')
          .select('make, model, year, license_plate')
          .eq('id', rental.vehicle_id)
          .maybeSingle();

        const vehicleInfo = vehicle
          ? `${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.license_plate})`
          : 'your rented vehicle';

        const returnTime = new Date(rental.end_date).toLocaleString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });

        const returnAddress = rental.return_location || 'the designated pickup location';

        // Generate TwiML with IVR
        const twiml = `<Response>
          <Gather numDigits="1" action="${supabaseUrl}/functions/v1/vehicle-return-ivr?rentalId=${rental.id}&vehicleId=${rental.vehicle_id}&driverId=${rental.driver_id}" method="POST" timeout="10">
            <Say voice="alice">
              Hello ${driverProfile.full_name || 'Driver'}. This is Rentmaikar reminding you that your rental of ${vehicleInfo} ends tomorrow at ${returnTime}.
              Press 1 to confirm your return time.
              Press 2 to request an extension.
              Press 3 to report an issue.
              Press 4 to speak with a support agent.
            </Say>
          </Gather>
          <Say voice="alice">We did not receive your selection. A reminder has been noted. Goodbye.</Say>
        </Response>`;

        // Create call record
        const { data: callRecord, error: callError } = await supabase
          .from('voip_calls')
          .insert({
            initiated_by: rental.driver_id,
            call_type: 'individual',
            region: driverProfile.phone.startsWith('+234') ? 'Nigeria' : 'USA',
            status: 'pending',
            direction: 'outbound',
            started_at: new Date().toISOString(),
            duration_seconds: 0,
            caller_role: 'system',
          })
          .select()
          .single();

        if (callError) throw new Error(`Call record failed: ${callError.message}`);

        const isNigeria = driverProfile.phone.startsWith('+234');
        let callSuccess = false;
        let callSidValue = '';

        if (isNigeria && termiiApiKey) {
          // ─── TERMII (Nigeria) ───
          const voiceMsg = `Hello ${driverProfile.full_name || 'Driver'}. This is Rentmaikar reminding you that your rental of ${vehicleInfo} ends ${returnTime}. Please return the vehicle on time.`;
          const termiiResp = await fetch('https://api.ng.termii.com/api/sms/otp/call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // Termii voice OTP accepts ONLY api_key, phone_number and code.
            body: JSON.stringify({
              api_key: termiiApiKey,
              phone_number: driverProfile.phone.replace('+', ''),
              code: 1234,
            }),
          });
          const termiiData = await termiiResp.json();
          if (termiiResp.ok && termiiData.pinId) {
            callSuccess = true;
            callSidValue = termiiData.pinId;
          }
        } else if (twilioAccountSid && twilioAuthToken) {
          // ─── TWILIO (USA) ───
          const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Calls.json`;
          const callResponse = await fetch(twilioUrl, {
            method: 'POST',
            headers: {
              'Authorization': 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              To: driverProfile.phone,
              From: twilioPhoneNumber,
              Twiml: twiml,
              StatusCallback: `${supabaseUrl}/functions/v1/voip-status-callback`,
              MachineDetection: 'DetectMessageEnd',
              AsyncAmd: 'true',
            }),
          });
          const callData = await callResponse.json();
          if (callResponse.ok) {
            callSuccess = true;
            callSidValue = callData.sid;
          } else {
            results.errors.push(`Call failed for rental ${rental.id}: ${callData.message}`);
          }
        }

        if (callSuccess) {
          await supabase.from('voip_calls')
            .update({ call_sid: callSidValue, status: 'ringing' })
            .eq('id', callRecord.id);

          // Mark reminder as sent
          await supabase.from('rentals')
            .update({ return_reminder_sent: true })
            .eq('id', rental.id);

          results.callsMade++;
        } else {
          await supabase.from('voip_calls')
            .update({ status: 'failed' })
            .eq('id', callRecord.id);
        }

        // Also send SMS reminder
        if (driverProfile.notification_sms) {
          try {
            const smsUrl = `${supabaseUrl}/functions/v1/send-sms-notification`;
            await fetch(smsUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({
                phone: driverProfile.phone,
                channel: 'sms',
                notificationType: 'general',
                customMessage: `Reminder: Your rental of ${vehicleInfo} ends ${returnTime}. Return to: ${returnAddress}. Call us if you need to extend.`,
              }),
            });
            results.smsSent++;
          } catch (e) {
            results.errors.push(`SMS failed for rental ${rental.id}: ${e}`);
          }
        }

        results.processed++;
      } catch (e) {
        results.errors.push(`Processing rental ${rental.id} failed: ${e}`);
      }
    }

    console.log("Vehicle return reminder results:", results);

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in vehicle-return-reminder:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
