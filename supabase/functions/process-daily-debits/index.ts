import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireCronSecret } from "../_shared/cron-auth.ts";
import { resendSendEmail } from "../_shared/resend-gateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const getCurrencySymbol = (currency: string): string => currency === 'NGN' ? '₦' : '$';

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
      body: JSON.stringify({ phone, channel, notificationType: 'general', customMessage: message }),
    });
    const result = await response.json();
    return result.success === true;
  } catch (error) {
    console.error(`[DailyDebits] Failed to send ${channel}:`, error);
    return false;
  }
};

const sendEmail = async (to: string, subject: string, html: string) => {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) return null;
  try {
    const response = await resendSendEmail({ from: "Rentmaikar <noreply@rentmaikar.com>", to: [to], subject, html }, resendApiKey);
    return response.ok ? response.json() : null;
  } catch { return null; }
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const cronDenied = requireCronSecret(req);
  if (cronDenied) return cronDenied;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("[DailyDebits] Starting 12:01 AM batch...");

    // Fetch today's payments that haven't had notifications sent yet
    const today = new Date().toISOString().split('T')[0];
    const { data: payments, error } = await supabase
      .from('payments')
      .select('*')
      .gte('created_at', `${today}T00:00:00Z`)
      .eq('notification_sent', false)
      .in('status', ['completed', 'failed']);

    if (error) throw new Error(`Failed to fetch payments: ${error.message}`);

    console.log(`[DailyDebits] Found ${payments?.length || 0} payments to notify`);

    const results = { successNotified: 0, failedNotified: 0, errors: [] as string[] };

    for (const payment of payments || []) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, phone, email, notification_sms, notification_whatsapp, notification_email, payments_suspended, suspended_reason')
        .eq('user_id', payment.driver_id)
        .single();

      if (!profile) continue;

      // Skip suspended drivers (active call-in)
      if (profile.payments_suspended) {
        console.log(`[DailyDebits] Skipping ${payment.driver_id} — payments_suspended (${profile.suspended_reason})`);
        await supabase.from('payments').update({ notification_sent: true }).eq('id', payment.id);
        continue;
      }


      const firstName = profile.full_name?.split(' ')[0] || 'Driver';
      const sym = getCurrencySymbol(payment.currency);
      const amount = `${sym}${payment.amount.toLocaleString()}`;

      if (payment.status === 'completed') {
        // Payment success notification
        const whatsappMsg = `✅ Payment Processed – Rentmaikar\n\nHi ${firstName}, your daily payment of ${amount} has been processed successfully.\n\nThank you for choosing Rentmaikar! 🚗`;
        
        if (profile.phone && profile.notification_whatsapp) {
          await sendNotification(profile.phone, whatsappMsg, 'whatsapp', supabaseUrl, supabaseKey);
        }
        if (profile.phone && profile.notification_sms) {
          await sendNotification(profile.phone, `Rentmaikar: Your daily payment of ${amount} has been processed. Thank you!`, 'sms', supabaseUrl, supabaseKey);
        }
        if (profile.email && profile.notification_email) {
          await sendEmail(profile.email, `✅ Payment Processed – ${amount}`,
            `<h2>Payment Confirmed</h2><p>Hi ${firstName},</p><p>Your daily payment of <strong>${amount}</strong> has been processed successfully.</p><p>Thank you for choosing Rentmaikar!</p>`
          );
        }
        results.successNotified++;

      } else if (payment.status === 'failed') {
        // Payment failed notification - HIGH PRIORITY
        const failMsg = `🚨 Payment Failed – Rentmaikar\n\nHi ${firstName}, your daily payment of ${amount} could not be processed.\n\nReason: ${payment.failure_reason || 'Payment method declined'}\n\nPlease update your payment method immediately to avoid service interruption.\n\nReply *PAY* to retry.`;

        if (profile.phone && profile.notification_whatsapp) {
          await sendNotification(profile.phone, failMsg, 'whatsapp', supabaseUrl, supabaseKey);
        }
        if (profile.phone && profile.notification_sms) {
          await sendNotification(profile.phone, `URGENT Rentmaikar: Payment of ${amount} FAILED. Update your payment method to avoid vehicle restriction.`, 'sms', supabaseUrl, supabaseKey);
        }
        if (profile.email && profile.notification_email) {
          await sendEmail(profile.email, `🚨 Payment Failed – Action Required`,
            `<h2>Payment Failed</h2><p>Hi ${firstName},</p><p>Your daily payment of <strong>${amount}</strong> could not be processed.</p><p><strong>Reason:</strong> ${payment.failure_reason || 'Payment method declined'}</p><p>Please update your payment method immediately.</p>`
          );
        }
        results.failedNotified++;
      }

      // Mark notification as sent
      await supabase.from('payments').update({ notification_sent: true }).eq('id', payment.id);
    }

    console.log("[DailyDebits] Complete:", results);

    return new Response(JSON.stringify({ success: true, results, timestamp: new Date().toISOString() }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
  } catch (error: any) {
    console.error("[DailyDebits Error]", error);
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
  }
};

serve(handler);
