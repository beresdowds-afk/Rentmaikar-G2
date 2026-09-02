import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireServiceRole } from "../_shared/auth-guards.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProcessRecordingRequest {
  callId: string;
  recordingUrl: string;
  recordingSid: string;
}

// Only accept Twilio-hosted recording URLs to prevent SSRF and credential leaks.
const isTwilioRecordingUrl = (url: string): boolean => {
  try {
    const u = new URL(url);
    return (
      u.protocol === 'https:' &&
      (u.hostname === 'api.twilio.com' || u.hostname.endsWith('.twilio.com'))
    );
  } catch {
    return false;
  }
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Internal-only endpoint: require service-role bearer token.
  const authError = requireServiceRole(req);
  if (authError) return authError;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: ProcessRecordingRequest = await req.json();
    const { callId, recordingUrl, recordingSid } = body;

    if (!callId || !recordingUrl) {
      return new Response(
        JSON.stringify({ error: 'callId and recordingUrl are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!isTwilioRecordingUrl(recordingUrl)) {
      console.error('Rejected non-Twilio recording URL:', recordingUrl);
      return new Response(
        JSON.stringify({ error: 'recordingUrl must be a Twilio-hosted URL' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }


    // Update call status to processing
    await supabase
      .from('voip_calls')
      .update({ recording_status: 'processing' })
      .eq('id', callId);

    // Get Twilio credentials
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');

    if (!accountSid || !authToken) {
      return new Response(
        JSON.stringify({ error: 'Twilio credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Download recording from Twilio
    const twilioRecordingUrl = `${recordingUrl}.mp3`;
    const recordingResponse = await fetch(twilioRecordingUrl, {
      headers: {
        'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
      },
    });

    if (!recordingResponse.ok) {
      console.error('Failed to download recording from Twilio');
      await supabase
        .from('voip_calls')
        .update({ recording_status: 'failed' })
        .eq('id', callId);
      
      return new Response(
        JSON.stringify({ error: 'Failed to download recording' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const recordingBlob = await recordingResponse.blob();
    const recordingArrayBuffer = await recordingBlob.arrayBuffer();
    const recordingBytes = new Uint8Array(recordingArrayBuffer);

    // Generate file path
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = `${callId}/${timestamp}_${recordingSid || 'recording'}.mp3`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('call-recordings')
      .upload(filePath, recordingBytes, {
        contentType: 'audio/mpeg',
        upsert: false,
      });

    if (uploadError) {
      console.error('Failed to upload recording:', uploadError);
      await supabase
        .from('voip_calls')
        .update({ recording_status: 'failed' })
        .eq('id', callId);
      
      return new Response(
        JSON.stringify({ error: 'Failed to store recording' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the storage URL
    const { data: urlData } = supabase.storage
      .from('call-recordings')
      .getPublicUrl(filePath);

    // For private buckets, we store the path and generate signed URLs on demand
    const storagePath = filePath;

    // Update call record with recording info
    const { error: updateError } = await supabase
      .from('voip_calls')
      .update({
        recording_url: storagePath,
        recording_status: 'ready',
        recording_size_bytes: recordingBytes.length,
        recording_stored_at: new Date().toISOString(),
      })
      .eq('id', callId);

    if (updateError) {
      console.error('Failed to update call record:', updateError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        callId,
        storagePath,
        size: recordingBytes.length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in process-call-recording:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

serve(handler);
