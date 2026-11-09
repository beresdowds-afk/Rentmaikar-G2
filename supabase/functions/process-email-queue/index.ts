import { createClient } from 'npm:@supabase/supabase-js@2'
import { resendSendEmail } from '../_shared/resend-gateway.ts'
import { requireCronSecretAsync } from '../_shared/cron-auth.ts'

const MAX_RETRIES = 5
const DEFAULT_BATCH_SIZE = 10
const DEFAULT_SEND_DELAY_MS = 200
const DEFAULT_AUTH_TTL_MINUTES = 15
const DEFAULT_TRANSACTIONAL_TTL_MINUTES = 60

// --- Direct Resend Connector ---
// Outbound emails are dispatched directly via the Direct Resend connector
// to api.resend.com, with automatic verified sender domain rewriting.
const SENDER_DOMAIN = 'notify.rentmaikar.com'

class ProviderSendError extends Error {
  status: number
  retryAfterSeconds: number | null
  constructor(message: string, status: number, retryAfterSeconds: number | null = null) {
    super(message)
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
  }
}

// Send one message directly through the Direct Resend connector.
// The `from` domain is normalized onto the verified sending domain.
async function sendViaResend(payload: Record<string, unknown>): Promise<{ providerMessageId: string | null }> {
  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) {
    throw new Error('Direct Resend connector not configured (missing RESEND_API_KEY)')
  }

  const res = await resendSendEmail({
    from: String(payload.from ?? 'Rentmaikar <noreply@rentmaikar.com>'),
    to: [payload.to],
    subject: payload.subject,
    html: payload.html,
    ...(payload.text ? { text: payload.text } : {}),
  }, resendKey)

  if (!res.ok) {
    const bodyText = await res.text()
    const retryAfterHeader = res.headers.get('retry-after')
    const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : null
    throw new ProviderSendError(
      `Direct Resend send failed [${res.status}]: ${bodyText.slice(0, 500)}`,
      res.status,
      Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : null
    )
  }
  const receipt = await res.json().catch(() => ({})) as Record<string, unknown>
  const providerMessageId = typeof receipt.id === 'string'
    ? receipt.id
    : typeof receipt.email_id === 'string'
      ? receipt.email_id
      : null
  return { providerMessageId }
}

// Check if an error is a rate-limit (429) response.
// Uses EmailAPIError.status when available (email-js >=0.x with structured errors),
// falls back to parsing the error message for older versions.
function isRateLimited(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    return (error as { status: number }).status === 429
  }
  return error instanceof Error && error.message.includes('429')
}

// Check if an error is a forbidden (403) response. Retrying won't help.
// Move straight to DLQ.
function isForbidden(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    return (error as { status: number }).status === 403
  }
  return error instanceof Error && error.message.includes('403')
}

// Extract Retry-After seconds from a structured EmailAPIError, or default to 60s.
function getRetryAfterSeconds(error: unknown): number {
  if (error && typeof error === 'object' && 'retryAfterSeconds' in error) {
    return (error as { retryAfterSeconds: number | null }).retryAfterSeconds ?? 60
  }
  return 60
}

function parseJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length < 2) {
    return null
  }

  try {
    const payload = parts[1]
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=')

    return JSON.parse(atob(payload)) as Record<string, unknown>
  } catch {
    return null
  }
}

async function ensureOutboxRecord(
  supabase: ReturnType<typeof createClient>,
  queue: string,
  msg: { msg_id: number; message: Record<string, unknown> },
  ttlMinutes: number,
): Promise<string> {
  const payload = msg.message
  const messageId = typeof payload.message_id === 'string' && payload.message_id
    ? payload.message_id
    : `legacy-${queue}-${msg.msg_id}`
  payload.message_id = messageId
  const messageKey = typeof payload.idempotency_key === 'string' && payload.idempotency_key
    ? payload.idempotency_key
    : messageId
  const idempotencyKey = `email:${messageKey}`
  const { error } = await supabase.from('outbound_message_outbox').upsert({
    idempotency_key: idempotencyKey,
    channel: 'email',
    provider: 'resend',
    recipient: typeof payload.to === 'string' ? payload.to : 'unknown',
    template_reference: String(payload.label || queue),
    message_class: queue === 'auth_emails' ? 'authentication' : 'transactional',
    status: 'queued',
    max_attempts: queue === 'auth_emails' ? 1 : MAX_RETRIES,
    expires_at: new Date(Date.now() + ttlMinutes * 60_000).toISOString(),
    queue_name: queue,
    queue_message_id: msg.msg_id,
    payload,
  }, { onConflict: 'idempotency_key', ignoreDuplicates: true })
  if (error) throw new Error(`Failed to persist queued email before dispatch: ${error.message}`)
  return idempotencyKey
}

