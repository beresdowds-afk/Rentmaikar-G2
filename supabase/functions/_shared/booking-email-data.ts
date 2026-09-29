// Shared helpers for booking-related transactional emails.
// Loads a booking request with its driver + vehicle, builds template data,
// and invokes the central send-transactional-email function.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

const SITE_URL = 'https://rentmaikar.com'

export interface BookingEmailPayload {
  ok: true
  status: string
  driverId: string
  recipientEmail: string
  startDateIso: string
  templateData: Record<string, unknown>
}

export type BookingEmailPreferenceKey = 'booking_confirmations' | 'booking_reminders'

/**
 * Per-user email preference check. Missing rows mean the defaults apply
 * (booking confirmations and reminders both ON). Errors fail open so a
 * preferences lookup problem never silently drops transactional mail.
 */
export async function isBookingEmailEnabled(
  supabase: SupabaseClient,
  userId: string,
  key: BookingEmailPreferenceKey,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('email_notification_preferences')
    .select(key)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    console.error('email preference lookup failed', { code: error.code, message: error.message })
    return true
  }
  if (!data) return true
  return (data as Record<string, unknown>)[key] !== false
}

export interface BookingEmailFailure {
  ok: false
  reason: string
}

function formatDate(value: string | null): string | undefined {
  if (!value) return undefined
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatRate(rate: number | null, currency: string | null): string | undefined {
  if (rate == null) return undefined
  const code = (currency || 'USD').toUpperCase()
  try {
    const formatted = new Intl.NumberFormat(code === 'NGN' ? 'en-NG' : 'en-US', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 0,
    }).format(rate)
    return `${formatted} / week`
  } catch {
    return `${code} ${rate} / week`
  }
}

export async function loadBookingEmailPayload(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<BookingEmailPayload | BookingEmailFailure> {
  const { data: booking, error } = await supabase
    .from('vehicle_booking_requests')
    .select('id, vehicle_id, driver_id, start_date, end_date, offered_rate, offer_currency, status')
    .eq('id', bookingId)
    .maybeSingle()

  if (error) {
    console.error('Failed to load booking request', { code: error.code, message: error.message })
    return { ok: false, reason: 'booking_lookup_failed' }
  }
  if (!booking) return { ok: false, reason: 'booking_not_found' }

  const [{ data: driver }, { data: vehicle }] = await Promise.all([
    supabase
      .from('profiles')
      .select('email, full_name')
      .eq('user_id', booking.driver_id)
      .maybeSingle(),
    supabase
      .from('vehicles')
      .select('make, model, year')
      .eq('id', booking.vehicle_id)
      .maybeSingle(),
  ])

  if (!driver?.email) return { ok: false, reason: 'driver_email_missing' }

  const vehicleName = vehicle
    ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')
    : undefined

  return {
    ok: true,
    status: booking.status,
    driverId: booking.driver_id,
    recipientEmail: driver.email,
    startDateIso: booking.start_date,
    templateData: {
      driverName: driver.full_name || undefined,
      vehicleName,
      startDate: formatDate(booking.start_date),
      endDate: formatDate(booking.end_date),
      rate: formatRate(booking.offered_rate, booking.offer_currency),
      bookingReference: String(booking.id).replace(/-/g, '').slice(0, 8).toUpperCase(),
      dashboardUrl: `${SITE_URL}/driver/dashboard`,
    },
  }
}

/**
 * Invoke the central transactional email sender with the service-role key.
 * Returns true when the email was accepted (queued), false otherwise.
 */
export async function sendBookingEmail(
  templateName: 'booking-confirmation' | 'booking-reminder',
  recipientEmail: string,
  idempotencyKey: string,
  templateData: Record<string, unknown>,
): Promise<boolean> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
    return false
  }

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        templateName,
        recipientEmail,
        idempotencyKey,
        templateData,
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      console.error('send-transactional-email rejected', { status: res.status, body })
      return false
    }
    return true
  } catch (err) {
    console.error('send-transactional-email call failed', { error: String(err) })
    return false
  }
}
