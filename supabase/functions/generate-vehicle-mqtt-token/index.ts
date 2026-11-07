import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: authError } = await supabase.auth.getClaims(token);
    if (authError || !claims?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const userId = claims.claims.sub as string;

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Authorization: only admins or active IoT support staff may mint MQTT tokens.
    const [{ data: roleRows }, { data: iotStaff }] = await Promise.all([
      adminClient.from('user_roles').select('role').eq('user_id', userId).eq('role', 'admin'),
      adminClient
        .from('support_staff')
        .select('id')
        .eq('user_id', userId)
        .in('support_type', ['iot_installation', 'iot_maintenance'])
        .eq('is_active', true),
    ]);

    const isAdmin = (roleRows?.length ?? 0) > 0;
    const isIotStaff = (iotStaff?.length ?? 0) > 0;
    if (!isAdmin && !isIotStaff) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { credentialId, vehicleId, expiryDays = 30 } = await req.json();

    if (
      typeof credentialId !== 'string' ||
      typeof vehicleId !== 'string' ||
      !credentialId ||
      !vehicleId ||
      !Number.isInteger(expiryDays) ||
      expiryDays < 1 ||
      expiryDays > 30
    ) {
      return new Response(JSON.stringify({ error: 'credentialId and vehicleId are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }


    const { data: cred, error: credError } = await adminClient
      .from('vehicle_mqtt_credentials')
      .select('*')
      .eq('id', credentialId)
      .single();

    if (credError || !cred) {
      return new Response(JSON.stringify({ error: 'Credential not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    if (!cred.is_active || String(cred.vehicle_id) !== vehicleId) {
      return new Response(JSON.stringify({ error: 'Credential is inactive or assigned to another vehicle' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let deviceQuery = adminClient
      .from('iot_devices')
      .select('id, vehicle_id')
      .eq('provider', 'emqx')
      .eq('status', 'active')
      .eq('telemetry_enabled', true)
      .eq('vehicle_id', vehicleId);
    if (cred.iot_device_id) deviceQuery = deviceQuery.eq('id', cred.iot_device_id);
    const { data: devices, error: deviceError } = await deviceQuery.limit(2);
    if (deviceError) throw deviceError;
    if (devices?.length !== 1) {
      return new Response(JSON.stringify({ error: 'No unique active registered device is assigned to this vehicle' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const topicPrefix = `rentmaikar/vehicle/${vehicleId}`;
    if (String(cred.topic_prefix).replace(/\/+$/, '') !== topicPrefix) {
      return new Response(JSON.stringify({ error: 'MQTT credential topic is not bound to the assigned vehicle' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const publishTopics = Array.isArray(cred.publish_topics)
      ? cred.publish_topics.filter((topic: unknown) =>
        typeof topic === 'string' && (topic === `${topicPrefix}/#` || topic.startsWith(`${topicPrefix}/`))
      )
      : [];
    if (
      !Array.isArray(cred.publish_topics) ||
      !publishTopics.length ||
      publishTopics.length !== cred.publish_topics.length
    ) {
      return new Response(JSON.stringify({ error: 'MQTT publish topics are not restricted to the assigned vehicle' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const now = Math.floor(Date.now() / 1000);
    const expirySeconds = expiryDays * 24 * 60 * 60;

    const payload = {
      sub: cred.client_id,
      iss: 'rentmaikar-platform',
      iat: now,
      exp: now + expirySeconds,
      vehicle_id: vehicleId,
      username: cred.mqtt_username,
      acl: { pub: publishTopics, sub: Array.isArray(cred.subscribe_topics) ? cred.subscribe_topics : [] },
    };

    const encoder = new TextEncoder();
    const signingSecret =
      Deno.env.get('MQTT_JWT_SECRET') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const signingInput = `${header}.${payloadB64}`;

    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(signingSecret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput));
    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const jwt = `${signingInput}.${sigB64}`;

    const issuedAt = new Date().toISOString();
    const expiresAt = new Date((now + expirySeconds) * 1000).toISOString();

    const { error: updateError } = await adminClient.from('vehicle_mqtt_credentials').update({
      jwt_token: jwt,
      jwt_issued_at: issuedAt,
      jwt_expires_at: expiresAt,
    }).eq('id', credentialId);
    if (updateError) throw updateError;

    return new Response(JSON.stringify({
      success: true, jwt, issued_at: issuedAt, expires_at: expiresAt,
      vehicle_id: vehicleId, client_id: cred.client_id,
      mqtt_username: cred.mqtt_username, broker_url: cred.broker_url, broker_port: cred.broker_port,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('[generate-vehicle-mqtt-token]', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
