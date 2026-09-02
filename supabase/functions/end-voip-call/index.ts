import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface EndCallRequest {
  callId: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: EndCallRequest = await req.json();
    const { callId } = body;

    if (!callId) {
      return new Response(
        JSON.stringify({ error: 'Call ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get call record
    const { data: callRecord, error: callError } = await supabase
      .from('voip_calls')
      .select('*')
      .eq('id', callId)
      .single();

    if (callError || !callRecord) {
      return new Response(
        JSON.stringify({ error: 'Call not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If call has a Twilio SID, end it via Twilio API
    if (callRecord.call_sid) {
      const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
      const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');

      if (accountSid && authToken) {
        try {
          const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${callRecord.call_sid}.json`;
          
          await fetch(twilioUrl, {
            method: 'POST',
            headers: {
              'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({ Status: 'completed' }),
          });
        } catch (twilioError) {
          console.error('Error ending Twilio call:', twilioError);
        }
      }
    }

    // Calculate duration
    const startedAt = callRecord.started_at ? new Date(callRecord.started_at) : new Date(callRecord.created_at);
    const endedAt = new Date();
    const durationSeconds = Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000);

    // Update call record
    const { error: updateError } = await supabase
      .from('voip_calls')
      .update({
        status: 'completed',
        ended_at: endedAt.toISOString(),
        duration_seconds: durationSeconds,
      })
      .eq('id', callId);

    if (updateError) {
      console.error('Error updating call record:', updateError);
    }

    // Update all participants
    await supabase
      .from('voip_call_participants')
      .update({
        status: 'disconnected',
        left_at: endedAt.toISOString(),
      })
      .eq('call_id', callId);

    return new Response(
      JSON.stringify({
        success: true,
        callId,
        duration_seconds: durationSeconds,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in end-voip-call:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

serve(handler);
