import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { EMAIL_CONFIG, formatSenderEmail } from "../_shared/email-config.ts";
import { requireServiceRole } from "../_shared/auth-guards.ts";
import { isOptedOut } from "../_shared/opt-out.ts";
import { twilioMessagingEnabled } from "../_shared/twilio-messaging-guard.ts";
import { resendSendEmail } from "../_shared/resend-gateway.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ShippingNotificationRequest {
  email: string;
  phone?: string;
  trackingNumber: string;
  shippingAddress?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const _authError = requireServiceRole(req);
  if (_authError) return _authError;


  try {
    const { email, phone, trackingNumber, shippingAddress }: ShippingNotificationRequest = await req.json();

    if (!email || !trackingNumber) {
      return new Response(
        JSON.stringify({ error: "Email and tracking number are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Send email via Resend API
    const emailResponse = await resendSendEmail({
        from: formatSenderEmail('noreply'),
        to: [email],
        subject: "Your IoT Device Has Been Shipped! 📦",
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
              .tracking-box { background: white; border: 2px solid #667eea; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; }
              .tracking-number { font-size: 24px; font-weight: bold; color: #667eea; letter-spacing: 2px; }
              .info-section { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }
              .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
              .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin-top: 15px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>📦 Your Device is On Its Way!</h1>
              </div>
              <div class="content">
                <p>Great news! Your IoT tracking device has been shipped and is on its way to you.</p>
                
                <div class="tracking-box">
                  <p style="margin: 0; color: #666;">Tracking Number</p>
                  <p class="tracking-number">${trackingNumber}</p>
                </div>

                ${shippingAddress ? `
                <div class="info-section">
                  <strong>Shipping Address:</strong><br>
                  ${shippingAddress.replace(/\n/g, '<br>')}
                </div>
                ` : ''}

                <div class="info-section">
                  <strong>What's Next?</strong>
                  <ul>
                    <li>Track your package using the tracking number above</li>
                    <li>The device typically arrives within 3-5 business days</li>
                    <li>Once received, confirm delivery in your dashboard</li>
                    <li>Install the device and submit SIM card details</li>
                  </ul>
                </div>

                <p>If you have any questions about your shipment, please don't hesitate to contact our support team.</p>

                <div style="text-align: center;">
                  <a href="https://rentmaikar.com/owner-dashboard" class="button">View Order Status</a>
                </div>
              </div>
              <div class="footer">
                <p>© ${new Date().getFullYear()} Rentmaikar. All rights reserved.</p>
                <p>This is an automated message regarding your IoT device order.</p>
              </div>
            </div>
          </body>
          </html>
        `,
      }, resendApiKey);

    const emailResult = await emailResponse.json();
    console.log("Shipping notification sent:", emailResult);

    // Optionally send SMS via Twilio if phone is provided
    if (phone && !(await isOptedOut(phone, "sms"))) {
      try {
        const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
        const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
        const twilioPhoneNumber = Deno.env.get("TWILIO_PHONE_NUMBER");

        if (twilioMessagingEnabled() && twilioAccountSid && twilioAuthToken && twilioPhoneNumber) {
          const smsMessage = `Rentmaikar: Your IoT tracking device has been shipped! Tracking #: ${trackingNumber}. Check your email for details.`;

          const twilioResponse = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Authorization: `Basic ${btoa(`${twilioAccountSid}:${twilioAuthToken}`)}`,
              },
              body: new URLSearchParams({
                To: phone,
                From: twilioPhoneNumber,
                Body: smsMessage,
                StatusCallback: `${Deno.env.get("SUPABASE_URL")}/functions/v1/twilio-webhook`,
              }),

            }
          );

          if (!twilioResponse.ok) {
            console.error("SMS notification failed:", await twilioResponse.text());
          } else {
            console.log("SMS notification sent successfully");
          }
        }
      } catch (smsError) {
        console.error("SMS notification error:", smsError);
      }
    }

    return new Response(
      JSON.stringify({ success: true, emailId: emailResult.id }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-shipping-notification:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
