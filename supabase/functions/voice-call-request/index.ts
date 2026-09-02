import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface CallRequestBody {
  action: 'create' | 'accept' | 'reject' | 'escalate';
  requestId?: string;
  targetRole?: string;
  targetId?: string;
  reason?: string;
  region?: string;
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

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: CallRequestBody = await req.json();

    // Get user's role
    const { data: userRoleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    const userRole = userRoleData?.role || 'driver';

    if (body.action === 'create') {
      // Validate caller can request this type of call
      const targetRole = body.targetRole || 'admin';
      
      const { data: permission } = await supabase
        .from('voice_call_permissions')
        .select('*')
        .eq('caller_role', userRole)
        .eq('receiver_role', targetRole)
        .eq('is_active', true)
        .maybeSingle();

      if (!permission) {
        return new Response(
          JSON.stringify({ error: `You are not permitted to call ${targetRole}` }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: request, error } = await supabase
        .from('voice_call_requests')
        .insert({
          requester_id: user.id,
          requester_role: userRole,
          target_role: targetRole,
          target_id: body.targetId || null,
          reason: body.reason || null,
          region: body.region || 'USA',
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, request }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (body.action === 'accept' && body.requestId) {
      // Admin/support accepting a call request
      if (!['admin', 'legal_support', 'iot_support', 'vehicle_support'].includes(userRole)) {
        return new Response(
          JSON.stringify({ error: 'Only admin/support can accept call requests' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { error } = await supabase
        .from('voice_call_requests')
        .update({
          status: 'accepted',
          assigned_to: user.id,
        })
        .eq('id', body.requestId);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (body.action === 'reject' && body.requestId) {
      const { error } = await supabase
        .from('voice_call_requests')
        .update({ status: 'rejected', resolved_at: new Date().toISOString() })
        .eq('id', body.requestId);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (body.action === 'escalate' && body.requestId) {
      // Support staff escalating to admin
      const { error } = await supabase
        .from('voice_call_requests')
        .update({
          target_role: 'admin',
          status: 'escalated',
          assigned_to: null,
        })
        .eq('id', body.requestId);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in voice-call-request:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

serve(handler);
