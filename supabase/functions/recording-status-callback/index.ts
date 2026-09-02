import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logMessagingEvent } from "../_shared/messaging-events.ts";
import { verifyTwilioRequestRaw } from "../_shared/twilio-signature.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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

    // Parse form data from Twilio recording callback
    const formData = await req.formData();
    const callSid = formData.get('CallSid') as string;
    const recordingSid = formData.get('RecordingSid') as string;
    const recordingUrl = formData.get('RecordingUrl') as string;
    const recordingStatus = formData.get('RecordingStatus') as string;
    const recordingDuration = formData.get('RecordingDuration') as string;

    console.log('Recording Status Callback:', { 
      callSid, 
      recordingSid, 
      recordingUrl, 
      recordingStatus,
      recordingDuration 
    });

    if (!callSid || !recordingSid) {
      return new Response('Missing required fields', { status: 400 });
    }

    // Find the call by SID
    const { data: callData, error: callError } = await supabase
      .from('voip_calls')
      .select('id')
      .eq('call_sid', callSid)
      .single();

    if (callError || !callData) {
      console.error('Call not found:', callSid, callError);
      return new Response('Call not found', { status: 404 });
    }

    // Log recording event
    await logMessagingEvent(supabase, {
      channel: 'voip',
      provider: 'twilio',
      event_type: recordingStatus === 'completed' ? 'recording_completed' : 'recording_failed',
      direction: 'outbound',
      provider_message_id: callSid,
      provider_event_id: recordingSid,
      metadata: { recording_duration: recordingDuration, recording_url: recordingUrl },
    });

    if (recordingStatus === 'completed' && recordingUrl) {
      // Update call with recording info and set status to pending processing
      await supabase
        .from('voip_calls')
        .update({
          recording_status: 'pending',
          recording_duration_seconds: recordingDuration ? parseInt(recordingDuration, 10) : null,
        })
        .eq('id', callData.id);

      // Trigger the process-call-recording function
      const processResponse = await fetch(`${supabaseUrl}/functions/v1/process-call-recording`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          callId: callData.id,
          recordingUrl: `${recordingUrl}.mp3`,
          recordingSid: recordingSid,
        }),
      });

      if (!processResponse.ok) {
        console.error('Failed to trigger recording processing:', await processResponse.text());
        // Update status to indicate processing failed to start
        await supabase
          .from('voip_calls')
          .update({ recording_status: 'failed' })
          .eq('id', callData.id);
      }
    } else if (recordingStatus === 'failed') {
      await supabase
        .from('voip_calls')
        .update({ recording_status: 'failed' })
        .eq('id', callData.id);
    }

    return new Response('OK', { status: 200, headers: corsHeaders });

  } catch (error) {
    console.error('Error in recording-status-callback:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
};

serve(handler);
