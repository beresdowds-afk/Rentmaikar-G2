import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireCronSecret } from "../_shared/cron-auth.ts";
import { resendSendEmail } from "../_shared/resend-gateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
      body: JSON.stringify({ phone, channel, notificationType: 'general', customMessage: message }),
    });
    const result = await response.json();
    return result.success === true;
  } catch (error) {
    console.error(`[InspectionReminders] Failed to send ${channel}:`, error);
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

    console.log("[InspectionReminders] Starting 30-day inspection reminder batch (agreement-conditional)...");

    const today = new Date();
    const sevenDaysOut = new Date(today);
    sevenDaysOut.setDate(today.getDate() + 7);

    // ─── Find active compulsory agreements expiring in exactly 7 days ───
    // Inspection reports are tied to the agreement renewal cycle (30 days).
    // We notify drivers & owners 7 days before their agreement (= inspection period) expires.
    const sevenDayStart = new Date(sevenDaysOut);
    sevenDayStart.setHours(0, 0, 0, 0);
    const sevenDayEnd = new Date(sevenDaysOut);
    sevenDayEnd.setHours(23, 59, 59, 999);

    const { data: agreements, error: agErr } = await supabase
      .from("legal_agreements")
      .select("id, driver_id, owner_id, vehicle_id, expires_at, renewal_count")
      .in("status", ["active", "pending_signatures"])
      .eq("is_compulsory", true)
      .gte("expires_at", sevenDayStart.toISOString())
      .lte("expires_at", sevenDayEnd.toISOString());

    if (agErr) throw new Error(`Failed to fetch agreements: ${agErr.message}`);

    console.log(`[InspectionReminders] Found ${agreements?.length || 0} agreements due in 7 days`);

    const results = { notified: 0, skipped_no_report: 0, errors: [] as string[] };

    for (const agreement of agreements ?? []) {
      try {
        if (!agreement.vehicle_id) continue;

        // ─── Dedup: skip if already sent a 7-day inspection reminder for this agreement period ───
        const { data: existing } = await supabase
          .from("expiry_notifications")
          .select("id")
          .eq("vehicle_id", agreement.vehicle_id)
          .eq("notification_type", "inspection_30day")
          .eq("recipient_id", agreement.driver_id)
          .gte("created_at", new Date(today.getTime() - 2 * 86400000).toISOString()) // within last 2 days
          .maybeSingle();

        if (existing) {
          results.skipped_no_report++;
          continue;
        }

        // ─── Check if driver has submitted their inspection report for this 30-day period ───
        const periodStart = new Date(agreement.expires_at);
        periodStart.setDate(periodStart.getDate() - 30);

        const { data: existingReport } = await supabase
          .from("weekly_inspection_reports")
          .select("id, submitted_at, status")
          .eq("vehicle_id", agreement.vehicle_id)
          .eq("driver_id", agreement.driver_id)
          .gte("week_start_date", periodStart.toISOString().split("T")[0])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const reportSubmitted = !!existingReport?.submitted_at;

        // ─── Fetch profiles ───
        const [{ data: driverProfile }, { data: ownerProfile }, { data: vehicle }] = await Promise.all([
          supabase.from("profiles").select("full_name, phone, email, notification_sms, notification_whatsapp, notification_email").eq("user_id", agreement.driver_id).single(),
          supabase.from("profiles").select("full_name, email").eq("user_id", agreement.owner_id).single(),
          supabase.from("vehicles").select("make, model, year, license_plate").eq("id", agreement.vehicle_id).single(),
        ]);

        if (!driverProfile) continue;

        const driverName = driverProfile.full_name?.split(" ")[0] || "Driver";
        const ownerName = ownerProfile?.full_name || "Owner";
        const vehicleName = vehicle ? `${vehicle.year || ""} ${vehicle.make || ""} ${vehicle.model || ""}`.trim() : "your vehicle";
        const plate = vehicle?.license_plate || "";
        const expiryFormatted = new Date(agreement.expires_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
        const renewalNum = (agreement.renewal_count ?? 0) + 1;

        // ─── Build messages ───
        const statusNote = reportSubmitted
          ? "✅ Your inspection report has been submitted for this period."
          : "⚠️ Your 30-day vehicle inspection report is still PENDING. Please submit it before your agreement renews.";

        const smsMessage = `Rentmaikar: Hi ${driverName}, your rental agreement for ${vehicleName} (${plate}) renews in 7 days (${expiryFormatted}). ${reportSubmitted ? "Inspection submitted ✓" : "ACTION REQUIRED: Submit your 30-day vehicle inspection report before renewal."}`;

        const whatsappMessage = `📋 *Rentmaikar – Agreement Renewal in 7 Days*\n\nHi ${driverName}, your rental agreement for *${vehicleName} (${plate})* is renewing in 7 days on *${expiryFormatted}* (Renewal #${renewalNum}).\n\n${statusNote}\n\nLog in to your dashboard to complete your inspection report and sign the renewal agreement.\n\nReply *HELP* for assistance.`;

        const emailHtml = `
<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
<div style="background:#1a1a2e;padding:25px;border-radius:10px 10px 0 0;text-align:center;">
  <h1 style="color:#fff;margin:0;">RentMaiKar</h1>
  <p style="color:#a0a0a0;margin:8px 0 0 0;">30-Day Inspection & Renewal Notice</p>
</div>
<div style="background:#fff;padding:25px;border:1px solid #e0e0e0;border-top:none;">
  <div style="background:#fef3c715;border-left:4px solid #f59e0b;padding:15px;margin-bottom:20px;border-radius:4px;">
    <strong style="color:#d97706;">⏰ Agreement Renewing in 7 Days</strong>
    <p style="margin:5px 0 0 0;color:#555;">Your compulsory 30-day rental agreement expires on <strong>${expiryFormatted}</strong>.</p>
  </div>
  <p>Hi ${driverName},</p>
  <p>Your rental agreement for <strong>${vehicleName} (${plate})</strong> is due for <strong>Renewal #${renewalNum}</strong> in 7 days.</p>
  
  <div style="background:#f5f5f5;padding:15px;border-radius:5px;margin:20px 0;">
    <p style="margin:0;font-size:14px;"><strong>30-Day Inspection Report Status:</strong></p>
    ${reportSubmitted
      ? `<p style="margin:8px 0 0 0;color:#16a34a;font-weight:bold;">✅ Submitted — You're all set for renewal.</p>`
      : `<p style="margin:8px 0 0 0;color:#dc2626;font-weight:bold;">❌ Not Submitted — Action Required</p>
         <p style="margin:5px 0 0 0;font-size:13px;color:#555;">You must submit your 30-day vehicle inspection report (10 photos) before your agreement renews. Failure to do so may result in service interruption.</p>`
    }
  </div>

  <p style="color:#555;">Please also ensure you are ready to <strong>sign the renewal agreement</strong> once it is auto-generated on the renewal date.</p>
  
  <div style="background:#eff6ff;border-left:4px solid #3b82f6;padding:12px;border-radius:4px;margin:20px 0;font-size:13px;">
    <strong>CC: ${ownerName}</strong> — Your owner has also been notified of the upcoming renewal.
  </div>

  <div style="text-align:center;margin-top:25px;">
    <a href="https://rentmaikar.lovable.app/driver" style="background:#1a1a2e;color:#fff;padding:12px 28px;text-decoration:none;border-radius:5px;font-weight:bold;">Go to Dashboard</a>
  </div>
</div>
<div style="background:#f9f9f9;padding:15px;text-align:center;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;">
  <p style="margin:0;color:#999;font-size:12px;">Automated notice from RentMaiKar • support@rentmaikar.com</p>
</div>
</body></html>`;

        // ─── Send notifications to driver ───
        if (driverProfile.phone && driverProfile.notification_whatsapp) {
          await sendNotification(driverProfile.phone, whatsappMessage, "whatsapp", supabaseUrl, supabaseKey);
        }
        if (driverProfile.phone && driverProfile.notification_sms) {
          await sendNotification(driverProfile.phone, smsMessage, "sms", supabaseUrl, supabaseKey);
        }
        if (driverProfile.email && driverProfile.notification_email) {
          await sendEmail(
            driverProfile.email,
            `📋 Action Required: Agreement Renewal #${renewalNum} in 7 Days – ${vehicleName}`,
            emailHtml
          );
        }

        // ─── Also notify owner via email ───
        if (ownerProfile?.email) {
          const ownerEmailHtml = emailHtml.replace(
            `Hi ${driverName},`,
            `Hi ${ownerName},<br><br>This is a courtesy notice regarding your driver <strong>${driverProfile.full_name || driverName}</strong>.`
          );
          await sendEmail(
            ownerProfile.email,
            `📋 Driver Renewal Notice: ${vehicleName} – Agreement in 7 Days`,
            ownerEmailHtml
          );
        }

        // ─── Log notification ───
        await supabase.from("expiry_notifications").insert({
          vehicle_id: agreement.vehicle_id,
          notification_type: "inspection_30day",
          recipient_type: "driver",
          recipient_id: agreement.driver_id,
          days_until_expiry: 7,
          notification_channel: "multi",
        });

        results.notified++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        results.errors.push(`Agreement ${agreement.id}: ${msg}`);
        console.error(`[InspectionReminders] Error for agreement ${agreement.id}:`, msg);
      }
    }

    console.log("[InspectionReminders] Complete:", results);

    return new Response(
      JSON.stringify({ success: true, results, timestamp: new Date().toISOString() }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[InspectionReminders Error]", msg);
    return new Response(JSON.stringify({ error: msg }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
  }
};

serve(handler);
