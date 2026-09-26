/**
 * Durable Webhook Idempotency Engine for RentMaikar Marketing Engine
 * Replaces ephemeral in-memory Sets with PostgreSQL / Supabase durable state
 * Survives Cloud Run container restarts, cold starts, and horizontal scaling.
 */

import { getSupabase } from './supabaseClient';

export interface WebhookDeduplicationResult {
  isDuplicate: boolean;
  recordId?: string;
  source: 'database' | 'memory_fallback';
}

// In-memory fallback LRU cache (used ONLY if database is temporarily unreachable)
const fallbackCache = new Map<string, number>();
const MAX_FALLBACK_CACHE = 2000;
const DEDUPLICATION_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

function recordToFallback(key: string): boolean {
  const now = Date.now();
  const existing = fallbackCache.get(key);
  if (existing && now - existing < DEDUPLICATION_WINDOW_MS) {
    return true; // Duplicate in fallback
  }

  if (fallbackCache.size >= MAX_FALLBACK_CACHE) {
    const oldestKey = fallbackCache.keys().next().value;
    if (oldestKey) fallbackCache.delete(oldestKey);
  }

  fallbackCache.set(key, now);
  return false;
}

/**
 * Durably claims an incoming webhook event.
 * Uses atomic conflict handling against `marketing_webhooks`.
 * Returns `isDuplicate: true` if the event has already been registered or processed.
 */
export async function claimWebhookEventDurable(
  platform: string,
  eventId: string,
  payload?: any,
  headers?: Record<string, string>
): Promise<WebhookDeduplicationResult> {
  if (!eventId) {
    return { isDuplicate: false, source: 'database' };
  }

  const normalizedPlatform = platform.toLowerCase().trim();
  const normalizedEventId = String(eventId).trim();
  const deduplicationKey = `${normalizedPlatform}:${normalizedEventId}`;

  try {
    const supabase = getSupabase();
    if (!supabase) {
      const isDup = recordToFallback(deduplicationKey);
      return { isDuplicate: isDup, source: 'memory_fallback' };
    }

    // 1. Check if event was already received and processed
    // In marketing_webhooks, we search for matching platform and event ID in headers or payload
    const { data: existing, error: queryErr } = await supabase
      .from('marketing_webhooks')
      .select('id, processing_status, created_at')
      .eq('platform', normalizedPlatform)
      .filter('headers->>x-event-id', 'eq', normalizedEventId)
      .limit(1);

    if (!queryErr && existing && existing.length > 0) {
      return {
        isDuplicate: true,
        recordId: existing[0].id,
        source: 'database',
      };
    }

    // 2. Perform atomic insert with event metadata in headers
    const sanitizedHeaders: Record<string, string> = {
      ...(headers || {}),
      'x-event-id': normalizedEventId,
      'x-ingested-at': new Date().toISOString(),
    };

    const { data: inserted, error: insertErr } = await supabase
      .from('marketing_webhooks')
      .insert({
        platform: normalizedPlatform,
        event_type: payload?.type || payload?.event_name || payload?.object || 'webhook_event',
        signature_verified: true,
        headers: sanitizedHeaders,
        payload: payload || {},
        processing_status: 'pending',
      })
      .select('id')
      .single();

    if (insertErr) {
      // If code 23505 (unique_violation) or query error, check if another instance inserted it concurrently
      if (insertErr.code === '23505' || insertErr.message?.includes('duplicate key')) {
        return { isDuplicate: true, source: 'database' };
      }

      // If database is temporarily unavailable, fall back safely
      console.warn('[WebhookIdempotency] Database insert warning, falling back to LRU cache:', insertErr.message);
      const isDup = recordToFallback(deduplicationKey);
      return { isDuplicate: isDup, source: 'memory_fallback' };
    }

    return {
      isDuplicate: false,
      recordId: inserted?.id,
      source: 'database',
    };
  } catch (err: any) {
    console.warn('[WebhookIdempotency] Exception during claim, using fallback:', err.message);
    const isDup = recordToFallback(deduplicationKey);
    return { isDuplicate: isDup, source: 'memory_fallback' };
  }
}

/**
 * Updates the processing status of a webhook record
 */
export async function markWebhookStatus(
  recordId: string | undefined,
  status: 'processed' | 'failed' | 'ignored',
  errorMessage?: string
): Promise<void> {
  if (!recordId) return;

  try {
    const supabase = getSupabase();
    if (!supabase) return;

    await supabase
      .from('marketing_webhooks')
      .update({
        processing_status: status,
        error_message: errorMessage || null,
      })
      .eq('id', recordId);
  } catch (err: any) {
    console.warn('[WebhookIdempotency] Failed to update webhook status:', err.message);
  }
}