async function updateOutbox(
  supabase: ReturnType<typeof createClient>,
  idempotencyKey: string,
  update: Record<string, unknown>,
): Promise<void> {
  const { data, error } = await supabase
    .from('outbound_message_outbox')
    .update({ ...update, claimed_at: null, updated_at: new Date().toISOString() })
    .eq('idempotency_key', idempotencyKey)
    .select('id')
    .maybeSingle()
  if (error || !data) {
    throw new Error(`Failed to persist outbound email state: ${error?.message || 'message row not found'}`)
  }
}

// Move a message to the dead letter queue and log the reason.
async function moveToDlq(
  supabase: ReturnType<typeof createClient>,
  queue: string,
  msg: { msg_id: number; message: Record<string, unknown> },
  reason: string,
  correlationId?: string,
  finalStatus: 'dead_letter' | 'expired' = 'dead_letter'
): Promise<boolean> {
  const payload = msg.message
  try {
    const { error: logError } = await supabase.from('email_send_log').insert({
      message_id: payload.message_id,
      template_name: (payload.label || queue) as string,
      recipient_email: payload.to,
      status: 'dlq',
      error_message: reason,
      metadata: {
        correlation_id: correlationId,
        source_queue: queue,
        moved_at: new Date().toISOString(),
      },
    })
    if (logError) throw new Error(`Failed to log email dead-letter event: ${logError.message}`)
    const { error } = await supabase.rpc('move_to_dlq', {
      source_queue: queue,
      dlq_name: `${queue}_dlq`,
      message_id: msg.msg_id,
      payload,
    })
    if (error) {
      console.error('Failed to move message to DLQ', {
        queue,
        msg_id: msg.msg_id,
        correlation_id: correlationId,
        reason,
        code: error.code,
        message: error.message,
      })
      return false
    }
    const messageKey = typeof payload.idempotency_key === 'string' && payload.idempotency_key
      ? payload.idempotency_key
      : String(payload.message_id)
    await updateOutbox(supabase, `email:${messageKey}`, {
      status: finalStatus,
      last_error: reason,
      next_attempt_at: new Date().toISOString(),
    })
    return true
  } catch (err: any) {
    console.error('moveToDlq unhandled exception', {
      queue,
      msg_id: msg.msg_id,
      correlation_id: correlationId,
      error: err?.message || err,
    })
    return false
  }
}

