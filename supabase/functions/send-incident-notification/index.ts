import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { EMAIL_CONFIG, formatSenderEmail } from "../_shared/email-config.ts";
import { requireServiceRole } from "../_shared/auth-guards.ts";
import { resendSendEmail } from "../_shared/resend-gateway.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation schema
const incidentNotificationSchema = z.object({
  incidentId: z.string().uuid("Invalid incident ID"),
  incidentType: z.enum(['accident', 'maintenance', 'breakdown', 'theft', 'other']),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  vehicleId: z.string().uuid("Invalid vehicle ID"),
  driverId: z.string().uuid("Invalid driver ID"),
  ownerId: z.string().uuid("Invalid owner ID").optional(),
  title: z.string().min(1).max(200, "Title too long"),
  description: z.string().min(1).max(2000, "Description too long"),
  isIotDetected: z.boolean(),
  isLateReport: z.boolean(),
  location: z.string().max(500).optional(),
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

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const getSeverityEmoji = (severity: string): string => {
  const emojis: Record<string, string> = {
    low: '🟡',
    medium: '🟠',
    high: '🔴',
    critical: '🚨',
  };
  return emojis[severity] || '⚪';
};

const getTypeEmoji = (type: string): string => {
  const emojis: Record<string, string> = {
    accident: '💥',
    maintenance: '🔧',
    breakdown: '🚗',
    theft: '🚨',
    other: '📋',
  };
  return emojis[type] || '📋';
};

const sendEmailNotification = async (
  to: string,
  subject: string,
  html: string
): Promise<boolean> => {
  if (!RESEND_API_KEY) {
    console.log('[IncidentNotification] RESEND_API_KEY not configured, skipping email');
    return false;
  }

  try {
    const response = await resendSendEmail({
        from: formatSenderEmail('support'),
        to: [to],
        subject,
        html,
      }, RESEND_API_KEY);

    const result = await response.json();
    console.log('[IncidentNotification] Email sent:', result);
    return response.ok;
  } catch (error) {
    console.error('[IncidentNotification] Email error:', error);
    return false;
  }
};

const sendSmsNotification = async (
  phone: string,
  message: string,
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
      body: JSON.stringify({
        phone,
        channel: 'sms',
        notificationType: 'general',
        customMessage: message,
      }),
    });

    return response.ok;
  } catch (error) {
    console.error('[IncidentNotification] SMS error:', error);
    return false;
  }
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const _authError = requireServiceRole(req);
  if (_authError) return _authError;


  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Parse and validate request body
    const rawBody = await req.json();
    const parseResult = incidentNotificationSchema.safeParse(rawBody);
    
    if (!parseResult.success) {
      console.error("[IncidentNotification] Validation failed:", parseResult.error.errors);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Invalid request data",
          details: parseResult.error.errors.map(e => e.message)
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const body = parseResult.data;

    console.log("[IncidentNotification] Processing incident:", body.incidentId);

    const sevEmoji = getSeverityEmoji(body.severity);
    const typeEmoji = getTypeEmoji(body.incidentType);
    const iotBadge = body.isIotDetected ? '🤖 IoT Detected' : '👤 Driver Reported';

    // Escape user-provided content to prevent XSS
    const safeTitle = escapeHtml(body.title);
    const safeDescription = escapeHtml(body.description);
    const safeLocation = body.location ? escapeHtml(body.location) : null;

    // Fetch driver info
    const { data: driverProfile } = await supabase
      .from('profiles')
      .select('full_name, email, phone')
      .eq('user_id', body.driverId)
      .maybeSingle();

    // Fetch owner info if available
    let ownerProfile = null;
    if (body.ownerId) {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, email, phone')
        .eq('user_id', body.ownerId)
        .maybeSingle();
      ownerProfile = data;
    }

    // Fetch admin emails
    const { data: adminUsers } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin');

    const adminEmails: string[] = [];
    if (adminUsers) {
      for (const admin of adminUsers) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('email')
          .eq('user_id', admin.user_id)
          .maybeSingle();
        if (profile?.email) {
          adminEmails.push(profile.email);
        }
      }
    }

    // Escape profile data
    const safeDriverName = driverProfile?.full_name ? escapeHtml(driverProfile.full_name) : 'Unknown';
    const safeDriverEmail = driverProfile?.email ? escapeHtml(driverProfile.email) : 'N/A';
    const safeDriverPhone = driverProfile?.phone ? escapeHtml(driverProfile.phone) : 'N/A';

    // Build email content
    const emailSubject = `${sevEmoji} ${typeEmoji} ${body.incidentType.toUpperCase()} Report - Vehicle Incident`;
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: ${body.severity === 'critical' ? '#dc2626' : body.severity === 'high' ? '#ea580c' : '#f59e0b'}; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">${sevEmoji} Vehicle Incident Report</h1>
          <p style="margin: 10px 0 0 0; font-size: 14px;">${iotBadge}</p>
        </div>
        
        <div style="padding: 20px; background: #f9fafb;">
          ${body.isLateReport ? `
            <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 12px; border-radius: 8px; margin-bottom: 16px;">
              <strong style="color: #dc2626;">⚠️ LATE REPORT</strong>
              <p style="margin: 4px 0 0 0; color: #991b1b; font-size: 14px;">
                This incident was reported more than 1 hour after it occurred.
              </p>
            </div>
          ` : ''}
          
          <div style="background: white; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
            <h2 style="margin: 0 0 12px 0; color: #1f2937;">${typeEmoji} ${safeTitle}</h2>
            <p style="color: #6b7280; margin: 0;">${safeDescription}</p>
          </div>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div style="background: white; padding: 12px; border-radius: 8px;">
              <strong style="color: #6b7280; font-size: 12px;">SEVERITY</strong>
              <p style="margin: 4px 0 0 0; font-weight: bold; text-transform: uppercase;">${body.severity}</p>
            </div>
            <div style="background: white; padding: 12px; border-radius: 8px;">
              <strong style="color: #6b7280; font-size: 12px;">TYPE</strong>
              <p style="margin: 4px 0 0 0; font-weight: bold; text-transform: uppercase;">${body.incidentType}</p>
            </div>
          </div>
          
          <div style="background: white; padding: 16px; border-radius: 8px; margin-top: 16px;">
            <h3 style="margin: 0 0 12px 0; color: #1f2937;">Driver Information</h3>
            <p style="margin: 0; color: #6b7280;">
              <strong>Name:</strong> ${safeDriverName}<br>
              <strong>Email:</strong> ${safeDriverEmail}<br>
              <strong>Phone:</strong> ${safeDriverPhone}
            </p>
          </div>
          
          ${safeLocation ? `
            <div style="background: white; padding: 16px; border-radius: 8px; margin-top: 16px;">
              <h3 style="margin: 0 0 8px 0; color: #1f2937;">📍 Location</h3>
              <p style="margin: 0; color: #6b7280;">${safeLocation}</p>
            </div>
          ` : ''}
        </div>
        
        <div style="background: #1f2937; color: white; padding: 16px; text-align: center;">
          <p style="margin: 0; font-size: 14px;">
            Log in to your admin dashboard to view full details and respond to this incident.
          </p>
        </div>
      </div>
    `;

    // Build SMS message (plain text, no HTML escaping needed)
    const smsMessage = `${sevEmoji} RENTMAIKAR INCIDENT\n\n${typeEmoji} ${body.incidentType.toUpperCase()}: ${body.title}\n\nSeverity: ${body.severity}\nDriver: ${driverProfile?.full_name || 'Unknown'}\n${body.isLateReport ? '\n⚠️ LATE REPORT' : ''}\n\nCheck dashboard for details.`;

    const results = {
      adminEmailsSent: 0,
      ownerEmailSent: false,
      smsSent: 0,
    };

    // Send to admins
    for (const email of adminEmails) {
      const sent = await sendEmailNotification(email, emailSubject, emailHtml);
      if (sent) results.adminEmailsSent++;
    }

    // Send to owner
    if (ownerProfile?.email) {
      results.ownerEmailSent = await sendEmailNotification(ownerProfile.email, emailSubject, emailHtml);
    }

    // Send SMS for critical/high severity
    if (body.severity === 'critical' || body.severity === 'high') {
      if (ownerProfile?.phone) {
        const sent = await sendSmsNotification(ownerProfile.phone, smsMessage, supabaseUrl, supabaseServiceKey);
        if (sent) results.smsSent++;
      }
    }

    console.log("[IncidentNotification] Notifications sent:", results);

    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("[IncidentNotification] Error:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);