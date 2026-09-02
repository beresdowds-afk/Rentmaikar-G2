import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { 
  vehicleUnlockedMessage,
  paymentSuccessMessage,
} from "../_shared/whatsapp-templates.ts";
import { 
  vehicleUnlockedEmail,
  paymentReceiptEmail,
} from "../_shared/email-templates.ts";
import { requireCronSecretAsync } from "../_shared/cron-auth.ts";
import { twilioMessagingEnabled } from "../_shared/twilio-messaging-guard.ts";
import { isOptedOut } from "../_shared/opt-out.ts";
import { resendSendEmail } from "../_shared/resend-gateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Payment-to-Unlock Latency Guarantee: < 30 seconds
const UNLOCK_LATENCY_GUARANTEE_MS = 30000;

interface PaymentConfirmation {
  transactionId: string;
  driverId: string;
  amount: number;
  currency: 'USD' | 'NGN';
  paymentMethod: string;
  vehicleId?: string;
}

const sendWhatsAppMessage = async (to: string, message: string) => {
  if (await isOptedOut(to, "whatsapp")) {
    console.log(`[opt-out] Suppressed WhatsApp to ${to}`);
    return null;
  }

  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const fromNumber = Deno.env.get("TWILIO_PHONE_NUMBER");

  if (!twilioMessagingEnabled()) {
    console.warn("Twilio messaging disabled (voice-only approval) — skipping");
    return null;
  }

  if (!accountSid || !authToken || !fromNumber) {
    console.error("Twilio credentials not configured");
    return null;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  
  const formData = new URLSearchParams();
  formData.append("To", `whatsapp:${to}`);
  formData.append("From", `whatsapp:${fromNumber}`);
  formData.append("Body", message);
  formData.append("StatusCallback", `${Deno.env.get("SUPABASE_URL")}/functions/v1/twilio-webhook`);


  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData.toString(),
  });

  return response.json();
};

const sendEmail = async (to: string, subject: string, html: string) => {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) return null;

  const response = await resendSendEmail({
      from: "Rentmaikar <noreply@rentmaikar.com>",
      to: [to],
      subject,
      html,
    }, resendApiKey);

  return response.json();
};

const sendIoTUnlockCommand = async (vehicleId: string, deviceId: string) => {
  // This would integrate with AWS IoT Core or your GPS device API
  // For now, we log the command and update device status
  console.log(`[IoT Unlock] Sending unlock command to device ${deviceId} for vehicle ${vehicleId}`);
  
  // In production, this would be:
  // await fetch(`https://your-iot-endpoint/devices/${deviceId}/command`, {
  //   method: 'POST',
  //   body: JSON.stringify({ command: 'UNLOCK', reason: 'payment_received' })
  // });
  
  return { success: true, timestamp: new Date().toISOString() };
};

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

