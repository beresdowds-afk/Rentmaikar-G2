import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireCronSecret } from "../_shared/cron-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PaymentDefault {
  id: string;
  driver_id: string;
  vehicle_id: string;
  rental_id: string;
  amount_due: number;
  currency: string;
  payment_frequency: 'daily' | 'weekly';
  hours_overdue: number;
  notifications_sent: number;
  last_notification_at: string | null;
  deactivation_eligible: boolean;
  status: string;
}

// ─── BUSINESS RULES ───
// Daily plans: 24h overdue window, notifications at 8h intervals, lockdown at 24h
// Weekly plans: 36h overdue window, notifications at 12h intervals, lockdown at 36h
// Weekly lockdown → driver downgraded to Daily plan permanently
const CONFIG = {
  weekly: {
    notificationHours: [12, 24, 36],
    lockdownAfterHours: 36,
  },
  daily: {
    notificationHours: [8, 16, 24],
    lockdownAfterHours: 24,
  },
};

const getCurrencySymbol = (currency: string): string => {
  return currency === 'NGN' ? '₦' : '$';
};

const generateNotificationMessage = (
  paymentDefault: PaymentDefault,
  notificationNumber: number,
  driverName: string
): string => {
  const config = CONFIG[paymentDefault.payment_frequency];
  const hoursRemaining = config.lockdownAfterHours - paymentDefault.hours_overdue;
  const isDaily = paymentDefault.payment_frequency === 'daily';
  const sym = getCurrencySymbol(paymentDefault.currency);
  const amount = `${sym}${paymentDefault.amount_due.toLocaleString()}`;
  
  const messages: Record<number, string> = {
    1: `🔔 Rentmaikar Payment Reminder (1/3)

Dear ${driverName},

Your payment of ${amount} is overdue. Please make payment immediately.

⚠️ ${isDaily ? 'DAILY' : 'WEEKLY'} plan: Vehicle lockdown in ${hoursRemaining}h if not resolved.

Pay now to avoid service interruption.
A 10% administrative fine applies to late payments.`,

    2: `⚠️ URGENT: Payment Overdue (2/3)

Dear ${driverName},

Your ${amount} payment remains outstanding.

🚨 ${hoursRemaining}h until vehicle lockdown!

${isDaily ? 'Daily plans require faster resolution.' : 'Your plan will be downgraded to Daily if not resolved.'}

Contact support if you need assistance.`,

    3: `🚨 FINAL NOTICE (3/3)

Dear ${driverName},

FINAL WARNING: ${amount} critically overdue.

❌ Vehicle lockdown authorized. Your vehicle will be disabled when parked.

${isDaily ? 'Daily payment plans are now FORBIDDEN for your account.' : 'Your payment plan will be downgraded to Daily effective immediately.'}

Pay immediately to avoid lockdown.`,
  };

  return messages[notificationNumber] || messages[1];
};

// Generate TwiML with IVR menu for payment default calls
const generateCallTwiml = (
  paymentDefault: PaymentDefault,
  notificationNumber: number,
  driverName: string,
  supabaseUrl: string
): string => {
  const config = CONFIG[paymentDefault.payment_frequency];
  const hoursRemaining = config.lockdownAfterHours - paymentDefault.hours_overdue;
  const sym = getCurrencySymbol(paymentDefault.currency);
  const amount = `${sym}${paymentDefault.amount_due}`;
  const isDaily = paymentDefault.payment_frequency === 'daily';

  // IVR action URL for keypress handling
  const actionUrl = `${supabaseUrl}/functions/v1/payment-default-ivr?defaultId=${paymentDefault.id}&stage=${notificationNumber}`;

  const stageMessages: Record<number, string> = {
    1: `Hello ${driverName}. This is Rentmaikar regarding your payment. Your payment of ${amount} is now overdue. You have ${hoursRemaining} hours before vehicle lockdown. Press 1 to make a payment now, or press 2 to speak with support.`,
    2: `Hello ${driverName}. This is an urgent notice from Rentmaikar. Your payment of ${amount} remains outstanding. Vehicle deactivation will occur in ${hoursRemaining} hours. Press 1 to make a payment now, or press 2 to speak with support.`,
    3: `Dear ${driverName}. This is a final notice from the Rentmaikar Payment Team regarding your account. Please be advised that due to an outstanding balance, your vehicle has been scheduled for a service interruption within the next 24 hours. To prevent this, please ensure your payments are brought up to date immediately and are recorded in our system. Please be aware of the following: The vehicle may shut down to prevent further operation. While it will not turn off while in motion for safety reasons, it may become inoperable after stopping. To avoid being stranded or facing towing fees, ensure the vehicle is parked in a safe, legal location before midnight. You can view previous notifications in your email and your preferred messaging channel, SMS or WhatsApp. Thank you.`,
  };

  const message = stageMessages[notificationNumber] || stageMessages[1];

  return `<Response>
  <Gather numDigits="1" action="${actionUrl}" method="POST" timeout="10">
    <Say voice="alice">${message}</Say>
    <Say voice="alice">Press 1 to make a payment now.</Say>
    <Say voice="alice">Press 2 to speak with support.</Say>
  </Gather>
  <Say voice="alice">We did not receive your input. A support agent will follow up with you shortly. Goodbye.</Say>
</Response>`;
};

