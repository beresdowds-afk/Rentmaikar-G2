/**
 * Durable webhook idempotency using a database-enforced provider/event identity.
 * The database is authoritative: a database error fails closed, never falling
 * back to instance-local memory. Raw request bodies and secret headers are not
 * copied into the webhook audit record.
 */

import crypto from 'crypto';
import { getSupabase } from './supabaseClient';

export interface WebhookDeduplicationResult {
  isDuplicate: boolean;
  recordId?: string;
  source: 'database';
}

function isUniqueViolation(error: { code?: string; message?: string }): boolean {
  return error.code === '23505' || /duplicate key|unique constraint/i.test(error.message || '');
}

async function reclaimFailedEvent(platform: string, eventId: string): Promise<WebhookDeduplicationResult> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('marketing_webhooks')
    .update({ processing_status: 'pending', error_message: null })
    .eq('platform', platform)
    .eq('provider_event_id', eventId)
    .eq('processing_status', 'failed')
    .select('id')
    .maybeSingle();
  if (error) throw new Error('Webhook retry claim failed');
  if (data?.id) return { isDuplicate: false, recordId: data.id, source: 'database' };
  return { isDuplicate: true, source: 'database' };
}

export async function claimWebhookEventDurable(
  platform: string,
  eventId: string,
  payload?: unknown,
  _headers?: Record<string, string>
): Promise<WebhookDeduplicationResult> {
  const normalizedPlatform = String(platform || '').toLowerCase().trim();
  const normalizedEventId = String(eventId || '').trim();
  if (!normalizedPlatform || !normalizedEventId || normalizedEventId.length > 255) {
    throw new Error('A valid provider event identity is required');
  }

  // This digest supports audit correlation without persisting webhook PII or secrets.
  const payloadHash = crypto.createHash('sha256').update(JSON.stringify(payload ?? null)).digest('hex');
  const eventType = payload && typeof payload === 'object'
    ? String((payload as Record<string, unknown>).type || (payload as Record<string, unknown>).event_name || 'webhook_event').slice(0, 100)
    : 'webhook_event';
  const supabase = getSupabase();
  const { data: inserted, error } = await supabase
    .from('marketing_webhooks')
    .insert({
      platform: normalizedPlatform,
      provider_event_id: normalizedEventId,
      payload_sha256: payloadHash,
      event_type: eventType,
      signature_verified: true,
      headers: {},
      payload: {},
      processing_status: 'pending',
    })
    .select('id')
    .maybeSingle();

  if (!error && inserted?.id) {
    return { isDuplicate: false, recordId: inserted.id, source: 'database' };
  }
  if (error && !isUniqueViolation(error)) {
    // No unsafe memory fallback: return failure so the webhook can be retried.
    throw new Error('Durable webhook claim unavailable');
  }
  if (error && isUniqueViolation(error)) return reclaimFailedEvent(normalizedPlatform, normalizedEventId);

  return { isDuplicate: true, source: 'database' };
}

export async function markWebhookStatus(
  recordId: string | undefined,
  status: 'processed' | 'failed' | 'ignored',
  errorMessage?: string
): Promise<void> {
  if (!recordId) return;
  const supabase = getSupabase();
  const { error } = await supabase
    .from('marketing_webhooks')
    .update({
      processing_status: status,
      // Do not write exception text, payload fragments, or credentials into the audit table.
      error_message: errorMessage ? 'Webhook processing failed' : null,
    })
    .eq('id', recordId);
  if (error) throw new Error('Unable to persist webhook processing status');
}
