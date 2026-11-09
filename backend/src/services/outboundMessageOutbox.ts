import { randomUUID } from "node:crypto";

export type OutboundMessageChannel = "email" | "sms" | "whatsapp";
export type OutboundMessageClass = "authentication" | "transactional" | "operational";
export type OutboundMessageStatus =
  | "queued"
  | "dispatching"
  | "accepted"
  | "delivered"
  | "simulated"
  | "failed"
  | "dead_letter"
  | "suppressed"
  | "expired";

export interface OutboundMessagePool {
  query(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }>;
}

export interface EnqueueOutboundMessage {
  idempotencyKey?: string;
  channel: OutboundMessageChannel;
  provider?: string;
  recipient: string;
  templateReference?: string;
  messageClass: OutboundMessageClass;
  maxAttempts?: number;
  expiresAt?: Date | null;
  payload: Record<string, unknown>;
}

export interface ClaimedOutboundMessage {
  id: string;
  idempotencyKey: string;
  status: OutboundMessageStatus;
  attemptCount: number;
  provider?: string;
  providerMessageId?: string;
  lastError?: string;
  duplicate: boolean;
  claimed: boolean;
}

export function retryDelayMs(attempt: number, baseMs = 60_000, maxMs = 6 * 60 * 60_000): number {
  const safeAttempt = Math.max(1, Math.floor(attempt));
  return Math.min(baseMs * 2 ** (safeAttempt - 1), maxMs);
}

export async function enqueueAndClaimOutboundMessage(
  pool: OutboundMessagePool,
  message: EnqueueOutboundMessage,
): Promise<ClaimedOutboundMessage> {
  const idempotencyKey = message.idempotencyKey?.trim() || randomUUID();
  const maxAttempts = message.messageClass === "authentication"
    ? 1
    : Math.max(1, Math.min(message.maxAttempts ?? 5, 10));
  const expiresAt = message.expiresAt ??
    (message.messageClass === "authentication" ? new Date(Date.now() + 5 * 60_000) : null);

  const inserted = await pool.query(
    `INSERT INTO public.outbound_message_outbox (
       idempotency_key, channel, provider, recipient, template_reference,
       message_class, status, max_attempts, expires_at, payload, next_attempt_at
     ) VALUES ($1, $2, $3, $4, $5, $6, 'queued', $7, $8, $9::jsonb, now())
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id, idempotency_key, status, attempt_count, provider, provider_message_id, last_error`,
    [
      idempotencyKey,
      message.channel,
      message.provider ?? null,
      message.recipient,
      message.templateReference ?? null,
      message.messageClass,
      maxAttempts,
      expiresAt?.toISOString() ?? null,
      JSON.stringify(message.payload),
    ],
  );

  const claimed = await pool.query(
    `UPDATE public.outbound_message_outbox
        SET status = 'dispatching',
            attempt_count = attempt_count + 1,
            last_attempt_at = now(),
            claimed_at = now(),
            updated_at = now()
      WHERE idempotency_key = $1
        AND status = 'queued'
        AND next_attempt_at <= now()
        AND (expires_at IS NULL OR expires_at > now())
        AND attempt_count < max_attempts
      RETURNING id, idempotency_key, status, attempt_count, provider, provider_message_id, last_error`,
    [idempotencyKey],
  );

  if (claimed.rows[0]) {
    return { ...mapRow(claimed.rows[0]), duplicate: inserted.rows.length === 0, claimed: true };
  }

  const existing = inserted.rows[0] ?? (await pool.query(
    `SELECT id, idempotency_key, status, attempt_count, provider, provider_message_id, last_error
       FROM public.outbound_message_outbox
      WHERE idempotency_key = $1`,
    [idempotencyKey],
  )).rows[0];
  if (!existing) throw new Error("Outbound message persistence failed: row not found after enqueue.");
  return { ...mapRow(existing), duplicate: true, claimed: false };
}

export async function updateOutboundMessage(
  pool: OutboundMessagePool,
  idempotencyKey: string,
  update: {
    status: OutboundMessageStatus;
    provider?: string;
    providerMessageId?: string;
    lastError?: string | null;
    nextAttemptAt?: Date;
    deliveredAt?: Date;
  },
): Promise<void> {
  const result = await pool.query(
    `UPDATE public.outbound_message_outbox
        SET status = $2,
            provider = COALESCE($3, provider),
            provider_message_id = COALESCE($4, provider_message_id),
            last_error = $5,
            next_attempt_at = COALESCE($6, next_attempt_at),
            delivered_at = COALESCE($7, delivered_at),
            claimed_at = NULL,
            updated_at = now()
      WHERE idempotency_key = $1`,
    [
      idempotencyKey,
      update.status,
      update.provider ?? null,
      update.providerMessageId ?? null,
      update.lastError ?? null,
      update.nextAttemptAt?.toISOString() ?? null,
      update.deliveredAt?.toISOString() ?? null,
    ],
  );
  if (result.rowCount !== 1) {
    throw new Error("Outbound message state update failed: persisted row was not updated.");
  }
}

export async function requeueOutboundMessage(
  pool: OutboundMessagePool,
  idempotencyKey: string,
): Promise<void> {
  const result = await pool.query(
    `UPDATE public.outbound_message_outbox
        SET status = 'queued',
            next_attempt_at = now(),
            last_error = NULL,
            claimed_at = NULL,
            updated_at = now()
      WHERE idempotency_key = $1
        AND status IN ('failed', 'dead_letter')
        AND attempt_count < max_attempts
        AND (expires_at IS NULL OR expires_at > now())`,
    [idempotencyKey],
  );
  if (result.rowCount !== 1) {
    throw new Error("Outbound message cannot be reprocessed: state is terminal, expired, or retry limit reached.");
  }
}

function mapRow(row: Record<string, unknown>): ClaimedOutboundMessage {
  return {
    id: String(row.id),
    idempotencyKey: String(row.idempotency_key),
    status: row.status as OutboundMessageStatus,
    attemptCount: Number(row.attempt_count ?? 0),
    provider: typeof row.provider === "string" ? row.provider : undefined,
    providerMessageId: typeof row.provider_message_id === "string"
      ? row.provider_message_id
      : undefined,
    lastError: typeof row.last_error === "string" ? row.last_error : undefined,
    duplicate: false,
    claimed: false,
  };
}
