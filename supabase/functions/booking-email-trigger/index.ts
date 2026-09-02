// Sends the booking-confirmation transactional email for a booking request
// that just transitioned to "accepted". Called by the database trigger
// trg_booking_accepted_email via pg_net (x-cron-secret) — never by the browser.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { requireCronSecretAsync } from '../_shared/cron-auth.ts'
import { isBookingEmailEnabled, loadBookingEmailPayload, sendBookingEmail } from '../_shared/booking-email-data.ts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const unauthorized = await requireCronSecretAsync(req)
  if (unauthorized) return unauthorized

  let bookingId: unknown
  try {
    const body = await req.json()
    bookingId = body?.booking_id
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  if (typeof bookingId !== 'string' || !UUID_RE.test(bookingId)) {
    return json({ error: 'booking_id must be a UUID' }, 400)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceKey)

  const payload = await loadBookingEmailPayload(supabase, bookingId)
  if (!payload.ok) {
    return json({ success: false, reason: payload.reason })
  }
  if (payload.status !== 'accepted') {
    // Stale trigger delivery or status changed since — do not email.
    return json({ success: false, reason: 'booking_not_accepted' })
  }

  const enabled = await isBookingEmailEnabled(supabase, payload.driverId, 'booking_confirmations')
  if (!enabled) {
    return json({ success: false, reason: 'preference_disabled' })
  }

  const sent = await sendBookingEmail(
    'booking-confirmation',
    payload.recipientEmail,
    `booking-confirmation-${bookingId}`,
    payload.templateData,
  )

  return json({ success: sent })
})
