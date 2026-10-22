import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runEndCall, type EndCallResult } from '../_shared/end-call-policy.ts';
import { twilioCredentialsConfigured, twilioRequest } from '../_shared/twilio-auth.ts';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface EndCallRequest {
  callId?: string;
  callSid?: string;
  call_sid?: string;
  call_id?: string;
  reconcileOnly?: boolean;
}

const json = (payload: unknown, status: number): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, message: 'Missing authorization header', error: 'Missing authorization header' }),
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
        JSON.stringify({ success: false, message: 'Unauthorized', error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: EndCallRequest = await req.json();
    const callId = body.callId || body.call_id;
    const requestedCallSid = body.callSid || body.call_sid;

    if (!callId && !requestedCallSid) {
      return json({ success: false, message: 'Call ID or Call SID is required', error: 'Call ID or Call SID is required' }, 400);
    }

    if (!twilioCredentialsConfigured()) {
      const message = 'Twilio voice credentials are not configured';
      return json({ success: false, message, error: message, callId }, 200);
    }

    // Policy is shared line-for-line with backend handleEndVoipCall via
    // _shared/end-call-policy.ts; only I/O adapters are defined here.
    const result: EndCallResult = await runEndCall(
      { callId, callSid: requestedCallSid, reconcileOnly: body.reconcileOnly === true },
      {
        async loadRecord({ callId: id, callSid }) {
          if (!id && !callSid) return null;
          let query = supabase.from('voip_calls').select('id, call_sid, call_type');
          query = id ? query.eq('id', id) : query.eq('call_sid', callSid!);
          const { data, error } = await query.maybeSingle();
          if (error) throw error;
          return data
            ? { id: data.id, callSid: data.call_sid, callType: data.call_type }
            : null;
        },
        async getProviderCall(sid) {
          const r = await twilioRequest(`/Calls/${sid}.json`, { method: 'GET' });
          return {
            ok: r.ok,
            status: r.status,
            providerStatus: String((r.payload as { status?: string })?.status || ''),
          };
        },
        async requestTermination(sid) {
          const form = new URLSearchParams();
          form.append('Status', 'completed');
          const r = await twilioRequest(`/Calls/${sid}.json`, { method: 'POST', body: form });
          return { ok: r.ok, status: r.status };
        },
        async terminateConference(id) {
          const lookup = await twilioRequest(
            `/Conferences.json?FriendlyName=RentMaikar_${id}&Status=in-progress`,
            { method: 'GET' },
          );
          const list = (lookup.payload as { conferences?: Array<{ sid: string }> })?.conferences || [];
          for (const conf of list) {
            const form = new URLSearchParams();
            form.append('Status', 'completed');
            await twilioRequest(`/Conferences/${conf.sid}.json`, { method: 'POST', body: form });
          }
        },
        async syncCall({ callId: id, callSid, status }) {
          let query = supabase.from('voip_calls').select('id, started_at, created_at, ended_at, duration_seconds');
          query = id ? query.eq('id', id) : query.eq('call_sid', callSid);
          const { data: row, error: readError } = await query.maybeSingle();
          if (readError) throw readError;
          if (!row) return;
          const endedAt = new Date();
          const startedAt = new Date(row.started_at || row.created_at);
          const duration = Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000));
          const { error } = await supabase
            .from('voip_calls')
            .update({
              status,
              ended_at: row.ended_at || endedAt.toISOString(),
              duration_seconds: row.duration_seconds ?? duration,
            })
            .eq('id', row.id);
          if (error) throw error;
        },
        async syncParticipants(id) {
          await supabase
            .from('voip_call_participants')
            .update({ status: 'disconnected', left_at: new Date().toISOString() })
            .eq('call_id', id);
        },
        warn(message, detail) {
          console.warn(message, (detail as { message?: string })?.message ?? detail ?? '');
        },
      },
    );

    // Same contract as backend: always HTTP 200 for policy outcomes with
    // { success, message, callId?, status? }. `error` mirrors `message` on
    // failure for legacy callers.
    return json(result.success ? result : { ...result, error: result.message }, 200);

  } catch (error: any) {
    console.error('Error in end-voip-call:', error);
    return new Response(
      JSON.stringify({ success: false, message: error?.message || 'Internal server error', error: error?.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

serve(handler);
