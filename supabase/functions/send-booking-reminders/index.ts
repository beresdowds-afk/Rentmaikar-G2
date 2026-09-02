// Hourly cron: emails a start-reminder to drivers whose accepted booking
// begins within the next 24 hours. Idempotent per booking + start date via
// the idempotency key passed to send-transactional-email.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { requireCronSecretAsync } from '../_shared/cron-auth.ts'
import { isBookingEmailEnabled, loadBookingEmailPayload, sendBookingEmail } from '../_shared/booking-email-data.ts'

function json(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const unauthorized = await requireCronSecretAsync(req)
  if (unauthorized) return unauthorized

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceKey)

  const now = new Date()
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  const { data: bookings, error } = await supabase
    .from('vehicle_booking_requests')
    .select('id, start_date')
    .eq('status', 'accepted')
    .gt('start_date', now.toISOString())
    .lte('start_date', in24h.toISOString())
    .order('start_date', { ascending: true })
    .limit(100)

  if (error) {
    console.error('Failed to query upcoming bookings', { code: error.code, message: error.message })
    return json({ error: 'Query failed' }, 500)
  }

  let sent = 0
  let skipped = 0
  let failed = 0

  for (const booking of bookings ?? []) {
    const payload = await loadBookingEmailPayload(supabase, booking.id)
    if (!payload.ok) {
      skipped++
      continue
    }

    const enabled = await isBookingEmailEnabled(supabase, payload.driverId, 'booking_reminders')
    if (!enabled) {
      skipped++
      continue
    }

    const start = new Date(payload.startDateIso)
    const hoursUntilStart = Math.max(
      1,
      Math.round((start.getTime() - now.getTime()) / (60 * 60 * 1000)),
    )

    const ok = await sendBookingEmail(
      'booking-reminder',
      payload.recipientEmail,
      `booking-reminder-${booking.id}-${payload.startDateIso.slice(0, 10)}`,
      { ...payload.templateData, hoursUntilStart },
    )
    if (ok) sent++
    else failed++
  }

  console.log('Booking reminders processed', {
    scanned: bookings?.length ?? 0,
    sent,
    skipped,
    failed,
  })

  return json({ success: true, scanned: bookings?.length ?? 0, sent, skipped, failed })
})