const processPaymentUnlock = async (supabase: SupabaseClient, payment: PaymentConfirmation) => {
  const startTime = Date.now();

  {
    console.log(`[Payment Unlock] Processing payment ${payment.transactionId} for driver ${payment.driverId}`);

    // Step 1: Resolve any active payment defaults
    const { data: activeDefaults, error: defaultsError } = await supabase
      .from("payment_defaults")
      .select("*")
      .eq("driver_id", payment.driverId)
      .eq("status", "active");

    if (defaultsError) {
      throw new Error(`Failed to fetch defaults: ${defaultsError.message}`);
    }

    // Step 2: Get driver profile for notifications
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", payment.driverId)
      .single();

    // Step 3: Get vehicle and IoT device info
    let vehicleInfo = null;
    let deviceInfo = null;

    if (payment.vehicleId || activeDefaults?.[0]?.vehicle_id) {
      const vehicleId = payment.vehicleId || activeDefaults?.[0]?.vehicle_id;
      
      const { data: vehicle } = await supabase
        .from("vehicles")
        .select("*, iot_devices(*)")
        .eq("id", vehicleId)
        .single();
      
      if (vehicle) {
        vehicleInfo = vehicle;
        // Get linked IoT device
        const { data: device } = await supabase
          .from("iot_devices")
          .select("*")
          .eq("vehicle_id", vehicleId)
          .eq("is_linked", true)
          .single();
        
        deviceInfo = device;
      }
    }

    // Step 4: If vehicle was locked, send unlock command IMMEDIATELY
    const wasLocked = activeDefaults?.some((d: any) => d.deactivation_eligible);
    
    if (wasLocked && deviceInfo) {
      console.log(`[Payment Unlock] Vehicle was locked, sending unlock command...`);
      
      // Send IoT unlock command - THIS IS TIME-CRITICAL
      const unlockResult = await sendIoTUnlockCommand(deviceInfo.vehicle_id, deviceInfo.id);
      
      // Update device status
      await supabase
        .from("iot_devices")
        .update({ 
          status: "active",
          notes: `Unlocked after payment ${payment.transactionId} at ${new Date().toISOString()}`
        })
        .eq("id", deviceInfo.id);

      console.log(`[Payment Unlock] Unlock command sent in ${Date.now() - startTime}ms`);
    }

    // Step 5: Resolve all active defaults
    if (activeDefaults && activeDefaults.length > 0) {
      await supabase
        .from("payment_defaults")
        .update({ 
          status: "resolved",
          resolved_at: new Date().toISOString(),
        })
        .in("id", activeDefaults.map((d: any) => d.id));

      console.log(`[Payment Unlock] Resolved ${activeDefaults.length} payment defaults`);
    }

    // Step 6: Calculate unlock latency
    const unlockLatency = Date.now() - startTime;
    const withinGuarantee = unlockLatency < UNLOCK_LATENCY_GUARANTEE_MS;

    console.log(`[Payment Unlock] Total unlock latency: ${unlockLatency}ms (Guarantee: ${withinGuarantee ? 'MET' : 'EXCEEDED'})`);

    // Step 7: Send notifications (async, after unlock is complete)
    const notificationPromises: Promise<any>[] = [];

    if (profile?.phone && profile?.notification_whatsapp) {
      // Send vehicle unlocked message if it was locked
      if (wasLocked) {
        notificationPromises.push(
          sendWhatsAppMessage(profile.phone, vehicleUnlockedMessage())
        );
      } else {
        // Just send payment success
        notificationPromises.push(
          sendWhatsAppMessage(profile.phone, paymentSuccessMessage())
        );
      }
    }

    if (profile?.email && profile?.notification_email) {
      // Send receipt email
      const vehicleName = vehicleInfo 
        ? `${vehicleInfo.make || ''} ${vehicleInfo.model || ''}`.trim() 
        : 'Vehicle';
      
      const receiptEmail = paymentReceiptEmail({
        firstName: profile.full_name?.split(' ')[0] || 'Driver',
        amount: payment.amount,
        currency: payment.currency,
        paymentDate: new Date().toLocaleDateString(),
        paymentMethod: payment.paymentMethod,
        transactionId: payment.transactionId,
        vehicleName,
        periodStart: new Date().toLocaleDateString(),
        periodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString(),
      });

      notificationPromises.push(
        sendEmail(profile.email, receiptEmail.subject, receiptEmail.html)
      );

      // If was locked, also send unlock confirmation email
      if (wasLocked) {
        const unlockEmail = vehicleUnlockedEmail({
          firstName: profile.full_name?.split(' ')[0] || 'Driver',
          vehicleName,
          unlockTime: new Date().toLocaleString(),
        });
        notificationPromises.push(
          sendEmail(profile.email, unlockEmail.subject, unlockEmail.html)
        );
      }
    }

    // Fire notifications (don't wait for them)
    Promise.all(notificationPromises).catch(err => {
      console.error("[Payment Unlock] Notification error:", err);
    });

    // Log audit trail
    if (deviceInfo) {
      await supabase.from("device_activity_log").insert({
        device_id: deviceInfo.id,
        action: "UNLOCK",
        performed_by: payment.driverId,
        details: {
          reason: "payment_received",
          transaction_id: payment.transactionId,
          amount: payment.amount,
          currency: payment.currency,
          unlock_latency_ms: unlockLatency,
          within_guarantee: withinGuarantee,
        },
      });
    }

    return {
      success: true,
      transactionId: payment.transactionId,
      driverId: payment.driverId,
      vehicleUnlocked: Boolean(wasLocked),
      unlockLatencyMs: unlockLatency,
      withinGuarantee,
      defaultsResolved: activeDefaults?.length || 0,
    };
  }
};

