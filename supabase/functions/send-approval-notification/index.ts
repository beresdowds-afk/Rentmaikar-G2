import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { requireServiceRole } from "../_shared/auth-guards.ts";
import { resendSendEmail } from "../_shared/resend-gateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ApprovalNotificationRequest {
  email: string;
  name: string;
  userType: "driver" | "owner";
  region: "USA" | "NIGERIA";
}

// Validation helpers
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return typeof email === 'string' && 
         email.length > 0 && 
         email.length <= 255 && 
         emailRegex.test(email);
};

const isValidName = (name: string): boolean => {
  return typeof name === 'string' && 
         name.trim().length >= 2 && 
         name.length <= 100;
};

const isValidUserType = (userType: string): userType is "driver" | "owner" => {
  return userType === "driver" || userType === "owner";
};

const isValidRegion = (region: string): region is "USA" | "NIGERIA" => {
  return region === "USA" || region === "NIGERIA";
};

const sanitizeString = (input: string): string => {
  // Remove any HTML tags and trim whitespace
  return input.replace(/<[^>]*>/g, '').trim();
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const _authError = requireServiceRole(req);
  if (_authError) return _authError;


  try {
    const body = await req.json();
    
    // Extract and validate all fields
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const name = typeof body.name === 'string' ? sanitizeString(body.name) : '';
    const userType = typeof body.userType === 'string' ? body.userType : '';
    const region = typeof body.region === 'string' ? body.region : '';

    // Validate email
    if (!isValidEmail(email)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid email address" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate name
    if (!isValidName(name)) {
      return new Response(
        JSON.stringify({ success: false, error: "Name must be between 2 and 100 characters" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate userType
    if (!isValidUserType(userType)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid user type. Must be 'driver' or 'owner'" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate region
    if (!isValidRegion(region)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid region. Must be 'USA' or 'NIGERIA'" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    // Get the app URL
    const appUrl = Deno.env.get("SUPABASE_URL")?.replace('.supabase.co', '.lovable.app') || 
                   "https://id-preview--4011c747-3d97-471e-9350-01af2636bf43.lovable.app";
    
    const dashboardPath = userType === "driver" ? "/driver/dashboard" : "/owner/dashboard";
    const dashboardUrl = `${appUrl}${dashboardPath}`;
    const dashboardName = userType === "driver" ? "Driver Dashboard" : "Owner Dashboard";
    
    // Sanitize name for use in HTML (escape special characters)
    const escapedName = name
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    const emailHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account Approved - Rentmaikar</title>
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
    .success-badge {
      display: inline-block;
      background: #10b981;
      color: white;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 14px;
      margin: 20px 0;
    }
    h1 {
      color: #1e293b;
      font-size: 24px;
      margin-bottom: 20px;
    }
    .dashboard-link {
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
    .dashboard-link:hover {
      background: linear-gradient(135deg, #1d4ed8, #2563eb);
    }
    .url-box {
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px;
      word-break: break-all;
      font-family: monospace;
      font-size: 13px;
      color: #475569;
      margin: 16px 0;
    }
    .tutorial-section {
      background: #f8fafc;
      border-radius: 12px;
      padding: 24px;
      margin: 30px 0;
    }
    .tutorial-section h2 {
      color: #1e293b;
      font-size: 18px;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .device-section {
      margin: 20px 0;
      padding: 16px;
      background: white;
      border-radius: 8px;
      border-left: 4px solid #2563eb;
    }
    .device-section h3 {
      color: #2563eb;
      font-size: 15px;
      margin-bottom: 12px;
    }
    .device-section ol {
      margin: 0;
      padding-left: 20px;
    }
    .device-section li {
      margin: 8px 0;
      color: #475569;
    }
    .tip {
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 12px 16px;
      border-radius: 0 8px 8px 0;
      margin: 16px 0;
      font-size: 14px;
    }
    .footer {
      text-align: center;
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #e2e8f0;
      color: #64748b;
      font-size: 13px;
    }
    .contact-info {
      background: #eff6ff;
      border-radius: 8px;
      padding: 16px;
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">🚗 Rentmaikar</div>
      <div class="success-badge">✓ Account Approved</div>
    </div>

    <h1>Congratulations, ${escapedName}!</h1>
    
    <p>Great news! Your <strong>${userType}</strong> account has been approved by our admin team. You now have full access to your personalized dashboard.</p>

    <a href="${dashboardUrl}" class="dashboard-link">
      Access Your ${dashboardName} →
    </a>

    <p style="font-size: 14px; color: #64748b;">Or copy this link:</p>
    <div class="url-box">${dashboardUrl}</div>

    <div class="tutorial-section">
      <h2>📌 Save Your Dashboard for Quick Access</h2>
      <p style="color: #64748b; font-size: 14px;">Follow these simple steps to pin your dashboard to your device for instant access:</p>

      <div class="device-section">
        <h3>📱 iPhone / iPad (Safari)</h3>
        <ol>
          <li>Open the dashboard link in <strong>Safari</strong></li>
          <li>Tap the <strong>Share button</strong> (square with arrow) at the bottom</li>
          <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
          <li>Give it a name (e.g., "My Dashboard") and tap <strong>Add</strong></li>
          <li>Find the icon on your home screen for instant access!</li>
        </ol>
      </div>

      <div class="device-section">
        <h3>🤖 Android (Chrome)</h3>
        <ol>
          <li>Open the dashboard link in <strong>Chrome</strong></li>
          <li>Tap the <strong>three dots menu</strong> (⋮) in the top right</li>
          <li>Tap <strong>"Add to Home screen"</strong> or <strong>"Install app"</strong></li>
          <li>Confirm by tapping <strong>Add</strong></li>
          <li>The dashboard icon will appear on your home screen!</li>
        </ol>
      </div>

      <div class="device-section">
        <h3>💻 Desktop (Chrome / Edge / Firefox)</h3>
        <ol>
          <li>Open the dashboard link in your browser</li>
          <li><strong>Chrome/Edge:</strong> Click the star icon ⭐ in the address bar → Choose "Bookmarks bar"</li>
          <li><strong>Firefox:</strong> Press <strong>Ctrl+D</strong> (Windows) or <strong>Cmd+D</strong> (Mac) to bookmark</li>
          <li><strong>Pro tip:</strong> Drag the tab directly to your bookmarks bar for quick access</li>
        </ol>
      </div>

      <div class="device-section">
        <h3>🍎 Mac (Safari)</h3>
        <ol>
          <li>Open the dashboard link in Safari</li>
          <li>Click <strong>Bookmarks</strong> menu → <strong>Add Bookmark</strong></li>
          <li>Or press <strong>Cmd+D</strong> to bookmark instantly</li>
          <li>Select <strong>Favorites Bar</strong> for quick access</li>
        </ol>
      </div>

      <div class="tip">
        💡 <strong>Pro Tip:</strong> Adding to your home screen (mobile) creates an app-like experience that opens in full screen without browser controls!
      </div>
    </div>

    <div class="contact-info">
      <strong>Need Help?</strong><br>
      ${region === "NIGERIA" 
        ? "WhatsApp: +234 XXX XXX XXXX<br>Email: support@rentmaikar.ng" 
        : "Phone: +1 XXX XXX XXXX<br>Email: support@rentmaikar.com"}
    </div>

    <p>We're excited to have you on board! If you have any questions, don't hesitate to reach out to our support team.</p>

    <div class="footer">
      <p>© ${new Date().getFullYear()} Rentmaikar. All rights reserved.</p>
      <p>This email was sent because your ${userType} account was approved.</p>
    </div>
  </div>
</body>
</html>
    `;

    // Send email using Resend API directly
    const emailResponse = await resendSendEmail({
        from: "Rentmaikar <onboarding@resend.dev>",
        to: [email],
        subject: `🎉 Welcome to Rentmaikar - Your ${userType.charAt(0).toUpperCase() + userType.slice(1)} Account is Approved!`,
        html: emailHtml,
      }, resendApiKey);

    const responseData = await emailResponse.json();

    if (!emailResponse.ok) {
      console.error("Resend API error:", responseData);
      throw new Error(responseData.message || "Failed to send email");
    }

    return new Response(JSON.stringify({ success: true, data: responseData }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-approval-notification function:", error);
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
