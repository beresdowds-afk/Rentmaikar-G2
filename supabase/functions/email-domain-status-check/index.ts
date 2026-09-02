// email-domain-status-check — watches notify.rentmaikar.com DNS delegation and
// confirms the branded auth email templates are actively sending. Runs every
// 30 minutes via pg_cron (x-cron-secret) and can be triggered manually by an
// admin JWT. State transitions are recorded in platform_kv_settings and pushed
// to admin_notifications exactly once.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { requireCronSecretAsync } from '../_shared/cron-auth.ts'

const EMAIL_DOMAIN = 'notify.rentmaikar.com'
const EXPECTED_NS = ['ns3.lovable.cloud', 'ns4.lovable.cloud']
const KV_KEY = 'email_domain_status'
const AUTH_TEMPLATE_NAMES = ['signup', 'magiclink', 'recovery', 'invite', 'email_change', 'reauthentication']

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

async function resolveNsRecords(name: string): Promise<string[]> {
  try {
    const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=NS`)
    if (!res.ok) return []
    const data = await res.json()
    return (data.Answer ?? [])
      .filter((a: { type?: number }) => a.type === 2)
      .map((a: { data?: string }) => (a.data ?? '').replace(/\.$/, '').toLowerCase())
  } catch {
    return []
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)

  // Cron secret OR an authenticated admin may run the check.
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

  const now = new Date()

  // 1. DNS delegation check
  const nsRecords = await resolveNsRecords(EMAIL_DOMAIN)
  const dnsVerified = EXPECTED_NS.every((ns) => nsRecords.includes(ns))

  // 2. Branded auth template usage: branded emails only flow when the
  //    auth-email-hook enqueues them — those sends are recorded in
  //    email_send_log under the auth action types.
  const { data: brandedRows } = await admin
    .from('email_send_log')
    .select('template_name, status, created_at')
    .in('template_name', AUTH_TEMPLATE_NAMES)
    .in('status', ['sent', 'delivered'])
    .order('created_at', { ascending: false })
    .limit(1)
  const brandedActive = (brandedRows?.length ?? 0) > 0
  const lastBrandedSend = brandedRows?.[0] ?? null

  // 3. Load previous state
  const { data: kvRow } = await admin
    .from('platform_kv_settings')
    .select('value')
    .eq('key', KV_KEY)
    .maybeSingle()
  const prev = (kvRow?.value ?? {}) as Record<string, unknown>

  const state = {
    domain: EMAIL_DOMAIN,
    dns_verified: dnsVerified,
    dns_verified_at: dnsVerified
      ? (prev.dns_verified_at ?? now.toISOString())
      : null,
    ns_records_seen: nsRecords,
    branded_templates_active: brandedActive,
    branded_first_seen_at: brandedActive
      ? (prev.branded_first_seen_at ?? lastBrandedSend?.created_at ?? now.toISOString())
      : null,
    last_checked_at: now.toISOString(),
    dns_notified_at: prev.dns_notified_at ?? null,
    branded_notified_at: prev.branded_notified_at ?? null,
  }

  const notifications: Array<{ title: string; body: string; flag: 'dns_notified_at' | 'branded_notified_at' }> = []

  if (dnsVerified && !prev.dns_notified_at) {
    notifications.push({
      flag: 'dns_notified_at',
      title: `Email domain ${EMAIL_DOMAIN} DNS verified`,
      body:
        `DNS delegation for ${EMAIL_DOMAIN} now resolves to Lovable nameservers (${nsRecords.join(', ') || 'n/a'}). ` +
        (brandedActive
          ? 'Branded auth email templates are confirmed active and sending.'
          : 'Branded auth email templates will activate automatically; the first branded send will be confirmed separately.'),
    })
  }

  if (dnsVerified && brandedActive && !prev.branded_notified_at) {
    notifications.push({
      flag: 'branded_notified_at',
      title: 'Branded auth emails confirmed active',
      body:
        `The branded Rentmaikar auth email templates are live on ${EMAIL_DOMAIN}. ` +
        `Most recent branded send: ${lastBrandedSend?.template_name ?? 'unknown'} at ${lastBrandedSend?.created_at ?? 'unknown'}.`,
    })
  }

  if (notifications.length > 0) {
    const { data: admins } = await admin.from('user_roles').select('user_id').eq('role', 'admin')
    for (const n of notifications) {
      for (const a of admins ?? []) {
        await admin.from('admin_notifications').insert({
          recipient_id: a.user_id,
          kind: 'email_domain_status',
          title: n.title,
          body: n.body,
          metadata: { domain: EMAIL_DOMAIN, ns_records: nsRecords, branded_active: brandedActive },
          email_opt_in: false,
        })
      }
      ;(state as Record<string, unknown>)[n.flag] = now.toISOString()
    }
  }

  await admin
    .from('platform_kv_settings')
    .upsert({ key: KV_KEY, value: state }, { onConflict: 'key' })

  console.log('email-domain-status-check', JSON.stringify(state))
  return json({ success: true, ...state, notified: notifications.length })
})
