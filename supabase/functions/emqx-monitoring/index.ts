import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireCronSecret } from "../_shared/cron-auth.ts";
import { EmqxApiError, resolveEmqxClient } from "../_shared/emqx-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * EMQX Monitoring Edge Function
 *
 * Proxies the EMQX v5 HTTP Management API for admin dashboard use.
 * Spec: https://docs.emqx.com/en/emqx/latest/admin/api.html
 *
 * Actions:
 *   config            — effective endpoint/credential configuration (no broker call)
 *   health            — unauthenticated GET /status + authenticated reachability probe
 *   stats             — cluster stats + metrics, with serverless-safe derived fallback
 *   nodes             — node health & resource usage
 *   monitor           — dashboard time-series (GET /monitor)
 *   monitor_current   — instantaneous dashboard counters
 *   clients           — paginated client list (full spec filter surface)
 *   client            — single client detail
 *   client_subscriptions — subscriptions for one client
 *   subscriptions     — paginated subscription list
 *   topics            — paginated topic list
 *   metrics           — detailed message & byte metrics
 *   topic_metrics     — per-topic metrics
 *   rules             — rule engine rules
 *   integrations      — /actions + /sources + /connectors (legacy /bridges fallback)
 *   bridges           — alias of integrations (backwards compatible)
 *   alarms            — active & historical alarms
 *   banned            — banned clients/users
 *   retained          — retained message for a topic
 *   publish           — publish a message (202 Accepted is success)
 *   publish_bulk      — publish many messages
 *   kickout           — disconnect a client (204 No Content is success)
 *   kickout_bulk      — disconnect many clients
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  // Scheduled callers may present the cron secret; interactive admin callers
  // authenticate with their JWT below. Only reject when neither is present.
  const hasCronSecret = requireCronSecret(req) === null;

  try {
    if (!hasCronSecret) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
      );

      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const adminClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );

      const { data: roleData } = await adminClient
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .in('role', ['admin', 'iot_support'])
        .maybeSingle();

      let allowed = !!roleData;
      if (!allowed) {
        const { data: staff } = await adminClient
          .from('support_staff')
          .select('id')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .in('support_type', ['iot_installation', 'iot_maintenance'])
          .maybeSingle();
        allowed = !!staff;
      }

      if (!allowed) {
        return new Response(JSON.stringify({ error: 'Admin access required' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const { action, params } = await req.json();

    const { client, config: configSummary, unavailable } = await resolveEmqxClient();

    const degraded = (reason: string, hint: string, status: number | null = null, code: string | null = null) =>
      new Response(
        JSON.stringify({ success: false, unavailable: true, reason, hint, status, code, config: configSummary }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );

    // Report the effective configuration without touching the broker.
    if (action === 'config') {
      return new Response(JSON.stringify({ success: true, data: { config: configSummary } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!client) {
      return degraded(unavailable!.reason, unavailable!.hint);
    }

    const bad = (message: string) =>
      new Response(JSON.stringify({ error: message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    let result: unknown;

    try {
      switch (action) {
        case 'health': {
          const [health, ping] = await Promise.all([client.health(), client.ping()]);
          result = { health, management: ping };
          break;
        }

        case 'stats': {
          // Serverless deployments forbid cluster-wide endpoints (/stats, /metrics -> 403).
          // Fall back to per-resource listings and derive the same headline counters.
          try {
            const [stats, metrics] = await Promise.all([
              client.request('/stats'),
              client.request('/metrics'),
            ]);
            result = { stats, metrics, derived: false };
          } catch (e) {
            const err = e as EmqxApiError;
            if (!(e instanceof EmqxApiError) || (err.httpStatus !== 403 && err.httpStatus !== 404)) throw e;
            const [connections, subscriptions, topics] = await Promise.all([
              client.count('/clients', { conn_state: 'connected' }),
              client.count('/subscriptions'),
              client.count('/topics'),
            ]);
            result = {
              derived: true,
              derivedNote:
                'Serverless plan: cluster metrics endpoints are restricted, counts derived from client/subscription/topic listings.',
              stats: {
                'connections.count': connections,
                'live_connections.count': connections,
                'sessions.count': connections,
                'subscriptions.count': subscriptions,
                'topics.count': topics,
              },
              metrics: null,
            };
          }
          break;
        }

        case 'nodes':
          result = await client.request('/nodes');
          break;

        case 'monitor':
          result = await client.request('/monitor', {
            query: { latest: params?.latest ?? 3600, node: params?.node },
          });
          break;

        case 'monitor_current':
          result = await client.request('/monitor_current');
          break;

        case 'clients':
          result = await client.clients(params ?? {});
          break;

        case 'client':
          if (!params?.clientid) return bad('clientid required');
          result = await client.client(params.clientid);
          break;

        case 'client_subscriptions':
          if (!params?.clientid) return bad('clientid required');
          result = await client.clientSubscriptions(params.clientid);
          break;

        case 'subscriptions':
          result = await client.page('/subscriptions', {
            page: params?.page,
            limit: params?.limit ?? 100,
            clientid: params?.clientid,
            topic: params?.topic,
            node: params?.node,
            qos: params?.qos,
            match_topic: params?.match_topic,
          });
          break;

        case 'topics':
          result = await client.page('/topics', {
            page: params?.page,
            limit: params?.limit ?? 100,
            topic: params?.topic,
            node: params?.node,
          });
          break;

        case 'metrics':
          result = await client.request('/metrics', { query: { aggregate: params?.aggregate } });
          break;

        case 'topic_metrics':
          result = await client.request('/topic_metrics');
          break;

        case 'rules':
          result = await client.page('/rules', { page: params?.page, limit: params?.limit ?? 100 });
          break;

        case 'bridges':
        case 'integrations':
          result = await client.integrations();
          break;

        case 'alarms': {
          const [active, historical] = await Promise.all([
            client.page('/alarms', { activated: true, limit: params?.limit ?? 100 }),
            client.page('/alarms', { activated: false, limit: 20 }),
          ]);
          result = { active, historical };
          break;
        }

        case 'banned':
          result = await client.page('/banned', { page: params?.page, limit: params?.limit ?? 100 });
          break;

        case 'retained':
          if (!params?.topic) return bad('topic required');
          result = { topic: params.topic, message: await client.retained(params.topic) };
          break;

        case 'publish': {
          if (!params?.topic || params?.payload === undefined) return bad('topic and payload required');
          const qos = Number(params.qos ?? 1);
          if (![0, 1, 2].includes(qos)) return bad('qos must be 0, 1 or 2');
          result = await client.publish({
            topic: params.topic,
            payload: params.payload,
            qos,
            retain: !!params.retain,
          });
          break;
        }

        case 'publish_bulk': {
          if (!Array.isArray(params?.messages) || params.messages.length === 0) {
            return bad('messages array required');
          }
          result = await client.publishBulk(params.messages);
          break;
        }

        case 'kickout':
          if (!params?.clientid) return bad('clientid required');
          result = await client.kickout(params.clientid);
          break;

        case 'kickout_bulk':
          if (!Array.isArray(params?.clientids) || params.clientids.length === 0) {
            return bad('clientids array required');
          }
          result = await client.kickoutBulk(params.clientids);
          break;

        default:
          return bad(`Unknown action: ${action}`);
      }

      return new Response(JSON.stringify({ success: true, data: result, config: configSummary }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (e) {
      if (e instanceof EmqxApiError) {
        const { reason, hint } = e.classified;
        console.warn('[emqx-monitoring] management API unavailable:', reason, e.httpStatus, e.code);
        return degraded(reason, hint, e.httpStatus, e.code);
      }
      throw e;
    }
  } catch (err) {
    console.error('[emqx-monitoring]', err);
    return new Response(JSON.stringify({ error: (err as Error).message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
