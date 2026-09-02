import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { requireServiceRole } from "../_shared/auth-guards.ts";
import { resendSendEmail } from "../_shared/resend-gateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation schema
const orderNotificationSchema = z.object({
  orderId: z.string().uuid("Invalid order ID format"),
  ownerEmail: z.string().email("Invalid email format").max(255),
  ownerPhone: z.string().max(20).optional(),
  devicePrice: z.number().positive("Price must be positive"),
  currency: z.enum(["USD", "NGN", "GBP", "EUR"]),
  shippingAddress: z.string().min(1).max(500, "Address too long"),
  paymentMethod: z.string().min(1).max(50),
});

// HTML escape function to prevent XSS in emails
const escapeHtml = (str: string): string => {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return str.replace(/[&<>"']/g, (char) => htmlEntities[char] || char);
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const _authError = requireServiceRole(req);
  if (_authError) return _authError;


  try {
    // Parse and validate request body
    const rawBody = await req.json();
    const parseResult = orderNotificationSchema.safeParse(rawBody);
    
    if (!parseResult.success) {
      console.error("Validation failed:", parseResult.error.errors);
      return new Response(
        JSON.stringify({ 
          error: "Invalid request data",
          details: parseResult.error.errors.map(e => e.message)
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { orderId, ownerEmail, ownerPhone, devicePrice, currency, shippingAddress, paymentMethod } = parseResult.data;

    console.log("Sending order notification to admin for order:", orderId);

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const formattedPrice = currency === 'NGN' ? `₦${devicePrice.toLocaleString()}` : `$${devicePrice.toFixed(2)}`;

    // Escape user-provided content to prevent XSS
    const safeOwnerEmail = escapeHtml(ownerEmail);
    const safeOwnerPhone = ownerPhone ? escapeHtml(ownerPhone) : null;
    const safeShippingAddress = escapeHtml(shippingAddress);
    const safePaymentMethod = escapeHtml(paymentMethod);

    // Send email via Resend API
    const emailResponse = await resendSendEmail({
        from: "Rentmaikar <notifications@resend.dev>",
        to: ["admin@rentmaikar.com"],
        subject: `🆕 New IoT Device Order - Payment Verification Required`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #1a1a1a;">New IoT Device Order</h1>
            <p>A new device order has been placed and requires payment verification.</p>
            <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0;">Order Details</h3>
              <p><strong>Order ID:</strong> ${orderId.slice(0, 8)}...</p>
              <p><strong>Owner Email:</strong> ${safeOwnerEmail}</p>
              ${safeOwnerPhone ? `<p><strong>Phone:</strong> ${safeOwnerPhone}</p>` : ''}
              <p><strong>Amount:</strong> <span style="color: #16a34a;">${formattedPrice}</span></p>
              <p><strong>Payment Method:</strong> ${safePaymentMethod === 'bank_transfer' ? 'Bank Transfer' : safePaymentMethod}</p>
              <p><strong>Shipping Address:</strong> ${safeShippingAddress}</p>
            </div>
            <div style="background: #fef3c7; padding: 15px; border-radius: 8px; border-left: 4px solid #f59e0b;">
              <strong>⚠️ Action Required:</strong> Please verify the payment and confirm in the admin dashboard.
            </div>
          </div>
        `,
      }, resendApiKey);

    const emailResult = await emailResponse.json();
    console.log("Email sent:", emailResult);

    return new Response(
      JSON.stringify({ success: true, emailId: emailResult.id }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-order-notification:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);