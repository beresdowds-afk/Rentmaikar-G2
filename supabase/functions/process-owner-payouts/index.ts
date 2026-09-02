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
    console.error(`[OwnerPayouts] Failed to send ${channel}:`, error);
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

    console.log("[OwnerPayouts] Starting Friday 5 PM payout notification batch...");

    // Get this week's earnings that haven't been notified
    const { data: earnings, error } = await supabase
      .from('owner_earnings')
      .select('*')
      .eq('notification_sent', false)
      .in('status', ['completed', 'pending', 'processing']);

    if (error) throw new Error(`Failed to fetch earnings: ${error.message}`);

    console.log(`[OwnerPayouts] Found ${earnings?.length || 0} payouts to notify`);

    const results = { successNotified: 0, pendingNotified: 0, errors: [] as string[] };

    // Group by owner for consolidated notifications
    const ownerEarnings: Record<string, typeof earnings> = {};
    for (const earning of earnings || []) {
      if (!ownerEarnings[earning.owner_id]) ownerEarnings[earning.owner_id] = [];
      ownerEarnings[earning.owner_id].push(earning);
    }

    for (const [ownerId, ownerPayouts] of Object.entries(ownerEarnings)) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, phone, email, notification_sms, notification_whatsapp, notification_email')
        .eq('user_id', ownerId)
        .single();

      if (!profile) continue;

      const firstName = profile.full_name?.split(' ')[0] || 'Owner';

      // Separate completed vs pending
      const completed = ownerPayouts.filter(p => p.status === 'completed');
      const pending = ownerPayouts.filter(p => p.status === 'pending' || p.status === 'processing');

      // Notify completed payouts
      if (completed.length > 0) {
        const totalByCurrency: Record<string, number> = {};
        for (const p of completed) {
          totalByCurrency[p.currency] = (totalByCurrency[p.currency] || 0) + p.amount;
        }

        const amountStrings = Object.entries(totalByCurrency)
          .map(([curr, amt]) => `${getCurrencySymbol(curr)}${amt.toLocaleString()}`)
          .join(' + ');

        const payoutMethod = completed[0].payout_method || 'your registered account';

        const whatsappMsg = `💰 Payout Sent – Rentmaikar\n\nGood news ${firstName}! Your weekly payout of ${amountStrings} has been sent to ${payoutMethod}.\n\nThank you for partnering with Rentmaikar! 🤝`;

        if (profile.phone && profile.notification_whatsapp) {
          await sendNotification(profile.phone, whatsappMsg, 'whatsapp', supabaseUrl, supabaseKey);
        }
        if (profile.phone && profile.notification_sms) {
          await sendNotification(profile.phone, `Rentmaikar: Your weekly payout of ${amountStrings} has been sent to ${payoutMethod}. Thank you!`, 'sms', supabaseUrl, supabaseKey);
        }
        if (profile.email && profile.notification_email) {
          const vehicleRows = completed.map(p => 
            `<tr><td>${p.period_start} – ${p.period_end}</td><td>${getCurrencySymbol(p.currency)}${p.amount.toLocaleString()}</td></tr>`
          ).join('');

          await sendEmail(profile.email, `💰 Weekly Payout Sent – ${amountStrings}`,
            `<h2>Payout Confirmation</h2>
            <p>Hi ${firstName},</p>
            <p>Your weekly payout of <strong>${amountStrings}</strong> has been sent to <strong>${payoutMethod}</strong>.</p>
            <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%">
              <thead><tr><th>Period</th><th>Amount</th></tr></thead>
              <tbody>${vehicleRows}</tbody>
            </table>
            <p>Funds typically arrive within 1-2 business days.</p>
            <p>Thank you for partnering with Rentmaikar!</p>`
          );
        }

        // Mark as notified
        for (const p of completed) {
          await supabase.from('owner_earnings').update({ notification_sent: true }).eq('id', p.id);
        }
        results.successNotified++;
      }

      // Notify pending payouts
      if (pending.length > 0) {
        const totalByCurrency: Record<string, number> = {};
        for (const p of pending) {
          totalByCurrency[p.currency] = (totalByCurrency[p.currency] || 0) + p.amount;
        }

        const amountStrings = Object.entries(totalByCurrency)
          .map(([curr, amt]) => `${getCurrencySymbol(curr)}${amt.toLocaleString()}`)
          .join(' + ');

        const pendingMsg = `⏳ Payout Processing – Rentmaikar\n\nHi ${firstName}, your weekly payout of ${amountStrings} is being processed.\n\nYou'll receive it within 24 hours. Thank you for your patience!`;

        if (profile.phone && profile.notification_whatsapp) {
          await sendNotification(profile.phone, pendingMsg, 'whatsapp', supabaseUrl, supabaseKey);
        }
        if (profile.phone && profile.notification_sms) {
          await sendNotification(profile.phone, `Rentmaikar: Your payout of ${amountStrings} is being processed. You'll receive it within 24 hours.`, 'sms', supabaseUrl, supabaseKey);
        }
        if (profile.email && profile.notification_email) {
          await sendEmail(profile.email, `⏳ Payout Processing – ${amountStrings}`,
            `<h2>Payout In Progress</h2>
            <p>Hi ${firstName},</p>
            <p>Your weekly payout of <strong>${amountStrings}</strong> is currently being processed.</p>
            <p>You'll receive it within 24 hours. Thank you for your patience!</p>`
          );
        }

        for (const p of pending) {
          await supabase.from('owner_earnings').update({ notification_sent: true }).eq('id', p.id);
        }
        results.pendingNotified++;
      }
    }

    console.log("[OwnerPayouts] Complete:", results);

    return new Response(JSON.stringify({ success: true, results, timestamp: new Date().toISOString() }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
  } catch (error: any) {
    console.error("[OwnerPayouts Error]", error);
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
  }
};

serve(handler);
