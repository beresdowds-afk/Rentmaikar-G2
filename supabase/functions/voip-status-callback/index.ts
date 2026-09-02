import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getCallPriority,
  getRegionFromPhone,
  getRetryDecision,
  getNextDayRetryTimestamp,
  CHANNEL_ESCALATION,
  type CallPriority,
} from "../_shared/call-strategy.ts";
import {
  VOICEMAIL_SCRIPTS,
  personalizeScript,
  getCallbackNumber,
  generateFollowUpSMS,
} from "../_shared/voicemail-system.ts";
import { logMessagingEvent } from "../_shared/messaging-events.ts";
import { verifyTwilioRequestRaw } from "../_shared/twilio-signature.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Map Twilio call statuses to our statuses
const statusMap: Record<string, string> = {
  'queued': 'pending',
  'ringing': 'ringing',
  'in-progress': 'in-progress',
  'completed': 'completed',
  'busy': 'busy',
  'failed': 'failed',
  'no-answer': 'no-answer',
  'canceled': 'canceled',
};

// ─── WhatsApp / SMS Message Delivery Status Handler ───
const handleMessageStatus = async (
  supabase: ReturnType<typeof createClient>,
  formData: FormData,
): Promise<Response> => {
  const messageSid = formData.get("MessageSid") as string;
  const messageStatus = formData.get("MessageStatus") as string;
  const to = formData.get("To") as string;
  const errorCode = formData.get("ErrorCode") as string;
  const errorMessage = formData.get("ErrorMessage") as string;
  const channelPrefix = formData.get("ChannelPrefix") as string;

  console.log("Message delivery status:", { messageSid, messageStatus, to, errorCode });

  if (!messageSid) {
    return new Response("Missing MessageSid", { status: 400 });
  }

  // Log messaging event for delivery status
  const channel = to?.startsWith("whatsapp:") ? "whatsapp" : "sms" as const;
  const region = to?.replace("whatsapp:", "").startsWith("+234") ? "NIGERIA" : "USA";
  await logMessagingEvent(supabase, {
    channel,
    provider: "twilio",
    event_type: messageStatus === "delivered" ? "delivered"
      : messageStatus === "read" ? "read"
      : messageStatus === "failed" || messageStatus === "undelivered" ? "failed"
      : messageStatus === "sent" ? "sent"
      : "queued",
    direction: "outbound",
    recipient: to,
    region,
    provider_message_id: messageSid,
    error_code: errorCode,
    error_message: errorMessage,
    raw_payload: { messageStatus, channelPrefix },
  });

  // Update inbox_messages delivery metadata
  const { data: existingMsg } = await supabase
    .from("inbox_messages")
    .select("id, metadata")
    .eq("external_id", messageSid)
    .limit(1)
    .single();

  if (existingMsg) {
    const currentMeta = (existingMsg.metadata || {}) as Record<string, unknown>;
    await supabase
      .from("inbox_messages")
      .update({
        metadata: {
          ...currentMeta,
          delivery_status: messageStatus,
          delivery_updated_at: new Date().toISOString(),
          ...(errorCode ? { error_code: errorCode, error_message: errorMessage } : {}),
        },
      })
      .eq("id", existingMsg.id);
  }

  // Update unified_message_log if exists
  await supabase
    .from("unified_message_log")
    .update({
      delivery_status: messageStatus === "delivered" ? "delivered"
        : messageStatus === "read" ? "delivered"
        : messageStatus === "failed" || messageStatus === "undelivered" ? "failed"
        : "pending",
      error_message: errorMessage || null,
      updated_at: new Date().toISOString(),
    })
    .eq("provider_message_id", messageSid);

  // Update whatsapp_message_delivery if exists
  if (messageStatus === "delivered" || messageStatus === "read") {
    await supabase
      .from("whatsapp_message_delivery")
      .update({
        status: "delivered",
        delivered_at: new Date().toISOString(),
      })
      .eq("external_id", messageSid);
  } else if (messageStatus === "failed" || messageStatus === "undelivered") {
    await supabase
      .from("whatsapp_message_delivery")
      .update({
        status: "failed",
        error_message: errorMessage || errorCode || "Delivery failed",
      })
      .eq("external_id", messageSid);
  }

  console.log(`Message ${messageSid} status updated to ${messageStatus}`);
  return new Response("OK", { status: 200, headers: corsHeaders });
};


