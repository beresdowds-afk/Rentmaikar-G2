import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { outboundPausedResponse } from '../_shared/channel-guard.ts';
import { twilioCredentialsConfigured, twilioRequest } from '../_shared/twilio-auth.ts';
import { getMasterEndpointFor, publicSenderFor } from '../_shared/comms-endpoints.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface Recipient {
  phoneNumber: string;
  displayName?: string;
  userId?: string;
}

interface CallRequest {
  callType: 'individual' | 'group';
  region: 'USA' | 'Nigeria';
  recipients: Recipient[];
  groupId?: string;
  callerRole?: string;
  receiverRole?: string;
  receiverId?: string;
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

    const body: CallRequest = await req.json();
    const { callType, region, recipients, callerRole, receiverRole, receiverId } = body;

    // ─── Admin outbound kill-switch (voice, per region) ───
    {
      const paused = await outboundPausedResponse(supabase, 'call', region, corsHeaders, {
        recipient: recipients?.[0]?.phoneNumber ?? null,
        notificationType: callType,
        functionName: 'initiate-voip-call',
      });
      if (paused) return paused;
    }

    if (!recipients || recipients.length === 0) {
      return new Response(
        JSON.stringify({ error: 'At least one recipient is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─── ROLE-BASED PERMISSION VALIDATION ───
    if (callerRole && receiverRole) {
      // Check if this caller role is permitted to call this receiver role
      const { data: permission, error: permError } = await supabase
        .from('voice_call_permissions')
        .select('*')
        .eq('caller_role', callerRole)
        .eq('receiver_role', receiverRole)
        .eq('is_active', true)
        .maybeSingle();

      if (permError || !permission) {
        return new Response(
          JSON.stringify({ error: `${callerRole} is not permitted to call ${receiverRole}` }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // If rental link required (owner → driver), verify active rental exists
      if (permission.requires_rental_link && receiverId) {
        const { data: rental } = await supabase
          .from('vehicles')
          .select('id')
          .eq('owner_id', user.id)
          .eq('assigned_driver_id', receiverId)
          .limit(1)
          .maybeSingle();

        if (!rental) {
          return new Response(
            JSON.stringify({ error: 'No active rental link found with this user' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      // Verify caller actually has the claimed role
      const { data: callerRoleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', callerRole)
        .maybeSingle();

      if (!callerRoleData) {
        return new Response(
          JSON.stringify({ error: 'You do not have the required role to make this call' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Twilio is the voice provider for EVERY region (Termii is SMS/OTP only —
    // its /otp/call endpoint is not a dialable voice leg and returns 404).
    if (!twilioCredentialsConfigured()) {
      return new Response(
        JSON.stringify({ error: 'Twilio voice credentials are not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const masterEndpoint = await getMasterEndpointFor(supabase, 'call');


    // Create call record in database with role tracking
    const { data: callRecord, error: callError } = await supabase
      .from('voip_calls')
      .insert({
        initiated_by: user.id,
        call_type: callType,
        region: region,
        status: 'pending',
        direction: 'outbound',
        started_at: new Date().toISOString(),
        caller_role: callerRole || null,
        receiver_id: receiverId || null,
        receiver_role: receiverRole || null,
      })
      .select()
      .single();

    if (callError) {
      console.error('Error creating call record:', callError);
      return new Response(
        JSON.stringify({ error: 'Failed to create call record' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // For group calls, create a conference
    const isConference = callType === 'group' || recipients.length > 1;
    const conferenceName = isConference ? `RentMaikar_${callRecord.id}` : null;

    // Every leg is dialled through Twilio (voice provider for all regions).
    const callResults = [];

    for (const recipient of recipients) {
      try {
        const recipientRegion = recipient.phoneNumber.startsWith('+234') ? 'Nigeria' : 'USA';

        // Bridge the answered leg to the operator endpoint — never back to the
        // recipient's own number (that self-dial made single calls drop).
        const twiml = isConference
          ? `<Response><Dial><Conference>${conferenceName}</Conference></Dial></Response>`
          : `<Response><Say voice="alice">Connecting you to RentMaikar support.</Say>` +
            `<Dial answerOnBridge="true" timeout="30"><Number>${masterEndpoint}</Number></Dial></Response>`;

        const formData = new URLSearchParams();
        formData.append('To', recipient.phoneNumber);
        formData.append('From', publicSenderFor('call'));
        formData.append('Twiml', twiml);
        formData.append('Record', 'true');
        formData.append('RecordingStatusCallback', `${supabaseUrl}/functions/v1/recording-status-callback`);
        formData.append('RecordingStatusCallbackEvent', 'completed');

        const callbackUrl = `${supabaseUrl}/functions/v1/voip-status-callback`;
        formData.append('StatusCallback', callbackUrl);
        formData.append('StatusCallbackEvent', 'initiated ringing answered completed');

        // API key (SK.../secret) — the approved credential pair. The account
        // auth token is deliberately not used for REST calls.
        const twilioResult = await twilioRequest('/Calls.json', {
          method: 'POST',
          body: formData,
        });

        if (!twilioResult.ok) {
          const message = String(
            (twilioResult.payload as { message?: string }).message || 'Twilio call failed',
          );
          console.error(`Twilio error [${twilioResult.status}] via ${twilioResult.credential}:`, twilioResult.payload);
          callResults.push({
            recipient: recipient.phoneNumber,
            success: false,
            status: twilioResult.status,
            error: twilioResult.status === 401
              ? `${message} — Twilio rejected the API key credentials`
              : message,
          });
          continue;
        }

        // Add participant record
        await supabase
          .from('voip_call_participants')
          .insert({
            call_id: callRecord.id,
            user_id: recipient.userId || null,
            phone_number: recipient.phoneNumber,
            participant_type: 'recipient',
            display_name: recipient.displayName,
            region: recipientRegion,
            status: 'ringing',
          });

        callResults.push({
          recipient: recipient.phoneNumber,
          success: true,
          callSid: (twilioResult.payload as { sid?: string }).sid,
        });



      } catch (err: any) {
        console.error('Error calling recipient:', recipient.phoneNumber, err);
        callResults.push({
          recipient: recipient.phoneNumber,
          success: false,
          error: err?.message || 'Unknown error',
        });
      }
    }

    // Update call status
    const successfulCalls = callResults.filter(r => r.success);
    const newStatus = successfulCalls.length > 0 ? 'ringing' : 'failed';
    
    await supabase
      .from('voip_calls')
      .update({ 
        status: newStatus,
        call_sid: successfulCalls[0]?.callSid || null,
      })
      .eq('id', callRecord.id);

    return new Response(
      JSON.stringify({
        success: successfulCalls.length > 0,
        callId: callRecord.id,
        results: callResults,
        conferenceName,
        // Surface the provider reason so the UI never shows a silent drop.
        error: successfulCalls.length > 0
          ? undefined
          : callResults.map((r) => r.error).filter(Boolean).join('; ') || 'Call could not be placed',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );


  } catch (error: any) {
    console.error('Error in initiate-voip-call:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

serve(handler);
