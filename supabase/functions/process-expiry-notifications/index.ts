import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { requireCronSecret } from "../_shared/cron-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Notification tiers aligned with the expiry flow diagram
const NOTIFICATION_TIERS = [30, 15, 7, 5] as const;

type NotificationTier = typeof NOTIFICATION_TIERS[number];

interface ExpiringItem {
  id: string;
  type: 'insurance' | 'registration' | 'inspection' | 'license' | 'police_report';
  expiry_date: string;
  days_until_expiry: number;
  vehicle_id?: string;
  vehicle_info?: string;
  owner_id?: string;
  driver_id?: string;
  owner_email?: string;
  owner_phone?: string;
  owner_name?: string;
  driver_email?: string;
  driver_phone?: string;
  driver_name?: string;
  owner_notification_sms?: boolean;
  owner_notification_whatsapp?: boolean;
  driver_notification_sms?: boolean;
  driver_notification_whatsapp?: boolean;
  region?: string;
}

/**
 * Determine the call flow based on document type (diagram routing):
 * - Driver License → Driver Call Flow
 * - Insurance → Owner Call Flow  
 * - Police Report → Nigeria Special Flow
 */
const getCallFlowType = (item: ExpiringItem): 'driver' | 'owner' | 'nigeria_special' => {
  if (item.type === 'police_report') return 'nigeria_special';
  if (item.type === 'license') return 'driver';
  // insurance, registration, inspection → owner
  return 'owner';
};

/**
 * Get the primary recipient for VoIP calls based on document type routing
 */
const getPrimaryRecipient = (item: ExpiringItem) => {
  const flowType = getCallFlowType(item);
  switch (flowType) {
    case 'driver':
      return {
        phone: item.driver_phone || item.owner_phone,
        name: item.driver_name || item.owner_name,
        id: item.driver_id || item.owner_id,
        type: 'driver' as const,
      };
    case 'nigeria_special':
      return {
        phone: item.driver_phone || item.owner_phone,
        name: item.driver_name || item.owner_name,
        id: item.driver_id || item.owner_id,
        type: 'driver' as const,
      };
    case 'owner':
    default:
      return {
        phone: item.owner_phone,
        name: item.owner_name,
        id: item.owner_id,
        type: 'owner' as const,
      };
  }
};

/**
 * Get urgency level for the notification tier
 */
const getTierUrgency = (days: number): 'standard' | 'priority' | 'urgent' | 'critical' => {
  if (days === 30) return 'standard';
  if (days === 15) return 'priority';
  if (days === 7) return 'urgent';
  return 'critical'; // 5 days
};

/**
 * Generate TwiML with IVR menu for 30-day and 15-day calls,
 * critical alert for 7-day and 5-day calls
 */
