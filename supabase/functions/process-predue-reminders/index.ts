import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { 
  paymentReminder72hMessage,
  paymentReminder60hMessage,
  paymentReminder48hMessage,
  paymentReminder36hMessage,
  paymentReminder24hMessage,
  paymentReminder12hMessage,
  paymentSuccessMessage,
} from "../_shared/whatsapp-templates.ts";
import { 
  paymentReminderEmail 
} from "../_shared/email-templates.ts";
import { requireCronSecret } from "../_shared/cron-auth.ts";
import { isOptedOut } from "../_shared/opt-out.ts";
import { resendSendEmail } from "../_shared/resend-gateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Pre-due reminder intervals for weekly plans (in hours before due date)
const WEEKLY_REMINDER_HOURS = [72, 60, 48, 36, 24, 12];

interface RentalPayment {
  id: string;
  driver_id: string;
  vehicle_id: string;
  amount_due: number;
  currency: string;
  due_date: string;
  payment_status: string;
  reminders_sent: number;
  last_reminder_at: string | null;
}

interface DriverProfile {
  user_id: string;
  full_name: string;
  email: string;
  phone: string;
  notification_email: boolean;
  notification_whatsapp: boolean;
}

const sendWhatsAppMessage = async (to: string, message: string) => {
  if (await isOptedOut(to, "whatsapp")) {
    console.log(`[opt-out] Suppressed WhatsApp to ${to}`);
    return null;
  }

  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const fromNumber = Deno.env.get("TWILIO_PHONE_NUMBER");

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


  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Twilio error: ${error}`);
      return null;
    }

    return response.json();
  } catch (error) {
    console.error("WhatsApp send error:", error);
    return null;
  }
};

const sendEmail = async (to: string, subject: string, html: string) => {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    console.error("RESEND_API_KEY not configured");
    return null;
  }

  try {
    const response = await resendSendEmail({
        from: "Rentmaikar <noreply@rentmaikar.com>",
        to: [to],
        subject,
        html,
      }, resendApiKey);

    if (!response.ok) {
      const error = await response.text();
      console.error(`Resend error: ${error}`);
      return null;
    }

    return response.json();
  } catch (error) {
    console.error("Email send error:", error);
    return null;
  }
};

const getHoursUntilDue = (dueDate: string): number => {
  const now = new Date();
  const due = new Date(dueDate);
  const diffMs = due.getTime() - now.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60));
};

const getReminderMessage = (hoursRemaining: number, data: {
  firstName: string;
  vehicleName: string;
  amount: number;
  currency: 'USD' | 'NGN';
  dueDate: string;
}): string | null => {
  if (hoursRemaining >= 70 && hoursRemaining <= 74) {
    return paymentReminder72hMessage(data);
  } else if (hoursRemaining >= 58 && hoursRemaining <= 62) {
    return paymentReminder60hMessage({ ...data });
  } else if (hoursRemaining >= 46 && hoursRemaining <= 50) {
    return paymentReminder48hMessage(data);
  } else if (hoursRemaining >= 34 && hoursRemaining <= 38) {
    return paymentReminder36hMessage();
  } else if (hoursRemaining >= 22 && hoursRemaining <= 26) {
    return paymentReminder24hMessage({ ...data });
  } else if (hoursRemaining >= 10 && hoursRemaining <= 14) {
    return paymentReminder12hMessage(data);
  }
  return null;
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const cronDenied = requireCronSecret(req);
  if (cronDenied) return cronDenied;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("[Pre-Due Reminders] Starting processing...");

    // Get all active weekly rentals with upcoming payments
    // We need to query price_negotiations for active rentals
    const { data: activeNegotiations, error: negError } = await supabase
      .from("price_negotiations")
      .select("*")
      .eq("status", "approved")
      .not("final_daily_rate", "is", null);

    if (negError) {
      throw new Error(`Failed to fetch negotiations: ${negError.message}`);
    }

    console.log(`[Pre-Due Reminders] Found ${activeNegotiations?.length || 0} active rentals`);

    let remindersSent = 0;
    let remindersCancelled = 0;

    for (const negotiation of activeNegotiations || []) {
      // Get driver profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", negotiation.driver_id)
        .single();

      if (!profile) continue;

      // Check if there's an active payment default (meaning they already missed payment)
      const { data: activeDefault } = await supabase
        .from("payment_defaults")
        .select("id")
        .eq("driver_id", negotiation.driver_id)
        .eq("status", "active")
        .single();

      // If there's an active default, skip pre-due reminders (overdue flow handles it)
      if (activeDefault) {
        console.log(`[Pre-Due Reminders] Skipping ${profile.full_name} - has active default`);
        continue;
      }

      // Calculate next payment due (assume weekly from approval date)
      const approvedAt = new Date(negotiation.approved_at || negotiation.created_at);
      const now = new Date();
      
      // Find the next weekly payment date
      let nextDueDate = new Date(approvedAt);
      while (nextDueDate <= now) {
        nextDueDate.setDate(nextDueDate.getDate() + 7);
      }

      const hoursUntilDue = getHoursUntilDue(nextDueDate.toISOString());

      // Only process if within reminder window (72 hours or less)
      if (hoursUntilDue > 74 || hoursUntilDue < 0) {
        continue;
      }

      const vehicleName = `${negotiation.vehicle_make || ''} ${negotiation.vehicle_model || ''}`.trim() || 'Vehicle';
      const weeklyRate = (negotiation.final_daily_rate || 0) * 7;

      // Get the appropriate reminder message
      const whatsappMessage = getReminderMessage(hoursUntilDue, {
        firstName: profile.full_name?.split(' ')[0] || 'Driver',
        vehicleName,
        amount: weeklyRate,
        currency: negotiation.currency as 'USD' | 'NGN',
        dueDate: nextDueDate.toLocaleDateString(),
      });

      if (!whatsappMessage) {
        continue; // Not in a reminder window
      }

      // Send WhatsApp if enabled
      if (profile.notification_whatsapp && profile.phone) {
        await sendWhatsAppMessage(profile.phone, whatsappMessage);
        console.log(`[Pre-Due Reminders] Sent WhatsApp to ${profile.phone} (${hoursUntilDue}h before due)`);
        remindersSent++;
      }

      // Send email if enabled
      if (profile.notification_email && profile.email) {
        const baseUrl = Deno.env.get("SUPABASE_URL")?.replace('.supabase.co', '.lovable.app') || 
                        "https://rentmaikar.lovable.app";
        const emailData = paymentReminderEmail({
          firstName: profile.full_name?.split(' ')[0] || 'Driver',
          amount: weeklyRate,
          currency: negotiation.currency as 'USD' | 'NGN',
          dueDate: nextDueDate.toLocaleDateString(),
          hoursRemaining: hoursUntilDue,
          vehicleName,
          paymentUrl: `${baseUrl}/driver/dashboard?tab=payments`,
        });
        
        await sendEmail(profile.email, emailData.subject, emailData.html);
        console.log(`[Pre-Due Reminders] Sent email to ${profile.email}`);
        remindersSent++;
      }
    }

    console.log(`[Pre-Due Reminders] Complete. Sent: ${remindersSent}, Cancelled: ${remindersCancelled}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        remindersSent,
        remindersCancelled,
        timestamp: new Date().toISOString()
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("[Pre-Due Reminders Error]", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