Deno.serve(async (req) => {
  try {
    return await handleRequest(req)
  } catch (error) {
    // Never let an uncaught exception terminate the isolate: the edge gateway
    // reports that as a 502 and the cron run is lost with no diagnostics.
    const message = error instanceof Error ? error.message : String(error)
    console.error('process-email-queue crashed', { error: message })
    return new Response(
      JSON.stringify({ error: 'Queue processing failed', detail: message.slice(0, 500) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

async function handleRequest(req: Request): Promise<Response> {
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceKey || !resendKey) {
    console.error('Missing required environment variables (need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and RESEND_API_KEY)')
    return new Response(
      JSON.stringify({ error: 'Server configuration error: missing Direct Resend credentials' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const authDenied = await requireCronSecretAsync(req)
  if (authDenied) {
    return authDenied
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  console.log('Email provider selected: Direct Resend connector', {
    provider: 'resend-direct',
    sender_domain: SENDER_DOMAIN,
  })

  // 1. Check rate-limit cooldown and read queue config
  const { data: state } = await supabase
    .from('email_send_state')
    .select('retry_after_until, batch_size, send_delay_ms, auth_email_ttl_minutes, transactional_email_ttl_minutes')
    .single()

  if (state?.retry_after_until && new Date(state.retry_after_until) > new Date()) {
    return new Response(
      JSON.stringify({ skipped: true, reason: 'rate_limited' }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  }

  const batchSize = state?.batch_size ?? DEFAULT_BATCH_SIZE
  const sendDelayMs = state?.send_delay_ms ?? DEFAULT_SEND_DELAY_MS
  const ttlMinutes: Record<string, number> = {
    auth_emails: Math.min(15, Math.max(1, state?.auth_email_ttl_minutes ?? DEFAULT_AUTH_TTL_MINUTES)),
    transactional_emails: Math.min(1440, Math.max(1, state?.transactional_email_ttl_minutes ?? DEFAULT_TRANSACTIONAL_TTL_MINUTES)),
  }

  const correlationId = req.headers.get('x-correlation-id') || crypto.randomUUID()
  let totalProcessed = 0
  let totalFailed = 0
  let totalDlq = 0

  // 2. Process auth_emails first (priority), then transactional_emails
  for (const queue of ['auth_emails', 'transactional_emails']) {
    const { data: messages, error: readError } = await supabase.rpc('read_email_batch', {
      queue_name: queue,
      batch_size: batchSize,
      vt: 30,
    })

    if (readError) {
      console.error('Failed to read email batch', {
        queue,
        correlation_id: correlationId,
        code: readError.code,
        message: readError.message,
      })
      totalFailed++
      continue
    }

    if (!messages?.length) continue

    // Retry budget is based on real send failures, not pgmq read_ct.
    // read_ct increments for every message in a claimed batch, including
    // messages not attempted when a 429 stops processing early.
    const messageIds = Array.from(
      new Set(
        messages
          .map((msg) =>
            msg?.message?.message_id && typeof msg.message.message_id === 'string'
              ? msg.message.message_id
              : null
          )
          .filter((id): id is string => Boolean(id))
      )
    )
    const failedAttemptsByMessageId = new Map<string, number>()
    if (messageIds.length > 0) {
      const { data: failedRows, error: failedRowsError } = await supabase
        .from('email_send_log')
        .select('message_id')
        .in('message_id', messageIds)
        .eq('status', 'failed')

      if (failedRowsError) {
        console.error('Failed to load failed-attempt counters', {
          queue,
          correlation_id: correlationId,
          code: failedRowsError.code,
          message: failedRowsError.message,
        })
      } else {
        for (const row of failedRows ?? []) {
          const messageId = row?.message_id
          if (typeof messageId !== 'string' || !messageId) continue
          failedAttemptsByMessageId.set(
            messageId,
            (failedAttemptsByMessageId.get(messageId) ?? 0) + 1
          )
        }
      }
    }

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      const payload = msg.message
      const outboxKey = await ensureOutboxRecord(supabase, queue, msg, ttlMinutes[queue])
      const maxRetries = queue === 'auth_emails' ? 1 : MAX_RETRIES
      const failedAttempts =
        payload?.message_id && typeof payload.message_id === 'string'
          ? (failedAttemptsByMessageId.get(payload.message_id) ?? 0)
          : msg.read_ct ?? 0

      // Drop expired messages (TTL exceeded).
      // Prefer payload.queued_at when present; fall back to PGMQ's enqueued_at
      // which is always set by the queue.
      const queuedAt = payload.queued_at ?? msg.enqueued_at
      if (queuedAt) {
        const ageMs = Date.now() - new Date(queuedAt).getTime()
        const maxAgeMs = ttlMinutes[queue] * 60 * 1000
        if (ageMs > maxAgeMs) {
          console.warn('Email expired (TTL exceeded)', {
            queue,
            msg_id: msg.msg_id,
            correlation_id: correlationId,
            queued_at: queuedAt,
            ttl_minutes: ttlMinutes[queue],
          })
          const moved = await moveToDlq(
            supabase,
            queue,
            msg,
            `TTL exceeded (${ttlMinutes[queue]} minutes)`,
            correlationId,
            'expired'
          )
          if (moved) totalDlq++
          else totalFailed++
          continue
        }
      }

      // Move to DLQ if max failed send attempts reached.
      if (failedAttempts >= maxRetries) {
        const moved = await moveToDlq(
          supabase,
          queue,
          msg,
          `Max retries (${MAX_RETRIES}) exceeded (attempted ${failedAttempts} times)`,
          correlationId
        )
        if (moved) totalDlq++
        else totalFailed++
        continue
      }

      // Guard: skip if another worker already sent this message (VT expired race)
      if (payload.message_id) {
        const { data: alreadySent } = await supabase
          .from('email_send_log')
          .select('id')
          .eq('message_id', payload.message_id)
          .eq('status', 'sent')
          .maybeSingle()

        if (alreadySent) {
          console.warn('Skipping duplicate send (already sent)', {
            queue,
            msg_id: msg.msg_id,
            message_id: payload.message_id,
            correlation_id: correlationId,
          })
          const { error: dupDelError } = await supabase.rpc('delete_email', {
            queue_name: queue,
            message_id: msg.msg_id,
          })
          if (dupDelError) {
            console.error('Failed to delete duplicate message from queue', {
              queue,
              msg_id: msg.msg_id,
              correlation_id: correlationId,
              code: dupDelError.code,
              message: dupDelError.message,
            })
            totalFailed++
          }
          await updateOutbox(supabase, outboxKey, { status: 'accepted', last_error: null })
          continue
        }
      }

      const { data: claimed, error: claimError } = await supabase.rpc('claim_outbound_message', {
        _idempotency_key: outboxKey,
      })
      if (claimError) throw new Error(`Failed to claim queued email: ${claimError.message}`)
      if (!claimed) {
        const { data: outboxState, error: outboxStateError } = await supabase
          .from('outbound_message_outbox')
          .select('status, attempt_count, max_attempts, last_error')
          .eq('idempotency_key', outboxKey)
          .maybeSingle()
        if (outboxStateError) throw new Error(`Failed to inspect outbound email state: ${outboxStateError.message}`)
        if (
          outboxState?.status === 'failed' &&
          outboxState.attempt_count >= outboxState.max_attempts
        ) {
          const moved = await moveToDlq(
            supabase,
            queue,
            msg,
            outboxState.last_error || `Maximum retries (${outboxState.max_attempts}) exhausted`,
            correlationId,
          )
          if (moved) totalDlq++
          else totalFailed++
          continue
        }
        if (outboxState && ['accepted', 'delivered', 'simulated', 'suppressed', 'dead_letter', 'expired'].includes(outboxState.status)) {
          const { error: deleteError } = await supabase.rpc('delete_email', {
            queue_name: queue,
            message_id: msg.msg_id,
          })
          if (deleteError) throw new Error(`Failed to remove terminal email from queue: ${deleteError.message}`)
        }
        continue
      }

      let providerAccepted = false
      let providerMessageId: string | null = null
      try {
        const receipt = await sendViaResend(payload)
        providerAccepted = true
        providerMessageId = receipt.providerMessageId
        await updateOutbox(supabase, outboxKey, {
          status: 'accepted',
          provider: 'resend',
          provider_message_id: providerMessageId,
          last_error: null,
        })

        // Log success
        const { error: sendLogError } = await supabase.from('email_send_log').insert({
          message_id: payload.message_id,
          template_name: payload.label || queue,
          recipient_email: payload.to,
          status: 'sent',
          metadata: {
            provider: 'resend-direct',
            provider_message_id: providerMessageId,
            idempotency_key: typeof payload.idempotency_key === 'string'
              ? payload.idempotency_key
              : payload.message_id,
            correlation_id: correlationId,
          },
        })
        if (sendLogError) {
          console.error('Provider accepted email but send-log persistence failed', {
            message_id: payload.message_id,
            provider_message_id: providerMessageId,
            error: sendLogError.message,
          })
          totalFailed++
        }

        // Delete from queue
        const { error: delError } = await supabase.rpc('delete_email', {
          queue_name: queue,
          message_id: msg.msg_id,
        })
        if (delError) {
          console.error('Failed to delete sent message from queue', {
            queue,
            msg_id: msg.msg_id,
            correlation_id: correlationId,
            code: delError.code,
            message: delError.message,
          })
          totalFailed++
        }
        totalProcessed++
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        if (providerAccepted) {
          console.error('Provider accepted email but receipt persistence failed; queue retry suppressed', {
            message_id: payload.message_id,
            provider_message_id: providerMessageId,
            correlation_id: correlationId,
            error: errorMsg,
          })
          const { error: logError } = await supabase.from('email_send_log').insert({
            message_id: payload.message_id,
            template_name: payload.label || queue,
            recipient_email: payload.to,
            status: 'sent',
            metadata: {
              provider: 'resend-direct',
              provider_message_id: providerMessageId,
              idempotency_key: typeof payload.idempotency_key === 'string'
                ? payload.idempotency_key
                : payload.message_id,
              correlation_id: correlationId,
              receipt_persistence_failed: true,
            },
          })
          if (logError) console.error('Accepted email receipt could not be recorded', { error: logError.message })
          const { error: deleteError } = await supabase.rpc('delete_email', {
            queue_name: queue,
            message_id: msg.msg_id,
          })
          if (deleteError) console.error('Failed to remove accepted message from queue', { error: deleteError.message })
          totalFailed++
          continue
        }
        console.error('Email send failed', {
          queue,
          msg_id: msg.msg_id,
          read_ct: msg.read_ct,
          failed_attempts: failedAttempts,
          correlation_id: correlationId,
          error: errorMsg,
        })

        if (isRateLimited(error)) {
          await updateOutbox(supabase, outboxKey, {
            status: 'failed',
            last_error: errorMsg.slice(0, 1000),
            next_attempt_at: new Date(Date.now() + getRetryAfterSeconds(error) * 1000).toISOString(),
          })
          const { error: rateLimitLogError } = await supabase.from('email_send_log').insert({
            message_id: payload.message_id,
            template_name: payload.label || queue,
            recipient_email: payload.to,
            status: 'rate_limited',
            error_message: errorMsg.slice(0, 1000),
            metadata: { correlation_id: correlationId },
          })
          if (rateLimitLogError) throw new Error(`Failed to persist rate-limited email attempt: ${rateLimitLogError.message}`)

          const retryAfterSecs = getRetryAfterSeconds(error)
          await supabase
            .from('email_send_state')
            .update({
              retry_after_until: new Date(
                Date.now() + retryAfterSecs * 1000
              ).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', 1)

          // Stop processing — remaining messages stay in queue (VT expires, retried next cycle)
          return new Response(
            JSON.stringify({
              status: 'rate_limited',
              processed: totalProcessed,
              failed: totalFailed,
              dlq_transfers: totalDlq,
              stopped: 'rate_limited',
              correlation_id: correlationId,
            }),
            { headers: { 'Content-Type': 'application/json', 'X-Correlation-ID': correlationId } }
          )
        }

        // 403 indicates authentication or domain-verification failure in Resend.
        // If repeated (failed attempts >= 3), route to DLQ to avoid loop.
        if (isForbidden(error) && failedAttempts >= 3) {
          const moved = await moveToDlq(supabase, queue, msg, errorMsg.slice(0, 1000), correlationId)
          if (moved) totalDlq++
          else totalFailed++
          return new Response(
            JSON.stringify({
              status: 'forbidden',
              processed: totalProcessed,
              failed: totalFailed,
              dlq_transfers: totalDlq,
              stopped: 'forbidden',
              correlation_id: correlationId,
            }),
            { headers: { 'Content-Type': 'application/json', 'X-Correlation-ID': correlationId } }
          )
        }

        // Log non-429 failures to track real retry attempts.
        const { error: failureLogError } = await supabase.from('email_send_log').insert({
          message_id: payload.message_id,
          template_name: payload.label || queue,
          recipient_email: payload.to,
          status: 'failed',
          error_message: errorMsg.slice(0, 1000),
          metadata: { correlation_id: correlationId },
        })
        if (failureLogError) {
          console.error('Failed to persist email provider failure', {
            message_id: payload.message_id,
            error: failureLogError.message,
          })
        }
        await updateOutbox(supabase, outboxKey, {
          status: 'failed',
          last_error: errorMsg.slice(0, 1000),
          next_attempt_at: new Date(
            Date.now() + Math.min(60_000 * 2 ** failedAttempts, 6 * 60 * 60_000)
          ).toISOString(),
        })
        if (payload?.message_id && typeof payload.message_id === 'string') {
          failedAttemptsByMessageId.set(payload.message_id, failedAttempts + 1)
        }

        totalFailed++
      }

      // Small delay between sends to smooth bursts
      if (i < messages.length - 1) {
        await new Promise((r) => setTimeout(r, sendDelayMs))
      }
    }
  }

  const isDegraded = totalFailed > 0
  return new Response(
    JSON.stringify({
      status: isDegraded ? 'degraded' : 'ok',
      processed: totalProcessed,
      failed: totalFailed,
      dlq_transfers: totalDlq,
      provider: 'resend-direct',
      correlation_id: correlationId,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Correlation-ID': correlationId },
    }
  )
}