const generateExpiryTwiML = (
  item: ExpiringItem,
  recipientName: string,
  supabaseUrl: string,
  tier: NotificationTier
): string => {
  const typeLabel = item.type.replace('_', ' ');
  const vehicleText = item.vehicle_info ? ` for vehicle ${item.vehicle_info}` : '';
  const urgency = getTierUrgency(tier);
  const flowType = getCallFlowType(item);
  
  // Nigeria special flow: bilingual greeting
  const nigeriaGreeting = flowType === 'nigeria_special' 
    ? `<Say voice="alice" language="en-GB">This message is also available in Pidgin English.</Say>
       <Pause length="1"/>` 
    : '';

  if (urgency === 'critical') {
    // 5-day: Critical alert — no IVR, just urgent warning + SMS
    return `<Response>
      ${nigeriaGreeting}
      <Say voice="alice">
        CRITICAL ALERT. Hello ${recipientName}. This is an urgent message from Rent My Car.
        Your ${typeLabel}${vehicleText} will expire in ${tier} days on ${item.expiry_date}.
        Your account will be restricted if this document is not renewed.
        An upload link has been sent to your phone. Please act immediately.
        Thank you.
      </Say>
    </Response>`;
  }

  if (urgency === 'urgent') {
    // 7-day: Urgent with IVR
    return `<Response>
      ${nigeriaGreeting}
      <Gather numDigits="1" action="${supabaseUrl}/functions/v1/expiry-notification-ivr?itemId=${item.id}&type=${item.type}&vehicleId=${item.vehicle_id || ''}&tier=${tier}" method="POST" timeout="8">
        <Say voice="alice">
          URGENT REMINDER. Hello ${recipientName}. This is Rent My Car.
          Your ${typeLabel}${vehicleText} will expire in ${tier} days on ${item.expiry_date}.
          Failure to renew will result in account restrictions.
          Press 1 to receive a document upload link by S M S.
          Press 2 to request a renewal extension.
          Press 3 to speak with a support agent.
        </Say>
      </Gather>
      <Say voice="alice">We did not receive your selection. A document upload link will be sent to your phone. Goodbye.</Say>
    </Response>`;
  }

  // 30-day / 15-day: Standard/Priority with IVR
  const priorityPrefix = urgency === 'priority' ? 'PRIORITY REMINDER. ' : '';
  return `<Response>
    ${nigeriaGreeting}
    <Gather numDigits="1" action="${supabaseUrl}/functions/v1/expiry-notification-ivr?itemId=${item.id}&type=${item.type}&vehicleId=${item.vehicle_id || ''}&tier=${tier}" method="POST" timeout="8">
      <Say voice="alice">
        ${priorityPrefix}Hello ${recipientName}. This is Rent My Car.
        Your ${typeLabel}${vehicleText} will expire in ${tier} days on ${item.expiry_date}.
        Please ensure you renew it before the expiry date to avoid service interruptions.
        Press 1 to receive a document upload link by S M S.
        Press 2 to request a renewal extension.
        Press 3 to speak with a support agent.
      </Say>
    </Gather>
    <Say voice="alice">We did not receive your selection. A document upload link will be sent to your phone. Goodbye.</Say>
  </Response>`;
};

