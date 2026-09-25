import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { twilioCredentialsConfigured, twilioRequest } from '../_shared/twilio-auth.ts';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface EndCallRequest {
  callId?: string;
  callSid?: string;
  call_sid?: string;
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
    const callId = body.callId;
    const requestedCallSid = body.callSid || body.call_sid;

    if (!callId && !requestedCallSid) {
      return new Response(
        JSON.stringify({ error: 'Call ID or Call SID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get call record
    let query = supabase.from('voip_calls').select('*');
    if (callId) {
      query = query.eq('id', callId);
    } else {
      query = query.eq('call_sid', requestedCallSid!);
    }
    const { data: callRecord, error: callError } = await query.maybeSingle();

    if (callError || !callRecord) {
      return new Response(
        JSON.stringify({ error: 'Call not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const resolvedCallId = callRecord.id;
    const targetSid = callRecord.call_sid || requestedCallSid;

    // Twilio is authoritative for call termination.
    // Never mark the local call completed unless Twilio confirms a terminal state.
    if (targetSid) {
      if (!twilioCredentialsConfigured()) {
        return new Response(
          JSON.stringify({ error: 'Twilio voice credentials are not configured' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const terminalStatuses = new Set([
        'completed',
        'busy',
        'failed',
        'no-answer',
        'canceled',
      ]);

      try {
        // First verify the provider's current authoritative state.
        const lookup = await twilioRequest(
          `/Calls/${targetSid}.json`,
          { method: 'GET' }
        );

        if (lookup.status === 404) {
          const endedAt = new Date();
          await supabase
            .from('voip_calls')
            .update({
              status: 'failed',
              ended_at: callRecord.ended_at || endedAt.toISOString(),
            })
            .eq('id', resolvedCallId);

          return new Response(
            JSON.stringify({
              error: 'Twilio call no longer exists',
              callId: resolvedCallId,
            }),
            { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!lookup.ok) {
          return new Response(
            JSON.stringify({
              error: `Unable to verify Twilio call state (HTTP ${lookup.status})`,
              callId: resolvedCallId,
            }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const providerStatus = String(
          (lookup.payload as { status?: string })?.status || ''
        ).toLowerCase();

        if (!providerStatus) {
          return new Response(
            JSON.stringify({
              error: 'Twilio returned no call status',
              callId: resolvedCallId,
            }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // If Twilio already ended the call, reconcile local state without
        // issuing another termination request.
        if (terminalStatuses.has(providerStatus)) {
          const endedAt = new Date();
          const startedAt = callRecord.started_at
            ? new Date(callRecord.started_at)
            : new Date(callRecord.created_at);

          const durationSeconds = Math.max(
            0,
            Math.floor(
              (endedAt.getTime() - startedAt.getTime()) / 1000
            )
          );

          const { error: reconcileError } = await supabase
            .from('voip_calls')
            .update({
              status: providerStatus,
              call_sid: callRecord.call_sid || targetSid,
              ended_at: callRecord.ended_at || endedAt.toISOString(),
              duration_seconds: callRecord.duration_seconds ?? durationSeconds,
            })
            .eq('id', resolvedCallId);

          if (reconcileError) {
            console.error(
              'Error reconciling terminal call record:',
              reconcileError
            );

            return new Response(
              JSON.stringify({
                error: 'Twilio call is terminal but local state synchronization failed',
                callId: resolvedCallId,
              }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          await supabase
            .from('voip_call_participants')
            .update({
              status: 'disconnected',
              left_at: callRecord.ended_at || endedAt.toISOString(),
            })
            .eq('call_id', resolvedCallId);

          return new Response(
            JSON.stringify({
              success: true,
              callId: resolvedCallId,
              status: providerStatus,
              duration_seconds: callRecord.duration_seconds ?? durationSeconds,
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Provider confirms that the call is still active.
        const formParams = new URLSearchParams();
        formParams.append('Status', 'completed');

        const termination = await twilioRequest(
          `/Calls/${targetSid}.json`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formParams.toString(),
          }
        );

        if (!termination.ok) {
          console.error(
            `Twilio termination rejected: HTTP ${termination.status}`
          );

          return new Response(
            JSON.stringify({
              error: `Twilio rejected call termination (HTTP ${termination.status})`,
              callId: resolvedCallId,
            }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Terminate any active conference if this is a group call
        if (callRecord.call_type === 'group') {
          try {
            const confLookup = await twilioRequest(
              `/Conferences.json?FriendlyName=RentMaikar_${resolvedCallId}&Status=in-progress`,
              { method: 'GET' }
            );
            const confList = (confLookup.payload as { conferences?: Array<{ sid: string }> })?.conferences || [];
            for (const conf of confList) {
              const confForm = new URLSearchParams();
              confForm.append('Status', 'completed');
              await twilioRequest(`/Conferences/${conf.sid}.json`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: confForm.toString(),
              });
            }
          } catch (confErr) {
            console.warn('Conference termination warning:', confErr);
          }
        }

        // Confirm the resulting provider state before touching local state.
        const confirmation = await twilioRequest(
          `/Calls/${targetSid}.json`,
          { method: 'GET' }
        );

        if (!confirmation.ok) {
          return new Response(
            JSON.stringify({
              error: `Call termination was requested, but Twilio state could not be confirmed (HTTP ${confirmation.status})`,
              callId: resolvedCallId,
            }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const confirmedStatus = String(
          (confirmation.payload as { status?: string })?.status || ''
        ).toLowerCase();

        if (!terminalStatuses.has(confirmedStatus)) {
          return new Response(
            JSON.stringify({
              error: `Twilio has not confirmed call termination; current status: ${confirmedStatus || 'unknown'}`,
              callId: resolvedCallId,
            }),
            { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const endedAt = new Date();
        const startedAt = callRecord.started_at
          ? new Date(callRecord.started_at)
          : new Date(callRecord.created_at);

        const durationSeconds = Math.max(
          0,
          Math.floor(
            (endedAt.getTime() - startedAt.getTime()) / 1000
          )
        );

        const { error: updateError } = await supabase
          .from('voip_calls')
          .update({
            status: confirmedStatus,
            call_sid: callRecord.call_sid || targetSid,
            ended_at: endedAt.toISOString(),
            duration_seconds: durationSeconds,
          })
          .eq('id', resolvedCallId);

        if (updateError) {
          console.error('Error updating call record:', updateError);

          return new Response(
            JSON.stringify({
              error: 'Twilio ended the call, but local state synchronization failed',
              callId: resolvedCallId,
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await supabase
          .from('voip_call_participants')
          .update({
            status: 'disconnected',
            left_at: endedAt.toISOString(),
          })
          .eq('call_id', resolvedCallId);

        return new Response(
          JSON.stringify({
            success: true,
            callId: resolvedCallId,
            status: confirmedStatus,
            duration_seconds: durationSeconds,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (twilioError: any) {
        console.error(
          'Error terminating Twilio call:',
          twilioError?.message || twilioError
        );

        return new Response(
          JSON.stringify({
            error: 'Unable to terminate the call with Twilio',
            callId: resolvedCallId,
          }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // No provider SID means there is nothing authoritative to terminate.
    return new Response(
      JSON.stringify({
        error: 'No Twilio Call SID is associated with this call',
        callId: resolvedCallId,
      }),
      { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