const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // ─── Twilio Signature Verification ───
  if (req.method === 'POST') {
    const denied = await verifyTwilioRequestRaw(req);
    if (denied) return denied;
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse form data from Twilio
    const formData = await req.formData();

    // ─── Route: Message delivery status (SMS/WhatsApp) ───
    const messageSid = formData.get("MessageSid") as string;
    const messageStatus = formData.get("MessageStatus") as string;
    if (messageSid && messageStatus && !formData.get("CallSid")) {
      return await handleMessageStatus(supabase, formData);
    }

    // ─── Route: VoIP call status ───
    const callSid = formData.get('CallSid') as string;
    const callStatus = formData.get('CallStatus') as string;
    const duration = formData.get('CallDuration') as string;
    const to = formData.get('To') as string;
    const answeredBy = formData.get('AnsweredBy') as string; // AMD result

    console.log('VoIP Status Callback:', { callSid, callStatus, duration, to, answeredBy });

    // Log VoIP event
    const voipEventType = callStatus === 'completed' ? 'completed'
      : callStatus === 'failed' ? 'failed'
      : callStatus === 'busy' ? 'busy'
      : callStatus === 'no-answer' ? 'no_answer'
      : callStatus === 'canceled' ? 'canceled'
      : callStatus === 'in-progress' ? 'in_progress'
      : callStatus === 'ringing' ? 'ringing'
      : 'queued';
    
    await logMessagingEvent(supabase, {
      channel: 'voip',
      provider: 'twilio',
      event_type: voipEventType as any,
      direction: 'outbound',
      recipient: to,
      region: getRegionFromPhone(to || ''),
      provider_message_id: callSid,
      metadata: { call_status: callStatus, duration, answered_by: answeredBy },
    });

    if (!callSid) {
      return new Response('Missing CallSid', { status: 400 });
    }

    const mappedStatus = statusMap[callStatus] || callStatus;

    // Update call record
    const updateData: Record<string, any> = {
      status: mappedStatus,
    };

    if (callStatus === 'completed' || callStatus === 'failed' || callStatus === 'busy' || callStatus === 'no-answer' || callStatus === 'canceled') {
      updateData.ended_at = new Date().toISOString();
      if (duration) {
        updateData.duration_seconds = parseInt(duration, 10);
      }
    }

    if (callStatus === 'in-progress') {
      // Get recording URL if available
      const recordingUrl = formData.get('RecordingUrl') as string;
      if (recordingUrl) {
        updateData.recording_url = recordingUrl;
      }
    }

    // Find and update call by SID
    const { error: updateError } = await supabase
      .from('voip_calls')
      .update(updateData)
      .eq('call_sid', callSid);

    if (updateError) {
      console.error('Error updating call:', updateError);
    }

    // Update participant status
    if (to) {
      const participantStatus = callStatus === 'in-progress' ? 'connected' : 
                                callStatus === 'completed' ? 'disconnected' :
                                callStatus === 'ringing' ? 'ringing' : 'failed';

      const participantUpdate: Record<string, any> = {
        status: participantStatus,
      };

      if (callStatus === 'in-progress') {
        participantUpdate.joined_at = new Date().toISOString();
      } else if (callStatus === 'completed' || callStatus === 'failed') {
        participantUpdate.left_at = new Date().toISOString();
      }

      // Find call by SID first
      const { data: callData } = await supabase
        .from('voip_calls')
        .select('id')
        .eq('call_sid', callSid)
        .single();

      if (callData) {
        await supabase
          .from('voip_call_participants')
          .update(participantUpdate)
          .eq('call_id', callData.id)
          .eq('phone_number', to);
      }
    }

    // ─── SMART RETRY & ESCALATION LOGIC ───
    if (callStatus === 'busy' || callStatus === 'no-answer') {
      const { data: callRecord } = await supabase
        .from('voip_calls')
        .select('id, initiated_by, region, caller_role, receiver_role, receiver_id, call_type')
        .eq('call_sid', callSid)
        .single();

      if (callRecord) {
        // Count existing attempts in last 24h for this user+type
        const { count: attemptCount } = await supabase
          .from('voip_calls')
          .select('id', { count: 'exact', head: true })
          .eq('initiated_by', callRecord.initiated_by)
          .eq('receiver_id', callRecord.receiver_id)
          .gte('created_at', new Date(Date.now() - 86400000).toISOString());

        const currentAttempt = attemptCount || 1;
        const priority = getCallPriority(callRecord.call_type || 'medium');
        const region = callRecord.region || getRegionFromPhone(to || '');
        const decision = getRetryDecision(currentAttempt, priority, region);

        console.log(`[VoIP Callback] Retry decision for ${callSid}:`, {
          attempt: currentAttempt,
          priority,
          region,
          decision,
        });

        if (decision.shouldRetry) {
          if (decision.shouldEscalateChannel && decision.nextChannel) {
            // Escalate to alternate channel (SMS/WhatsApp/Email)
            const channel = decision.nextChannel.fallback;
            console.log(`[VoIP Callback] Escalating to ${channel} for ${callSid}`);
            
            if (channel === 'sms' || channel === 'whatsapp') {
              const smsUrl = `${supabaseUrl}/functions/v1/send-sms-notification`;
              await fetch(smsUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                  phone: to,
                  channel: channel,
                  notificationType: 'general',
                  customMessage: `We tried to reach you by phone regarding your Rentmaikar account. Please call us back or reply HELP for assistance.`,
                }),
              });
            }
            // For email escalation, the calling function handles it
          }

          if (decision.shouldScheduleNextDay) {
            // Schedule retry for next day at start of calling hours
            const retryAt = getNextDayRetryTimestamp(region);
            console.log(`[VoIP Callback] Scheduling next-day retry at ${retryAt}`);
            await supabase.from('voip_calls').insert({
              initiated_by: callRecord.initiated_by,
              call_type: callRecord.call_type || 'individual',
              region: callRecord.region,
              status: 'pending',
              direction: 'outbound',
              caller_role: callRecord.caller_role,
              receiver_id: callRecord.receiver_id,
              receiver_role: callRecord.receiver_role,
              started_at: retryAt,
            });
          } else if (decision.retryDelayMs !== null) {
            // Schedule retry with calculated delay
            const retryAt = new Date(Date.now() + decision.retryDelayMs).toISOString();
            console.log(`[VoIP Callback] Scheduling retry in ${decision.retryDelayMs / 60000}min at ${retryAt}`);
            await supabase.from('voip_calls').insert({
              initiated_by: callRecord.initiated_by,
              call_type: callRecord.call_type || 'individual',
              region: callRecord.region,
              status: 'pending',
              direction: 'outbound',
              caller_role: callRecord.caller_role,
              receiver_id: callRecord.receiver_id,
              receiver_role: callRecord.receiver_role,
              started_at: retryAt,
            });
          }
        } else {
          console.log(`[VoIP Callback] All retries exhausted for ${callSid} (${priority} priority)`);
        }
      }
    }

    // ─── POST-CALL SUMMARY SMS ───
    if (callStatus === 'completed' && to && duration) {
      try {
        const durationSec = parseInt(duration, 10);
        if (durationSec > 5) { // Only for meaningful calls (>5s)
          const smsUrl = `${supabaseUrl}/functions/v1/send-sms-notification`;
          await fetch(smsUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              phone: to,
              channel: 'sms',
              notificationType: 'general',
              customMessage: `Thank you for your call with Rentmaikar (${Math.ceil(durationSec / 60)} min). If you need further assistance, reply HELP or call us back.`,
            }),
          });
          console.log(`[VoIP Callback] Post-call SMS sent to ${to}`);
        }
      } catch (smsErr) {
        console.error('[VoIP Callback] Post-call SMS failed:', smsErr);
      }
    }

    // ─── VOICEMAIL DETECTION & LOGGING ───
    if (callStatus === 'completed' && answeredBy && answeredBy.startsWith('machine')) {
      try {
        const { data: callRecord } = await supabase
          .from('voip_calls')
          .select('id, initiated_by, receiver_id, call_type, region')
          .eq('call_sid', callSid)
          .single();

        if (callRecord && callRecord.call_type) {
          const scriptType = callRecord.call_type;
          const script = VOICEMAIL_SCRIPTS[scriptType];
          const region = callRecord.region || getRegionFromPhone(to || '');
          const callbackNumber = getCallbackNumber(region);

          // Log voicemail
          await supabase.from('voicemail_logs').insert({
            user_id: callRecord.receiver_id || callRecord.initiated_by,
            call_sid: callSid,
            script_type: scriptType,
            personalized_message: script ? personalizeScript(script.message, { number: callbackNumber }) : null,
            callback_queue: script?.callbackQueue || null,
            voicemail_detected: true,
            region,
          });

          // Send SMS follow-up if configured
          if (script && (script.smsFollowup || script.smsLink || script.smsWelcome) && to) {
            const smsMessage = generateFollowUpSMS(scriptType, callbackNumber);
            const smsUrl = `${supabaseUrl}/functions/v1/send-sms-notification`;
            await fetch(smsUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({
                phone: to,
                channel: 'sms',
                notificationType: 'general',
                customMessage: smsMessage,
              }),
            });

            // Update log with SMS sent flag
            await supabase.from('voicemail_logs')
              .update({
                sms_followup_sent: script.smsFollowup,
                sms_link_sent: script.smsLink,
              })
              .eq('call_sid', callSid);

            console.log(`[VoIP Callback] Voicemail SMS follow-up sent for ${scriptType}`);
          }
        }
      } catch (vmErr) {
        console.error('[VoIP Callback] Voicemail logging failed:', vmErr);
      }
    }

    return new Response('OK', { status: 200, headers: corsHeaders });

  } catch (error) {
    console.error('Error in voip-status-callback:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
};

serve(handler);
