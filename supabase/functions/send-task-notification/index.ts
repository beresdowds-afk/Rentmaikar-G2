import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { EMAIL_CONFIG, formatSenderEmail } from "../_shared/email-config.ts";
import { requireServiceRole } from "../_shared/auth-guards.ts";
import { isOptedOut } from "../_shared/opt-out.ts";
import { resendSendEmail } from "../_shared/resend-gateway.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface TaskNotificationRequest {
  staffEmail: string;
  staffName: string;
  staffPhone?: string;
  taskTitle: string;
  taskType: string;
  priority: string;
  city: string;
  scheduledDate?: string;
  locationAddress?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const _authError = requireServiceRole(req);
  if (_authError) return _authError;


  try {
    const body: TaskNotificationRequest = await req.json();
    const {
      staffEmail,
      staffName,
      staffPhone,
      taskTitle,
      taskType,
      priority,
      city,
      scheduledDate,
      locationAddress,
    } = body;

    if (!staffEmail || !taskTitle || !taskType) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const priorityColors: Record<string, string> = {
      low: "#6b7280",
      medium: "#3b82f6",
      high: "#f97316",
      urgent: "#ef4444",
    };

    const taskTypeLabels: Record<string, string> = {
      legal: "Legal Support",
      iot_installation: "IoT Installation",
      iot_maintenance: "IoT Maintenance",
      vehicle_recall: "Vehicle Recall",
      vehicle_maintenance: "Vehicle Maintenance",
    };

    const emailHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Task Assignment - Rentmaikar</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      background: white;
      border-radius: 12px;
      padding: 32px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .header {
      text-align: center;
      margin-bottom: 24px;
    }
    .logo {
      font-size: 24px;
      font-weight: bold;
      color: #2563eb;
    }
    .badge {
      display: inline-block;
      background: ${priorityColors[priority] || "#3b82f6"};
      color: white;
      padding: 6px 14px;
      border-radius: 16px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      margin: 16px 0;
    }
    h1 {
      color: #1e293b;
      font-size: 22px;
      margin-bottom: 16px;
    }
    .task-card {
      background: #f8fafc;
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
      border-left: 4px solid #2563eb;
    }
    .task-title {
      font-size: 18px;
      font-weight: 600;
      color: #1e293b;
      margin-bottom: 12px;
    }
    .detail-row {
      display: flex;
      margin: 8px 0;
      font-size: 14px;
    }
    .detail-label {
      color: #64748b;
      width: 120px;
      flex-shrink: 0;
    }
    .detail-value {
      color: #1e293b;
      font-weight: 500;
    }
    .footer {
      text-align: center;
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid #e2e8f0;
      color: #64748b;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">🚗 Rentmaikar Support</div>
      <div class="badge">${priority.toUpperCase()} PRIORITY</div>
    </div>

    <h1>New Task Assigned</h1>
    
    <p>Hello ${staffName || "Team Member"},</p>
    <p>You have been assigned a new support task. Please review the details below:</p>

    <div class="task-card">
      <div class="task-title">${taskTitle}</div>
      <div class="detail-row">
        <span class="detail-label">Type:</span>
        <span class="detail-value">${taskTypeLabels[taskType] || taskType}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">City:</span>
        <span class="detail-value">${city}</span>
      </div>
      ${scheduledDate ? `
      <div class="detail-row">
        <span class="detail-label">Scheduled:</span>
        <span class="detail-value">${scheduledDate}</span>
      </div>
      ` : ""}
      ${locationAddress ? `
      <div class="detail-row">
        <span class="detail-label">Location:</span>
        <span class="detail-value">${locationAddress}</span>
      </div>
      ` : ""}
    </div>

    <p>Please log in to your support dashboard to view full details and update the task status.</p>

    <div class="footer">
      <p>© ${new Date().getFullYear()} Rentmaikar. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `;

    // Send email notification
    const emailResponse = await resendSendEmail({
        from: formatSenderEmail('support'),
        to: [staffEmail],
        subject: `🔔 New ${taskTypeLabels[taskType] || taskType} Task: ${taskTitle}`,
        html: emailHtml,
      }, resendApiKey);

    const emailData = await emailResponse.json();

    if (!emailResponse.ok) {
      console.error("Email send error:", emailData);
      throw new Error(emailData.message || "Failed to send email");
    }

    // Send SMS if phone is provided
    let smsResult = null;
    if (staffPhone && !(await isOptedOut(staffPhone, "sms"))) {
      const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
      const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
      const twilioPhoneNumber = Deno.env.get("TWILIO_PHONE_NUMBER");

      if (twilioAccountSid && twilioAuthToken && twilioPhoneNumber) {
        const smsBody = `Rentmaikar: New ${priority.toUpperCase()} task assigned - "${taskTitle}" in ${city}. Check your dashboard for details.`;

        try {
          const smsResponse = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`,
            {
              method: "POST",
              headers: {
                Authorization: `Basic ${btoa(`${twilioAccountSid}:${twilioAuthToken}`)}`,
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: new URLSearchParams({
                To: staffPhone,
                From: twilioPhoneNumber,
                Body: smsBody,
                StatusCallback: `${Deno.env.get("SUPABASE_URL")}/functions/v1/twilio-webhook`,
              }),

            }
          );

          smsResult = await smsResponse.json();
          console.log("SMS sent:", smsResult.sid);
        } catch (smsError) {
          console.error("SMS send error:", smsError);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        email: emailData,
        sms: smsResult,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-task-notification:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
