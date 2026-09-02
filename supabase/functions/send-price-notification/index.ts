import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { requireServiceRole } from "../_shared/auth-guards.ts";
import { resendSendEmail } from "../_shared/resend-gateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type NotificationType = "approved" | "rejected" | "counter_offer" | "locked" | "modification_approved" | "modification_rejected";

interface PriceNotificationRequest {
  email: string;
  name: string;
  userType: "driver" | "owner";
  notificationType: NotificationType;
  vehicleInfo: string;
  requestedRate: number;
  finalRate?: number;
  counterOffer?: number;
  adminResponse?: string;
  rejectionReason?: string;
  currency: string;
  dashboardUrl?: string;
}

const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return typeof email === 'string' && 
         email.length > 0 && 
         email.length <= 255 && 
         emailRegex.test(email);
};

const sanitizeString = (input: string): string => {
  return input.replace(/<[^>]*>/g, '').trim();
};

const escapeHtml = (str: string): string => {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const getCurrencySymbol = (currency: string): string => {
  return currency === 'NGN' ? '₦' : '$';
};

const getSubjectLine = (type: NotificationType, userType: string): string => {
  const subjects: Record<NotificationType, string> = {
    approved: `✅ Your Price Request Has Been Approved`,
    rejected: `❌ Update on Your Price Request`,
    counter_offer: `💬 Counter Offer on Your Price Request`,
    locked: `🔒 Your Rental Rate Has Been Locked`,
    modification_approved: `✅ Your Rate Modification Request Approved`,
    modification_rejected: `❌ Rate Modification Request Update`,
  };
  return subjects[type];
};

const getEmailContent = (data: PriceNotificationRequest): string => {
  const { 
    name, 
    userType, 
    notificationType, 
    vehicleInfo, 
    requestedRate, 
    finalRate, 
    counterOffer,
    adminResponse, 
    rejectionReason, 
    currency,
    dashboardUrl 
  } = data;
  
  const escapedName = escapeHtml(sanitizeString(name));
  const escapedVehicle = escapeHtml(sanitizeString(vehicleInfo));
  const escapedResponse = adminResponse ? escapeHtml(sanitizeString(adminResponse)) : '';
  const escapedRejection = rejectionReason ? escapeHtml(sanitizeString(rejectionReason)) : '';
  const sym = getCurrencySymbol(currency);
  const rateLabel = userType === 'owner' ? 'week' : 'day';
  
  const dashboardPath = userType === "driver" ? "/driver/dashboard" : "/owner/dashboard";
  const finalDashboardUrl = dashboardUrl || `https://id-preview--4011c747-3d97-471e-9350-01af2636bf43.lovable.app${dashboardPath}`;
  
  let statusBadge = '';
  let mainContent = '';
  let actionSection = '';
  
  switch (notificationType) {
    case 'approved':
      statusBadge = '<div class="status-badge approved">✓ Approved</div>';
      mainContent = `
        <p>Great news! Your price request for <strong>${escapedVehicle}</strong> has been approved.</p>
        <div class="rate-box">
          <div class="rate-item">
            <span class="rate-label">Your Request</span>
            <span class="rate-value">${sym}${requestedRate}/${rateLabel}</span>
          </div>
          <div class="rate-item highlight">
            <span class="rate-label">Approved Rate</span>
            <span class="rate-value">${sym}${finalRate || requestedRate}/${rateLabel}</span>
          </div>
        </div>
        ${escapedResponse ? `<div class="admin-message"><strong>Admin Note:</strong> ${escapedResponse}</div>` : ''}
      `;
      actionSection = `<a href="${finalDashboardUrl}" class="cta-button">View Your Dashboard →</a>`;
      break;
      
    case 'locked':
      statusBadge = '<div class="status-badge locked">🔒 Locked</div>';
      mainContent = `
        <p>Your rental rate for <strong>${escapedVehicle}</strong> has been approved and locked.</p>
        <div class="rate-box">
          <div class="rate-item highlight">
            <span class="rate-label">Locked Rate</span>
            <span class="rate-value">${sym}${finalRate || requestedRate}/${rateLabel}</span>
          </div>
        </div>
        <p class="info-text">🔒 This rate is now locked. If you need to modify it in the future, you can submit a modification request through your dashboard.</p>
        ${escapedResponse ? `<div class="admin-message"><strong>Admin Note:</strong> ${escapedResponse}</div>` : ''}
      `;
      actionSection = `<a href="${finalDashboardUrl}" class="cta-button">View Your Dashboard →</a>`;
      break;
      
    case 'counter_offer':
      statusBadge = '<div class="status-badge counter">💬 Counter Offer</div>';
      mainContent = `
        <p>The admin has sent a counter offer for your price request on <strong>${escapedVehicle}</strong>.</p>
        <div class="rate-box">
          <div class="rate-item">
            <span class="rate-label">Your Request</span>
            <span class="rate-value">${sym}${requestedRate}/${rateLabel}</span>
          </div>
          <div class="rate-item highlight counter">
            <span class="rate-label">Counter Offer</span>
            <span class="rate-value">${sym}${counterOffer}/${rateLabel}</span>
          </div>
        </div>
        ${escapedResponse ? `<div class="admin-message"><strong>Admin Message:</strong> ${escapedResponse}</div>` : ''}
        <p class="action-text">Please log in to your dashboard to <strong>accept</strong> or <strong>submit a new request</strong>.</p>
      `;
      actionSection = `<a href="${finalDashboardUrl}" class="cta-button">Respond to Counter Offer →</a>`;
      break;
      
    case 'rejected':
      statusBadge = '<div class="status-badge rejected">✗ Not Approved</div>';
      mainContent = `
        <p>Unfortunately, your price request for <strong>${escapedVehicle}</strong> was not approved at this time.</p>
        <div class="rate-box">
          <div class="rate-item">
            <span class="rate-label">Requested Rate</span>
            <span class="rate-value">${sym}${requestedRate}/${rateLabel}</span>
          </div>
        </div>
        ${escapedRejection ? `<div class="admin-message rejection"><strong>Reason:</strong> ${escapedRejection}</div>` : ''}
        <p class="info-text">You can submit a new price request with an adjusted rate through your dashboard.</p>
      `;
      actionSection = `<a href="${finalDashboardUrl}" class="cta-button">Submit New Request →</a>`;
      break;
      
    case 'modification_approved':
      statusBadge = '<div class="status-badge approved">✓ Modification Approved</div>';
      mainContent = `
        <p>Your rate modification request for <strong>${escapedVehicle}</strong> has been approved!</p>
        <div class="rate-box">
          <div class="rate-item">
            <span class="rate-label">Previous Rate</span>
            <span class="rate-value">${sym}${requestedRate}/${rateLabel}</span>
          </div>
          <div class="rate-item highlight">
            <span class="rate-label">New Rate</span>
            <span class="rate-value">${sym}${finalRate}/${rateLabel}</span>
          </div>
        </div>
        ${escapedResponse ? `<div class="admin-message"><strong>Admin Note:</strong> ${escapedResponse}</div>` : ''}
      `;
      actionSection = `<a href="${finalDashboardUrl}" class="cta-button">View Your Dashboard →</a>`;
      break;
      
    case 'modification_rejected':
      statusBadge = '<div class="status-badge rejected">✗ Modification Not Approved</div>';
      mainContent = `
        <p>Your rate modification request for <strong>${escapedVehicle}</strong> was not approved.</p>
        <div class="rate-box">
          <div class="rate-item">
            <span class="rate-label">Current Rate (Unchanged)</span>
            <span class="rate-value">${sym}${requestedRate}/${rateLabel}</span>
          </div>
        </div>
        ${escapedRejection ? `<div class="admin-message rejection"><strong>Reason:</strong> ${escapedRejection}</div>` : ''}
      `;
      actionSection = `<a href="${finalDashboardUrl}" class="cta-button">View Your Dashboard →</a>`;
      break;
  }

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Price Negotiation Update - Rentmaikar</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
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
      padding: 40px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .logo {
      font-size: 28px;
      font-weight: bold;
      color: #2563eb;
    }
    .status-badge {
      display: inline-block;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 600;
      margin: 20px 0;
    }
    .status-badge.approved { background: #dcfce7; color: #166534; }
    .status-badge.rejected { background: #fee2e2; color: #991b1b; }
    .status-badge.counter { background: #dbeafe; color: #1e40af; }
    .status-badge.locked { background: #f3e8ff; color: #7c3aed; }
    h1 {
      color: #1e293b;
      font-size: 22px;
      margin-bottom: 20px;
    }
    .rate-box {
      background: #f8fafc;
      border-radius: 12px;
      padding: 20px;
      margin: 24px 0;
    }
    .rate-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 0;
      border-bottom: 1px solid #e2e8f0;
    }
    .rate-item:last-child { border-bottom: none; }
    .rate-item.highlight { background: #eff6ff; margin: 8px -12px; padding: 12px; border-radius: 8px; border: none; }
    .rate-item.highlight.counter { background: #dbeafe; }
    .rate-label { color: #64748b; font-size: 14px; }
    .rate-value { font-size: 20px; font-weight: 700; color: #1e293b; }
    .rate-item.highlight .rate-value { color: #2563eb; }
    .admin-message {
      background: #f0f9ff;
      border-left: 4px solid #2563eb;
      padding: 16px;
      border-radius: 0 8px 8px 0;
      margin: 20px 0;
      font-size: 14px;
    }
    .admin-message.rejection {
      background: #fef2f2;
      border-left-color: #ef4444;
    }
    .cta-button {
      display: block;
      background: linear-gradient(135deg, #2563eb, #3b82f6);
      color: white !important;
      text-decoration: none;
      padding: 16px 32px;
      border-radius: 8px;
      text-align: center;
      font-weight: 600;
      font-size: 16px;
      margin: 24px 0;
    }
    .info-text {
      color: #64748b;
      font-size: 14px;
      padding: 12px;
      background: #f8fafc;
      border-radius: 8px;
    }
    .action-text {
      color: #1e293b;
      font-weight: 500;
    }
    .footer {
      text-align: center;
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #e2e8f0;
      color: #64748b;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">🚗 Rentmaikar</div>
      ${statusBadge}
    </div>

    <h1>Hello, ${escapedName}!</h1>
    
    ${mainContent}
    
    ${actionSection}

    <div class="footer">
      <p>© ${new Date().getFullYear()} Rentmaikar. All rights reserved.</p>
      <p>This email was sent regarding your ${userType} price negotiation.</p>
    </div>
  </div>
</body>
</html>
  `;
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const _authError = requireServiceRole(req);
  if (_authError) return _authError;


  try {
    const body: PriceNotificationRequest = await req.json();
    
    // Validate email
    if (!isValidEmail(body.email)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid email address" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const emailHtml = getEmailContent(body);
    const subject = getSubjectLine(body.notificationType, body.userType);

    console.log(`Sending ${body.notificationType} notification to ${body.email}`);

    const emailResponse = await resendSendEmail({
        from: "Rentmaikar <onboarding@resend.dev>",
        to: [body.email],
        subject: subject,
        html: emailHtml,
      }, resendApiKey);

    const responseData = await emailResponse.json();

    if (!emailResponse.ok) {
      console.error("Resend API error:", responseData);
      throw new Error(responseData.message || "Failed to send email");
    }

    console.log("Email sent successfully:", responseData);

    return new Response(JSON.stringify({ success: true, data: responseData }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-price-notification function:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
