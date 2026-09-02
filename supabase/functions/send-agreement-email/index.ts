import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireServiceRole } from "../_shared/auth-guards.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AgreementEmailRequest {
  agreementId: string;
  // Caller-supplied fields below are treated as HINTS ONLY. The authoritative
  // recipient email addresses are looked up from the database via agreementId.
  driverEmail?: string;
  driverName?: string;
  ownerEmail?: string;
  ownerName?: string;
  vehicleInfo?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Internal-only endpoint: require service-role bearer token.
  const authError = requireServiceRole(req);
  if (authError) return authError;

  try {
    const body: AgreementEmailRequest = await req.json();
    const { agreementId, vehicleInfo } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the complete agreement with vehicle details
    const { data: agreement, error: fetchError } = await supabase
      .from("legal_agreements")
      .select("*, vehicle_id")
      .eq("id", agreementId)
      .single();

    if (fetchError || !agreement) {
      throw new Error("Agreement not found");
    }

    // Fetch vehicle pickup details if vehicle_id exists
    let pickupDetails = null;
    if (agreement.vehicle_id) {
      const { data: vehicle } = await supabase
        .from("vehicles")
        .select("pickup_location, pickup_address, pickup_city, pickup_instructions")
        .eq("id", agreement.vehicle_id)
        .single();
      pickupDetails = vehicle;
    }

    // Fetch owner and driver profiles for authoritative contact details.
    // Never trust caller-supplied recipient email addresses.
    const { data: ownerProfile } = await supabase
      .from("profiles")
      .select("phone, email, full_name")
      .eq("user_id", agreement.owner_id)
      .single();

    const { data: driverProfile } = await supabase
      .from("profiles")
      .select("phone, email, full_name")
      .eq("user_id", agreement.driver_id)
      .single();

    const driverEmail = driverProfile?.email;
    const ownerEmail = ownerProfile?.email;
    const driverName = driverProfile?.full_name || body.driverName || "Driver";
    const ownerName = ownerProfile?.full_name || body.ownerName || "Owner";

    if (!driverEmail || !ownerEmail) {
      return new Response(
        JSON.stringify({ error: "Missing recipient email on driver or owner profile" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }


    const agreementDate = new Date(agreement.created_at).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // Build pickup location section for driver email
    const pickupLocationSection = pickupDetails ? `
    <h3 style="color: #1a1a2e; margin-top: 25px;">🚗 Vehicle Pickup Details</h3>
    <div style="background: #e3f2fd; border-left: 4px solid #1976d2; padding: 15px; margin: 15px 0;">
      ${pickupDetails.pickup_location ? `<p style="margin: 5px 0;"><strong>Location:</strong> ${pickupDetails.pickup_location}</p>` : ''}
      ${pickupDetails.pickup_address ? `<p style="margin: 5px 0;"><strong>Address:</strong> ${pickupDetails.pickup_address}</p>` : ''}
      ${pickupDetails.pickup_city ? `<p style="margin: 5px 0;"><strong>City:</strong> ${pickupDetails.pickup_city}</p>` : ''}
      ${pickupDetails.pickup_instructions ? `<p style="margin: 10px 0 0 0;"><strong>Special Instructions:</strong><br/>${pickupDetails.pickup_instructions}</p>` : ''}
    </div>
    ` : '';

    // Build owner contact section for driver email
    const ownerContactSection = ownerProfile ? `
    <h3 style="color: #1a1a2e; margin-top: 25px;">📞 Owner Contact Information</h3>
    <div style="background: #fff3e0; border-left: 4px solid #ff9800; padding: 15px; margin: 15px 0;">
      <p style="margin: 5px 0;"><strong>Name:</strong> ${ownerName}</p>
      ${ownerProfile.phone ? `<p style="margin: 5px 0;"><strong>Phone:</strong> <a href="tel:${ownerProfile.phone}" style="color: #1976d2;">${ownerProfile.phone}</a></p>` : ''}
      ${ownerProfile.email ? `<p style="margin: 5px 0;"><strong>Email:</strong> <a href="mailto:${ownerProfile.email}" style="color: #1976d2;">${ownerProfile.email}</a></p>` : ''}
      <p style="margin: 10px 0 0 0; font-size: 13px; color: #666;">
        <em>Please coordinate with the owner to arrange a convenient pickup time.</em>
      </p>
    </div>
    ` : '';

    // Base email template
    const baseEmailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vehicle Rental Agreement - RentMaiKar</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: #ffffff; margin: 0; font-size: 28px;">RentMaiKar</h1>
    <p style="color: #a0a0a0; margin: 10px 0 0 0;">Vehicle Rental Agreement</p>
  </div>
  
  <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none;">
    <div style="background: #e8f5e9; border-left: 4px solid #4caf50; padding: 15px; margin-bottom: 20px;">
      <strong style="color: #2e7d32;">✓ Agreement Fully Executed</strong>
      <p style="margin: 5px 0 0 0; color: #666;">All parties have signed and the agreement has been witnessed.</p>
    </div>

    <h2 style="color: #1a1a2e; border-bottom: 2px solid #eee; padding-bottom: 10px;">Agreement Details</h2>
    
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Agreement Date:</strong></td>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">${agreementDate}</td>
      </tr>
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Vehicle:</strong></td>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">${vehicleInfo}</td>
      </tr>
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Owner:</strong></td>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">${ownerName}</td>
      </tr>
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Driver:</strong></td>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">${driverName}</td>
      </tr>
    </table>

    {{PICKUP_DETAILS}}

    {{OWNER_CONTACT}}

    <h3 style="color: #1a1a2e;">Key Terms Reference {{COPY_TYPE}}</h3>
    <ul style="color: #666; padding-left: 20px;">
      <li>All pricing and payment terms are as displayed on the RentMaiKar portal</li>
      <li>Weekly inspection reports are required</li>
      <li>IoT tracking and remote deactivation consent is included</li>
      <li>Platform fee applies as specified on the portal</li>
      {{NEXT_STEPS}}
    </ul>

    <div style="background: #f5f5f5; padding: 20px; border-radius: 5px; margin-top: 20px;">
      <p style="margin: 0; color: #666;">
        <strong>Important:</strong> This email confirms the execution of your rental agreement. 
        You can view the complete agreement details in your RentMaiKar dashboard.
      </p>
    </div>

    <div style="margin-top: 30px; text-align: center;">
      <a href="https://rentmaikar.com" style="display: inline-block; background: #1a1a2e; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
        View Dashboard
      </a>
    </div>
  </div>
  
  <div style="background: #f9f9f9; padding: 20px; text-align: center; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="margin: 0; color: #999; font-size: 12px;">
      This is an automated message from RentMaiKar.<br>
      For questions, contact support@rentmaikar.com
    </p>
    <p style="margin: 10px 0 0 0; color: #999; font-size: 12px;">
      Agreement ID: ${agreementId}
    </p>
  </div>
</body>
</html>
    `;

    // Driver email includes pickup details and owner contact
    const driverEmailHtml = baseEmailHtml
      .replace("{{PICKUP_DETAILS}}", pickupLocationSection)
      .replace("{{OWNER_CONTACT}}", ownerContactSection)
      .replace("{{COPY_TYPE}}", "(Driver Copy)")
      .replace("{{NEXT_STEPS}}", "<li><strong>Next Step:</strong> Contact the owner to arrange vehicle pickup and complete the initial inspection</li>");

    // Owner email doesn't include pickup/contact (they already know this)
    const ownerEmailHtml = baseEmailHtml
      .replace("{{PICKUP_DETAILS}}", "")
      .replace("{{OWNER_CONTACT}}", "")
      .replace("{{COPY_TYPE}}", "(Owner Copy)")
      .replace("{{NEXT_STEPS}}", "<li><strong>Next Step:</strong> Coordinate with the driver for vehicle handover</li>");

    // Send email to driver
    const driverEmailResponse = await resend.emails.send({
      from: "RentMaiKar <agreements@resend.dev>",
      to: [driverEmail],
      subject: `Vehicle Rental Agreement Executed - ${vehicleInfo}`,
      html: driverEmailHtml,
    });

    console.log("Driver email sent:", driverEmailResponse);

    // Send email to owner
    const ownerEmailResponse = await resend.emails.send({
      from: "RentMaiKar <agreements@resend.dev>",
      to: [ownerEmail],
      subject: `Vehicle Rental Agreement Executed - ${vehicleInfo}`,
      html: ownerEmailHtml,
    });

    console.log("Owner email sent:", ownerEmailResponse);

    // Update agreement with email sent timestamp
    await supabase
      .from("legal_agreements")
      .update({
        email_sent_at: new Date().toISOString(),
        email_sent_to: { driver: driverEmail, owner: ownerEmail },
      })
      .eq("id", agreementId);

    return new Response(
      JSON.stringify({ 
        success: true, 
        driverEmail: driverEmailResponse,
        ownerEmail: ownerEmailResponse 
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error sending agreement email:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
