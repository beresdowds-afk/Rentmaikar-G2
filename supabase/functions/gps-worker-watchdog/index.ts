// gps-worker-watchdog — detects stalled GPS/telemetry ingestion workers and
// raises admin_notifications. Runs on a 5-minute pg_cron schedule
// (x-cron-secret) and can also be triggered manually by an admin JWT.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { requireCronSecretAsync } from '../_shared/cron-auth.ts'

interface WorkerSpec {
  source: string
  label: string
  stallAfterMinutes: number
}

const EXPECTED_WORKERS: WorkerSpec[] = [
  { source: 'sarekon_location_worker', label: 'GPSANDTRACK location worker', stallAfterMinutes: 5 },
  { source: 'mqtt_worker', label: 'MQTT ingestion worker', stallAfterMinutes: 5 },
]

const DEDUPE_MINUTES = 60

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)

  // Cron secret OR an authenticated admin may run the watchdog.
  if (req.headers.get('x-cron-secret')) {
    const denied = await requireCronSecretAsync(req)
    if (denied) return denied
  } else {
    const auth = req.headers.get('authorization') ?? ''
    if (!auth.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: auth } },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'Unauthorized' }, 401)
    const { data: roleRow } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle()
    if (!roleRow) return json({ error: 'Admin access required' }, 403)
  }

  const now = Date.now()
  const results: Array<Record<string, unknown>> = []

  for (const worker of EXPECTED_WORKERS) {
    const { data: lastRun } = await admin
      .from('telemetry_ingest_runs')
      .select('created_at, error, devices_seen, events_processed')
      .eq('source', worker.source)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const lastRunAt = lastRun?.created_at ? new Date(lastRun.created_at).getTime() : null
    const ageMinutes = lastRunAt ? (now - lastRunAt) / 60_000 : null
    const stalled = lastRunAt === null || ageMinutes! > worker.stallAfterMinutes

    const result: Record<string, unknown> = {
      source: worker.source,
      label: worker.label,
      stalled,
      last_run_at: lastRun?.created_at ?? null,
      age_minutes: ageMinutes === null ? null : Math.round(ageMinutes * 10) / 10,
      notified: 0,
    }

    if (stalled) {
      const { data: admins } = await admin
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin')

      const dedupeSince = new Date(now - DEDUPE_MINUTES * 60_000).toISOString()
      let notified = 0

      for (const a of admins ?? []) {
        const { data: existing } = await admin
          .from('admin_notifications')
          .select('id')
          .eq('recipient_id', a.user_id)
          .eq('kind', 'gps_worker_stall')
          .eq('metadata->>source', worker.source)
          .gte('created_at', dedupeSince)
          .limit(1)
        if (existing && existing.length > 0) continue

        const { error } = await admin.from('admin_notifications').insert({
          recipient_id: a.user_id,
          kind: 'gps_worker_stall',
          title: `${worker.label} stalled`,
          body:
            ageMinutes === null
              ? `No runs have ever been recorded for ${worker.label} (${worker.source}). Check the cron schedule and worker deployment.`
              : `No successful run in ${Math.round(ageMinutes)} minutes (threshold: ${worker.stallAfterMinutes} min). Last error: ${lastRun?.error ?? 'none reported'}.`,
          metadata: {
            source: worker.source,
            last_run_at: lastRun?.created_at ?? null,
            age_minutes: ageMinutes,
            stall_after_minutes: worker.stallAfterMinutes,
          },
          email_opt_in: false,
        })
        if (!error) notified++
      }
      result.notified = notified
    }

    results.push(result)
  }

  console.log('gps-worker-watchdog', JSON.stringify(results))
  return json({ success: true, checked_at: new Date(now).toISOString(), workers: results })
})