/**
 * Scheduled sweep: find drivers who still carry an active payment default even
 * though a completed payment has landed since the default was raised, and
 * release them. The 10-minute cron hits this path (no payment body), while
 * payment webhooks post a single PaymentConfirmation.
 */
const runScheduledSweep = async (supabase: SupabaseClient) => {
  const { data: defaults, error } = await supabase
    .from("payment_defaults")
    .select("id, driver_id, vehicle_id, created_at, currency")
    .eq("status", "active");

  if (error) throw new Error(`Failed to fetch active defaults: ${error.message}`);
  if (!defaults?.length) {
    return { mode: "scheduled", candidates: 0, processed: 0, results: [] };
  }

  const driverIds = Array.from(new Set(defaults.map((d: any) => d.driver_id).filter(Boolean)));
  const { data: settledPayments, error: payError } = await supabase
    .from("payments")
    .select("id, driver_id, vehicle_id, amount, currency, payment_method, transaction_id, settled_at, processed_at, created_at, status")
    .in("driver_id", driverIds)
    .in("status", ["completed", "succeeded", "settled", "paid"])
    .order("created_at", { ascending: false });

  if (payError) throw new Error(`Failed to fetch settled payments: ${payError.message}`);

  const results: unknown[] = [];
  const handledDrivers = new Set<string>();

  for (const def of defaults) {
    if (handledDrivers.has(def.driver_id)) continue;

    const paidAfterDefault = (settledPayments || []).find((p: any) => {
      if (p.driver_id !== def.driver_id) return false;
      const paidAt = new Date(p.settled_at || p.processed_at || p.created_at).getTime();
      return paidAt >= new Date(def.created_at).getTime();
    });
    if (!paidAfterDefault) continue;

    handledDrivers.add(def.driver_id);
    try {
      results.push(
        await processPaymentUnlock(supabase, {
          transactionId: paidAfterDefault.transaction_id || paidAfterDefault.id,
          driverId: def.driver_id,
          amount: Number(paidAfterDefault.amount || 0),
          currency: (paidAfterDefault.currency || def.currency || "USD") as "USD" | "NGN",
          paymentMethod: paidAfterDefault.payment_method || "unknown",
          vehicleId: paidAfterDefault.vehicle_id || def.vehicle_id || undefined,
        }),
      );
    } catch (err) {
      console.error(`[Payment Unlock] Sweep failed for driver ${def.driver_id}:`, err);
      results.push({ driverId: def.driver_id, success: false, error: (err as Error).message });
    }
  }

  return { mode: "scheduled", candidates: defaults.length, processed: results.length, results };
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const cronDenied = await requireCronSecretAsync(req);
  if (cronDenied) return cronDenied;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let body: Partial<PaymentConfirmation> = {};
    try {
      body = (await req.json()) ?? {};
    } catch {
      body = {};
    }

    // Scheduled invocation: no payment payload, sweep for paid-but-locked drivers.
    if (!body.driverId) {
      const summary = await runScheduledSweep(supabase);
      console.log(`[Payment Unlock] Scheduled sweep: ${summary.processed}/${summary.candidates} released`);
      return new Response(JSON.stringify({ ...summary, timestamp: new Date().toISOString() }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!body.transactionId) {
      return new Response(
        JSON.stringify({ error: "transactionId is required when driverId is supplied" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const result = await processPaymentUnlock(supabase, {
      transactionId: body.transactionId,
      driverId: body.driverId,
      amount: Number(body.amount || 0),
      currency: (body.currency || "USD") as "USD" | "NGN",
      paymentMethod: body.paymentMethod || "unknown",
      vehicleId: body.vehicleId,
    });

    return new Response(JSON.stringify({ ...result, timestamp: new Date().toISOString() }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("[Payment Unlock Error]", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