const sendSmsOrWhatsApp = async (
  phone: string,
  message: string,
  channel: 'sms' | 'whatsapp',
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<boolean> => {
  try {
    // Route through centralized send-sms-notification which handles Twilio/Termii routing
    const response = await fetch(`${supabaseUrl}/functions/v1/send-sms-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        phone,
        channel,
        notificationType: 'general',
        customMessage: message,
      }),
    });

    const result = await response.json();
    return result.success === true;
  } catch (e) {
    console.error(`${channel} send failed:`, e);
    return false;
  }
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const cronDenied = requireCronSecret(req);
  if (cronDenied) return cronDenied;

  const jobId = crypto.randomUUID();
  const jobStartedAt = Date.now();
  const log = (level: 'info' | 'warn' | 'error', event: string, data: Record<string, unknown> = {}) => {
    const entry = { jobId, job: 'process-expiry-notifications', level, event, ts: new Date().toISOString(), ...data };
    if (level === 'error') console.error(JSON.stringify(entry));
    else if (level === 'warn') console.warn(JSON.stringify(entry));
    else console.log(JSON.stringify(entry));
  };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioPhoneNumber = Deno.env.get("TWILIO_PHONE_NUMBER");

    log('info', 'job_started', {
      hasResend: !!resendApiKey,
      hasTwilio: !!(twilioAccountSid && twilioAuthToken && twilioPhoneNumber),
      hasTermii: !!Deno.env.get('TERMII_API_KEY'),
    });

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const resend = resendApiKey ? new Resend(resendApiKey) : null;

    const today = new Date();
    const formatDate = (d: Date) => d.toISOString().split('T')[0];

    // Calculate target dates for all tiers
    const tierDates = NOTIFICATION_TIERS.map(days => {
      const d = new Date(today);
      d.setDate(today.getDate() + days);
      return { days, date: formatDate(d) };
    });

    // Fetch vehicles with expiring documents
    const { data: vehicles, error: vehiclesError } = await supabase
      .from('vehicles')
      .select(`
        id, make, model, year, license_plate, owner_id,
        insurance_expiry, registration_expiry, inspection_expiry
      `)
      .or(`insurance_expiry.gte.${formatDate(today)},registration_expiry.gte.${formatDate(today)},inspection_expiry.gte.${formatDate(today)}`);

    if (vehiclesError) {
      log('error', 'vehicles_fetch_failed', { error: vehiclesError.message });
    }
    log('info', 'vehicles_loaded', { count: vehicles?.length ?? 0 });


    const expiringItems: ExpiringItem[] = [];

    // Process vehicle expiry dates
    for (const vehicle of vehicles || []) {
      const vehicleInfo = `${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.license_plate})`;
      
      let ownerProfile = null;
      if (vehicle.owner_id) {
        const { data: owner } = await supabase
          .from('profiles')
          .select('user_id, email, full_name, phone, notification_sms, notification_whatsapp')
          .eq('user_id', vehicle.owner_id)
          .maybeSingle();
        ownerProfile = owner;
      }

      const checkExpiry = (expiryDate: string | null, type: 'insurance' | 'registration' | 'inspection') => {
        if (!expiryDate) return;
        const expiry = new Date(expiryDate);
        const daysUntil = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        // Check all notification tiers
        if (NOTIFICATION_TIERS.includes(daysUntil as NotificationTier)) {
          expiringItems.push({
            id: vehicle.id,
            type,
            expiry_date: expiryDate,
            days_until_expiry: daysUntil,
            vehicle_id: vehicle.id,
            vehicle_info: vehicleInfo,
            owner_id: ownerProfile?.user_id,
            owner_email: ownerProfile?.email,
            owner_phone: ownerProfile?.phone,
            owner_name: ownerProfile?.full_name,
            owner_notification_sms: ownerProfile?.notification_sms,
            owner_notification_whatsapp: ownerProfile?.notification_whatsapp,
          });
        }
      };

      checkExpiry(vehicle.insurance_expiry, 'insurance');
      checkExpiry(vehicle.registration_expiry, 'registration');
      checkExpiry(vehicle.inspection_expiry, 'inspection');
    }

    // Fetch user documents with expiry dates (license, police_report, etc.)
    const { data: documents, error: docsError } = await supabase
      .from('user_documents')
      .select('id, document_type, expiry_date, user_id, vehicle_id')
      .not('expiry_date', 'is', null)
      .gte('expiry_date', formatDate(today));

    if (docsError) {
      log('error', 'documents_fetch_failed', { error: docsError.message });
    }
    log('info', 'documents_loaded', { count: documents?.length ?? 0 });

    for (const doc of documents || []) {
      if (!doc.expiry_date) continue;
      const expiry = new Date(doc.expiry_date);
      const daysUntil = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      if (!NOTIFICATION_TIERS.includes(daysUntil as NotificationTier)) continue;

      let userProfile = null;
      if (doc.user_id) {
        const { data: user } = await supabase
          .from('profiles')
          .select('user_id, email, full_name, phone, notification_sms, notification_whatsapp')
          .eq('user_id', doc.user_id)
          .maybeSingle();
        userProfile = user;
      }

      // Map document_type to our type enum
      const docType = doc.document_type?.toLowerCase();
      let itemType: ExpiringItem['type'] = 'license';
      if (docType?.includes('police') || docType?.includes('clearance')) {
        itemType = 'police_report';
      } else if (docType?.includes('insurance')) {
        itemType = 'insurance';
      } else if (docType?.includes('registration')) {
        itemType = 'registration';
      }

      // Determine region from phone number
      const phone = userProfile?.phone || '';
      const region = phone.startsWith('+234') ? 'Nigeria' : 'USA';

      expiringItems.push({
        id: doc.id,
        type: itemType,
        expiry_date: doc.expiry_date,
        days_until_expiry: daysUntil,
        vehicle_id: doc.vehicle_id,
        driver_id: userProfile?.user_id,
        driver_email: userProfile?.email,
        driver_phone: userProfile?.phone,
        driver_name: userProfile?.full_name,
        driver_notification_sms: userProfile?.notification_sms,
        driver_notification_whatsapp: userProfile?.notification_whatsapp,
        region,
      });
    }

    log('info', 'expiring_items_identified', {
      total: expiringItems.length,
      byTier: NOTIFICATION_TIERS.reduce((acc, t) => {
        acc[`d${t}`] = expiringItems.filter(i => i.days_until_expiry === t).length;
        return acc;
      }, {} as Record<string, number>),
      byType: expiringItems.reduce((acc, i) => {
        acc[i.type] = (acc[i.type] ?? 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    });

    // Get admin profiles
    const { data: admins } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin');

    const adminUserIds = (admins || []).map(a => a.user_id);
    const { data: adminProfiles } = await supabase
      .from('profiles')
      .select('user_id, email, phone, full_name, notification_sms, notification_whatsapp')
      .in('user_id', adminUserIds);

    log('info', 'admins_loaded', { count: adminProfiles?.length ?? 0 });

    const results = {
      jobId,
      vehiclesLoaded: vehicles?.length ?? 0,
      documentsLoaded: documents?.length ?? 0,
      expiringItemsIdentified: expiringItems.length,
      skippedAlreadyNotified: 0,
      notificationsAttempted: 0,
      processed: 0,
      emailsSent: 0,
      emailsFailed: 0,
      smsSent: 0,
      smsFailed: 0,
      whatsappSent: 0,
      whatsappFailed: 0,
      voipCallsMade: 0,
      voipCallsFailed: 0,
      accountsRestricted: 0,
      durationMs: 0,
      errors: [] as string[],
    };


    for (const item of expiringItems) {
      // Dedup check
      const { data: existingNotification } = await supabase
        .from('expiry_notifications')
        .select('id')
        .eq('vehicle_id', item.vehicle_id || item.id)
        .eq('days_until_expiry', item.days_until_expiry)
        .eq('notification_type', item.type)
        .maybeSingle();

      if (existingNotification) { results.skippedAlreadyNotified++; continue; }
      results.notificationsAttempted++;


      const typeLabel = item.type.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
      const urgency = getTierUrgency(item.days_until_expiry);
      const urgencyPrefix = urgency === 'critical' ? '🚨 CRITICAL: ' 
        : urgency === 'urgent' ? '⚠️ URGENT: ' 
        : urgency === 'priority' ? '📋 PRIORITY: ' 
        : '⚠️ ';
      const subject = `${urgencyPrefix}${typeLabel} Expiring in ${item.days_until_expiry} Days`;
      const vehicleText = item.vehicle_info ? ` for ${item.vehicle_info}` : '';
      
      // Determine primary recipient based on document-type routing
      const flowType = getCallFlowType(item);
      const primaryEmail = flowType === 'driver' ? (item.driver_email || item.owner_email) : item.owner_email;
      const primaryName = flowType === 'driver' ? (item.driver_name || item.owner_name) : item.owner_name;
      const primaryPhone = flowType === 'driver' ? (item.driver_phone || item.owner_phone) : item.owner_phone;
      const primaryId = flowType === 'driver' ? (item.driver_id || item.owner_id) : item.owner_id;
      const primarySms = flowType === 'driver' ? (item.driver_notification_sms || item.owner_notification_sms) : item.owner_notification_sms;
      const primaryWhatsapp = flowType === 'driver' ? (item.driver_notification_whatsapp || item.owner_notification_whatsapp) : item.owner_notification_whatsapp;
      const recipientType = flowType === 'driver' ? 'driver' : 'owner';

      // Restrict messaging based on urgency
      const restrictionWarning = item.days_until_expiry <= 5 
        ? '<p style="color:red;font-weight:bold;">⚠️ Your account will be restricted if not renewed within 5 days.</p>' 
        : '';

      const smsMessage = item.days_until_expiry <= 5
        ? `RentMaiKar CRITICAL: Your ${item.type}${vehicleText} expires on ${item.expiry_date} (${item.days_until_expiry} days). Account will be RESTRICTED. Renew immediately.`
        : `RentMaiKar: Your ${item.type}${vehicleText} expires on ${item.expiry_date} (${item.days_until_expiry} days). Please renew to avoid service interruptions.`;

      // === SEND EMAIL ===
      if (primaryEmail && resend) {
        try {
          await resend.emails.send({
            from: "RentMaiKar <noreply@rentmaikar.com>",
            to: [primaryEmail],
            subject,
            html: `
              <h2>${typeLabel} Expiry Notice</h2>
              <p>Dear ${primaryName || 'User'},</p>
              <p>Your ${item.type}${vehicleText} will expire on <strong>${item.expiry_date}</strong> (${item.days_until_expiry} days from now).</p>
              ${restrictionWarning}
              <p>Please ensure you renew it before the expiry date to avoid any service interruptions.</p>
              <p>Best regards,<br>RentMaiKar Team</p>
            `,
          });
          
          await supabase.from('expiry_notifications').insert({
            document_id: ['license', 'police_report'].includes(item.type) ? item.id : null,
            vehicle_id: item.vehicle_id,
            notification_type: item.type,
            recipient_type: recipientType,
            recipient_id: primaryId,
            days_until_expiry: item.days_until_expiry,
            notification_channel: 'email',
          });
          results.emailsSent++;
        } catch (e) {
          results.emailsFailed++;
          const msg = `Email to ${recipientType} failed: ${e}`;
          results.errors.push(msg);
          log('error', 'email_send_failed', { recipientType, itemType: item.type, itemId: item.id, error: String(e) });
        }
      }


      // === SEND SMS (via centralized routing: Twilio USA / Termii Nigeria) ===
      if (primaryPhone && primarySms) {
        const sent = await sendSmsOrWhatsApp(primaryPhone, smsMessage, 'sms', supabaseUrl, supabaseServiceKey);
        if (sent) {
          await supabase.from('expiry_notifications').insert({
            document_id: ['license', 'police_report'].includes(item.type) ? item.id : null,
            vehicle_id: item.vehicle_id,
            notification_type: item.type,
            recipient_type: recipientType,
            recipient_id: primaryId,
            days_until_expiry: item.days_until_expiry,
            notification_channel: 'sms',
          });
          results.smsSent++;
        } else {
          results.smsFailed++;
          log('warn', 'sms_send_failed', { itemType: item.type, itemId: item.id, recipientType });
        }
      }


      // === SEND WHATSAPP (via centralized routing) ===
      if (primaryPhone && primaryWhatsapp) {
        const sent = await sendSmsOrWhatsApp(primaryPhone, smsMessage, 'whatsapp', supabaseUrl, supabaseServiceKey);
        if (sent) {
          await supabase.from('expiry_notifications').insert({
            document_id: ['license', 'police_report'].includes(item.type) ? item.id : null,
            vehicle_id: item.vehicle_id,
            notification_type: item.type,
            recipient_type: recipientType,
            recipient_id: primaryId,
            days_until_expiry: item.days_until_expiry,
            notification_channel: 'whatsapp',
          });
          results.whatsappSent++;
        } else {
          results.whatsappFailed++;
          log('warn', 'whatsapp_send_failed', { itemType: item.type, itemId: item.id, recipientType });
        }
      }


      // === ADMIN NOTIFICATIONS ===
      for (const admin of adminProfiles || []) {
        if (admin.email && resend) {
          try {
            await resend.emails.send({
              from: "RentMaiKar <noreply@rentmaikar.com>",
              to: [admin.email],
              subject: `[Admin] ${subject}`,
              html: `
                <h2>Admin Alert: ${typeLabel} Expiry Notice</h2>
                <p>The following ${item.type}${vehicleText} will expire on <strong>${item.expiry_date}</strong> (${item.days_until_expiry} days).</p>
                <p><strong>User:</strong> ${primaryName || 'N/A'} (${primaryEmail || 'N/A'})</p>
                <p><strong>Flow:</strong> ${flowType} | <strong>Urgency:</strong> ${urgency}</p>
                ${item.days_until_expiry <= 5 ? '<p style="color:red;">⚠️ Account restriction pending.</p>' : ''}
              `,
            });
            await supabase.from('expiry_notifications').insert({
              document_id: ['license', 'police_report'].includes(item.type) ? item.id : null,
              vehicle_id: item.vehicle_id,
              notification_type: item.type,
              recipient_type: 'admin',
              recipient_id: admin.user_id,
              days_until_expiry: item.days_until_expiry,
              notification_channel: 'email',
            });
            results.emailsSent++;
          } catch (e) {
            results.errors.push(`Email to admin failed: ${e}`);
          }
        }

        if (admin.phone && admin.notification_sms) {
          const adminSmsMessage = `[Admin] ${smsMessage} User: ${primaryName || 'N/A'}`;
          const sent = await sendSmsOrWhatsApp(admin.phone, adminSmsMessage, 'sms', supabaseUrl, supabaseServiceKey);
          if (sent) {
            await supabase.from('expiry_notifications').insert({
              document_id: ['license', 'police_report'].includes(item.type) ? item.id : null,
              vehicle_id: item.vehicle_id,
              notification_type: item.type,
              recipient_type: 'admin',
              recipient_id: admin.user_id,
              days_until_expiry: item.days_until_expiry,
              notification_channel: 'sms',
            });
            results.smsSent++;
          }
        }
      }

      // === VoIP CALLS — Twilio (USA) / Termii (Nigeria) ===
      {
        const recipient = getPrimaryRecipient(item);
        
        if (recipient.phone) {
          try {
            const isNigeria = recipient.phone.startsWith('+234');

            const { data: callRecord, error: callError } = await supabase
              .from('voip_calls')
              .insert({
                initiated_by: recipient.id,
                call_type: 'individual',
                region: isNigeria ? 'Nigeria' : 'USA',
                status: 'pending',
                direction: 'outbound',
                started_at: new Date().toISOString(),
                duration_seconds: 0,
                caller_role: 'system',
              })
              .select()
              .single();

            if (callError) throw new Error(`Call record creation failed: ${callError.message}`);

            let callSuccess = false;
            let callSidValue = '';

            if (isNigeria) {
              // ─── TERMII (Nigeria) ───
              const termiiApiKey = Deno.env.get('TERMII_API_KEY');
              if (termiiApiKey) {
                const typeLabel = item.type.replace('_', ' ');
                const voiceMsg = `Hello ${recipient.name || 'User'}. This is Rentmaikar. Your ${typeLabel} will expire in ${item.days_until_expiry} days on ${item.expiry_date}. Please renew it to avoid service interruption.`;

                const termiiResp = await fetch('https://api.ng.termii.com/api/sms/otp/call', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  // Termii voice OTP accepts ONLY api_key, phone_number and code.
                  body: JSON.stringify({
                    api_key: termiiApiKey,
                    phone_number: recipient.phone.replace('+', ''),
                    code: 1000 + (item.days_until_expiry % 900),
                  }),
                });
                const termiiData = await termiiResp.json();
                if (termiiResp.ok && termiiData.pinId) {
                  callSuccess = true;
                  callSidValue = termiiData.pinId;
                }
              }
            } else {
              // ─── TWILIO (USA) ───
              if (twilioAccountSid && twilioAuthToken && twilioPhoneNumber) {
                const twiml = generateExpiryTwiML(item, recipient.name || 'User', supabaseUrl, item.days_until_expiry as NotificationTier);
                const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Calls.json`;
                const callParams: Record<string, string> = {
                  To: recipient.phone,
                  From: twilioPhoneNumber,
                  Twiml: twiml,
                  StatusCallback: `${supabaseUrl}/functions/v1/voip-status-callback`,
                  MachineDetection: 'DetectMessageEnd',
                  AsyncAmd: 'true',
                };
                if (item.days_until_expiry <= 5) {
                  callParams.AsyncAmdStatusCallback = `${supabaseUrl}/functions/v1/voip-status-callback`;
                }
                const callResponse = await fetch(twilioUrl, {
                  method: 'POST',
                  headers: {
                    'Authorization': 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
                    'Content-Type': 'application/x-www-form-urlencoded',
                  },
                  body: new URLSearchParams(callParams),
                });
                const callData = await callResponse.json();
                if (callResponse.ok) {
                  callSuccess = true;
                  callSidValue = callData.sid;
                } else {
                  results.errors.push(`VoIP call to ${recipient.phone} failed: ${callData.message}`);
                }
              }
            }

            if (callSuccess) {
              await supabase
                .from('voip_calls')
                .update({ call_sid: callSidValue, status: 'ringing' })
                .eq('id', callRecord.id);

              await supabase.from('expiry_notifications').insert({
                document_id: ['license', 'police_report'].includes(item.type) ? item.id : null,
                vehicle_id: item.vehicle_id,
                notification_type: item.type,
                recipient_type: recipient.type,
                recipient_id: recipient.id,
                days_until_expiry: item.days_until_expiry,
                notification_channel: 'voip',
                voip_call_id: callRecord.id,
              });
              results.voipCallsMade++;
            } else {
              await supabase
                .from('voip_calls')
                .update({ status: 'failed' })
                .eq('id', callRecord.id);
            }
          } catch (e) {
            results.errors.push(`VoIP call failed: ${e}`);
          }
        }

        // For 5-day critical: also call admins
        if (item.days_until_expiry <= 5) {
          for (const admin of adminProfiles || []) {
            if (!admin.phone) continue;
            try {
              const adminTwiml = `<Response>
                <Say voice="alice">
                  Admin alert. A ${item.type.replace('_', ' ')} ${item.vehicle_info ? `for vehicle ${item.vehicle_info}` : ''} 
                  will expire in ${item.days_until_expiry} days. The user account will be restricted.
                  Please review and take action.
                </Say>
              </Response>`;

              const { data: adminCallRecord } = await supabase
                .from('voip_calls')
                .insert({
                  initiated_by: admin.user_id,
                  call_type: 'individual',
                  region: admin.phone.startsWith('+234') ? 'Nigeria' : 'USA',
                  status: 'pending',
                  direction: 'outbound',
                  started_at: new Date().toISOString(),
                  duration_seconds: 0,
                  caller_role: 'system',
                })
                .select()
                .single();

              if (adminCallRecord) {
                const adminIsNigeria = admin.phone.startsWith('+234');
                let adminCallSuccess = false;
                let adminCallSid = '';

                if (adminIsNigeria) {
                  const termiiKey = Deno.env.get('TERMII_API_KEY');
                  if (termiiKey) {
                    const adminVoiceMsg = `Admin alert from Rentmaikar. A ${item.type.replace('_', ' ')} ${item.vehicle_info ? `for vehicle ${item.vehicle_info}` : ''} will expire in ${item.days_until_expiry} days. Please review and take action.`;
                    const tResp = await fetch('https://api.ng.termii.com/api/sms/otp/call', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      // Termii voice OTP accepts ONLY api_key, phone_number and code.
                      body: JSON.stringify({
                        api_key: termiiKey,
                        phone_number: admin.phone.replace('+', ''),
                        code: 5555,
                      }),
                    });
                    const tData = await tResp.json();
                    if (tResp.ok && tData.pinId) {
                      adminCallSuccess = true;
                      adminCallSid = tData.pinId;
                    }
                  }
                } else if (twilioAccountSid && twilioAuthToken && twilioPhoneNumber) {
                  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Calls.json`;
                  const callResponse = await fetch(twilioUrl, {
                    method: 'POST',
                    headers: {
                      'Authorization': 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
                      'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: new URLSearchParams({
                      To: admin.phone,
                      From: twilioPhoneNumber,
                      Twiml: adminTwiml,
                      StatusCallback: `${supabaseUrl}/functions/v1/voip-status-callback`,
                    }),
                  });
                  const callData = await callResponse.json();
                  if (callResponse.ok) {
                    adminCallSuccess = true;
                    adminCallSid = callData.sid;
                  }
                }

                if (adminCallSuccess) {
                  await supabase.from('voip_calls')
                    .update({ call_sid: adminCallSid, status: 'ringing' })
                    .eq('id', adminCallRecord.id);
                  results.voipCallsMade++;
                }
              }
            } catch (e) {
              results.errors.push(`Admin VoIP call failed: ${e}`);
            }
          }
        }
      }

      // === 5-DAY: ACCOUNT RESTRICTION ===
      if (item.days_until_expiry <= 5) {
        // Restrict the user's daily plan eligibility as a soft restriction
        const restrictUserId = item.driver_id || item.owner_id;
        if (restrictUserId) {
          try {
            await supabase
              .from('profiles')
              .update({
                daily_plan_forbidden: true,
                daily_plan_forbidden_at: new Date().toISOString(),
                daily_plan_forbidden_reason: `Document expiry restriction: ${item.type} expires ${item.expiry_date}`,
              })
              .eq('user_id', restrictUserId);
            
            results.accountsRestricted++;
            console.log(`Account restricted for user ${restrictUserId}: ${item.type} expires in ${item.days_until_expiry} days`);
          } catch (e) {
            results.errors.push(`Account restriction failed for ${restrictUserId}: ${e}`);
          }
        }
      }

      results.processed++;
    }

    results.durationMs = Date.now() - jobStartedAt;
    log('info', 'job_completed', results);

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    log('error', 'job_failed', { error: error?.message, durationMs: Date.now() - jobStartedAt });
    return new Response(JSON.stringify({ jobId, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};


serve(handler);