// Generate voicemail TwiML for no-answer scenarios
const generateVoicemailTwiml = (
  paymentDefault: PaymentDefault,
  notificationNumber: number,
  driverName: string
): string => {
  const sym = getCurrencySymbol(paymentDefault.currency);
  const amount = `${sym}${paymentDefault.amount_due}`;

  return `<Response>
  <Say voice="alice">Hello ${driverName}. This is Rentmaikar. Your payment of ${amount} is overdue. Please call us back or log into your dashboard to make payment immediately. Thank you.</Say>
</Response>`;
};

const sendNotification = async (
  phone: string,
  message: string,
  channel: 'sms' | 'whatsapp',
  supabaseUrl: string,
  supabaseKey: string
): Promise<boolean> => {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/send-sms-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        phone,
        channel,
        notificationType: 'general',
        customMessage: message,
      }),
    });

    const result = await response.json();
    return result.success === true;
  } catch (error) {
    console.error(`[PaymentDefaults] Failed to send ${channel}:`, error);
    return false;
  }
};

// Initiate VoIP call with IVR for payment default
// Routes via Twilio (USA) or Termii (Nigeria) based on phone prefix
const initiateDefaultCall = async (
  paymentDefault: PaymentDefault,
  notificationNumber: number,
  profile: { full_name: string | null; phone: string },
  supabaseUrl: string,
  supabase: any
): Promise<{ success: boolean; callId?: string }> => {
  const isNigeria = profile.phone.startsWith('+234');

  // For Nigeria, use Termii Voice API
  if (isNigeria) {
    return await initiateTermiiCall(paymentDefault, notificationNumber, profile, supabaseUrl, supabase);
  }

  // For USA, use Twilio
  const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER') || '+16083843932';

  if (!twilioAccountSid || !twilioAuthToken) {
    console.log('[PaymentDefaults] Twilio credentials not configured, skipping VoIP');
    return { success: false };
  }

  try {
    const driverName = profile.full_name || 'Driver';
    const twiml = generateCallTwiml(paymentDefault, notificationNumber, driverName, supabaseUrl);

    // Create call record
    const { data: callRecord, error: callErr } = await supabase
      .from('voip_calls')
      .insert({
        initiated_by: paymentDefault.driver_id,
        call_type: 'individual',
        region: profile.phone.startsWith('+234') ? 'Nigeria' : 'USA',
        status: 'pending',
        direction: 'outbound',
        started_at: new Date().toISOString(),
        caller_role: 'system',
        receiver_id: paymentDefault.driver_id,
        receiver_role: 'driver',
      })
      .select()
      .single();

    if (callErr || !callRecord) {
      console.error('[PaymentDefaults] Failed to create call record:', callErr);
      return { success: false };
    }

    // Initiate call via Twilio with Answering Machine Detection
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Calls.json`;
    const formData = new URLSearchParams({
      To: profile.phone,
      From: twilioPhone,
      Twiml: twiml,
      StatusCallback: `${supabaseUrl}/functions/v1/voip-status-callback`,
      StatusCallbackEvent: 'initiated ringing answered completed',
      MachineDetection: 'DetectMessageEnd',
      MachineDetectionTimeout: '10',
    });

    // Set fallback voicemail TwiML URL for answering machines
    const voicemailTwiml = generateVoicemailTwiml(paymentDefault, notificationNumber, driverName);
    formData.append('AsyncAmd', 'true');
    formData.append('AsyncAmdStatusCallback', `${supabaseUrl}/functions/v1/voip-status-callback`);

    const callResponse = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData,
    });

    const callData = await callResponse.json();

    if (callResponse.ok) {
      await supabase
        .from('voip_calls')
        .update({ call_sid: callData.sid, status: 'ringing' })
        .eq('id', callRecord.id);
      console.log(`[PaymentDefaults] VoIP call (stage ${notificationNumber}) initiated for ${paymentDefault.id}`);
      return { success: true, callId: callRecord.id };
    } else {
      await supabase
        .from('voip_calls')
        .update({ status: 'failed' })
        .eq('id', callRecord.id);
      console.error(`[PaymentDefaults] VoIP call failed:`, callData.message);
      return { success: false };
    }
  } catch (err) {
    console.error(`[PaymentDefaults] VoIP call error:`, err);
    return { success: false };
  }
};

// Initiate voice call via Termii for Nigerian numbers
const initiateTermiiCall = async (
  paymentDefault: PaymentDefault,
  notificationNumber: number,
  profile: { full_name: string | null; phone: string },
  supabaseUrl: string,
  supabase: any
): Promise<{ success: boolean; callId?: string }> => {
  const termiiApiKey = Deno.env.get('TERMII_API_KEY');
  const termiiSenderId = Deno.env.get('TERMII_SENDER_ID') || 'Rentmaikar';

  if (!termiiApiKey) {
    console.log('[PaymentDefaults] Termii credentials not configured, skipping Nigeria VoIP');
    return { success: false };
  }

  try {
    const driverName = profile.full_name || 'Driver';
    const sym = getCurrencySymbol(paymentDefault.currency);
    const amount = `${sym}${paymentDefault.amount_due}`;
    const config = CONFIG[paymentDefault.payment_frequency];
    const hoursRemaining = config.lockdownAfterHours - paymentDefault.hours_overdue;

    const voiceMessage = notificationNumber === 3
      ? `Dear ${driverName}. This is a final notice from the Rentmaikar Payment Team regarding your account. Due to an outstanding balance, your vehicle has been scheduled for a service interruption within the next 24 hours. To prevent this, please ensure your payments are brought up to date immediately and are recorded in our system. The vehicle may shut down to prevent further operation. While it will not turn off while in motion for safety reasons, it may become inoperable after stopping. To avoid being stranded or facing towing fees, ensure the vehicle is parked in a safe, legal location before midnight. You can view previous notifications in your email and your preferred messaging channel, SMS or WhatsApp. Thank you.`
      : notificationNumber === 2
      ? `Hello ${driverName}. Urgent notice from Rentmaikar. Your payment of ${amount} remains outstanding. Vehicle deactivation in ${hoursRemaining} hours.`
      : `Hello ${driverName}. This is Rentmaikar regarding your payment. Your payment of ${amount} is overdue. You have ${hoursRemaining} hours before vehicle lockdown.`;

    // Create call record
    const { data: callRecord, error: callErr } = await supabase
      .from('voip_calls')
      .insert({
        initiated_by: paymentDefault.driver_id,
        call_type: 'individual',
        region: 'Nigeria',
        status: 'pending',
        direction: 'outbound',
        started_at: new Date().toISOString(),
        caller_role: 'system',
        receiver_id: paymentDefault.driver_id,
        receiver_role: 'driver',
      })
      .select()
      .single();

    if (callErr || !callRecord) {
      console.error('[PaymentDefaults] Failed to create NG call record:', callErr);
      return { success: false };
    }

    // Initiate voice call via Termii
    const termiiResponse = await fetch('https://api.ng.termii.com/api/sms/otp/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Termii voice OTP accepts ONLY api_key, phone_number and code.
      body: JSON.stringify({
        api_key: termiiApiKey,
        phone_number: profile.phone.replace('+', ''),
        code: 1000 + (notificationNumber % 9) * 1000 + 111, // 4-digit code
      }),
    });

    const termiiData = await termiiResponse.json();

    if (termiiResponse.ok && termiiData.pinId) {
      await supabase
        .from('voip_calls')
        .update({ call_sid: termiiData.pinId, status: 'ringing' })
        .eq('id', callRecord.id);
      console.log(`[PaymentDefaults] Termii voice call (stage ${notificationNumber}) initiated for ${paymentDefault.id}`);
      return { success: true, callId: callRecord.id };
    } else {
      await supabase
        .from('voip_calls')
        .update({ status: 'failed' })
        .eq('id', callRecord.id);
      console.error('[PaymentDefaults] Termii voice call failed:', termiiData);
      return { success: false };
    }
  } catch (err) {
    console.error('[PaymentDefaults] Termii call error:', err);
    return { success: false };
  }
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const cronDenied = requireCronSecret(req);
  if (cronDenied) return cronDenied;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("[PaymentDefaults] Starting hourly payment default check...");

    // Fetch all active payment defaults
    const { data: activeDefaults, error: fetchError } = await supabase
      .from('payment_defaults')
      .select('*')
      .eq('status', 'active');

    if (fetchError) {
      throw new Error(`Failed to fetch defaults: ${fetchError.message}`);
    }

    console.log(`[PaymentDefaults] Found ${activeDefaults?.length || 0} active defaults`);

    const results = {
      processed: 0,
      notificationsSent: 0,
      voipCallsMade: 0,
      lockdownsEligible: 0,
      errors: [] as string[],
    };

    for (const paymentDefault of activeDefaults || []) {
      try {
        const config = CONFIG[paymentDefault.payment_frequency as 'daily' | 'weekly'];
        const newHoursOverdue = paymentDefault.hours_overdue + 1;
        
        // Check if notification is due
        const nextNotificationHour = config.notificationHours[paymentDefault.notifications_sent];
        let shouldNotify = false;
        let newNotificationsSent = paymentDefault.notifications_sent;
        
        if (nextNotificationHour && newHoursOverdue >= nextNotificationHour) {
          shouldNotify = true;
          newNotificationsSent = paymentDefault.notifications_sent + 1;
        }

        // Check if deactivation eligible
        const deactivationEligible = 
          newHoursOverdue >= config.lockdownAfterHours &&
          newNotificationsSent >= config.notificationHours.length;

        // Update the payment default record
        const updateData: Record<string, unknown> = {
          hours_overdue: newHoursOverdue,
          deactivation_eligible: deactivationEligible,
        };

        if (shouldNotify) {
          updateData.notifications_sent = newNotificationsSent;
          updateData.last_notification_at = new Date().toISOString();
        }

        const { error: updateError } = await supabase
          .from('payment_defaults')
          .update(updateData)
          .eq('id', paymentDefault.id);

        if (updateError) {
          results.errors.push(`Failed to update ${paymentDefault.id}: ${updateError.message}`);
          continue;
        }

        // Send notification if due
        if (shouldNotify) {
          // Fetch driver profile
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, phone, email, notification_sms, notification_whatsapp')
            .eq('user_id', paymentDefault.driver_id)
            .single();

          if (profile?.phone) {
            const message = generateNotificationMessage(
              paymentDefault,
              newNotificationsSent,
              profile.full_name || 'Driver'
            );

            // ─── SMS/WhatsApp notifications ───
            if (profile.notification_sms) {
              const smsSent = await sendNotification(
                profile.phone, message, 'sms', supabaseUrl, supabaseServiceKey
              );
              if (smsSent) results.notificationsSent++;
            }

            if (profile.notification_whatsapp || newNotificationsSent === 3) {
              const whatsappSent = await sendNotification(
                profile.phone, message, 'whatsapp', supabaseUrl, supabaseServiceKey
              );
              if (whatsappSent) results.notificationsSent++;
            }

            // ─── VoIP call with IVR on ALL stages ───
            const callResult = await initiateDefaultCall(
              paymentDefault,
              newNotificationsSent,
              { full_name: profile.full_name, phone: profile.phone },
              supabaseUrl,
              supabase
            );
            if (callResult.success) results.voipCallsMade++;
          }

          console.log(`[PaymentDefaults] Notification ${newNotificationsSent}/3 sent for ${paymentDefault.id}`);
        }

        // ─── LOCKDOWN + DOWNGRADE LOGIC ───
        if (deactivationEligible) {
          results.lockdownsEligible++;

          // Weekly plan lockdown → downgrade to Daily
          if (paymentDefault.payment_frequency === 'weekly') {
            console.log(`[PaymentDefaults] Weekly driver ${paymentDefault.driver_id} downgraded to Daily plan`);
            // The forbid_daily_plan_on_default trigger handles the profile flag
          }

          console.log(`[PaymentDefaults] Lockdown eligible: ${paymentDefault.id} (${paymentDefault.payment_frequency})`);
        }

        results.processed++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.errors.push(`Error processing ${paymentDefault.id}: ${errorMessage}`);
      }
    }

    console.log("[PaymentDefaults] Processing complete:", results);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Payment defaults processed',
        results 
      }),
      { 
        status: 200, 
        headers: { "Content-Type": "application/json", ...corsHeaders } 
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("[PaymentDefaults] Error:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
