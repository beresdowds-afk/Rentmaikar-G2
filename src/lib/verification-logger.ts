/**
 * Correlation IDs + structured logging for the onboarding pipeline.
 *
 * Every verification / authentication step is logged with a correlation id so
 * a single user journey (sign-in → profile → Persona → approval) can be traced
 * end-to-end across the client, edge functions and the database.
 */
import { supabase } from '@/integrations/supabase/client';
import { classifyVerificationFailure, type ClassifiedFailure } from '@/lib/verification-failures';

const STORAGE_KEY = 'rentmaikar_correlation_id';

function randomId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch { /* ignore */ }
  return `cid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Stable per-browser-session correlation id (survives reloads within a tab). */
export function getCorrelationId(): string {
  if (typeof window === 'undefined') return randomId();
  try {
    const existing = window.sessionStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const id = randomId();
    window.sessionStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    return randomId();
  }
}

/** Start a fresh correlation id (e.g. when a new verification attempt begins). */
export function newCorrelationId(): string {
  const id = randomId();
  try { window.sessionStorage.setItem(STORAGE_KEY, id); } catch { /* ignore */ }
  return id;
}

export type VerificationStage =
  | 'auth'
  | 'oauth'
  | 'profile'
  | 'identity'
  | 'documents'
  | 'approval'
  | 'config';

export type VerificationOutcome = 'started' | 'succeeded' | 'failed' | 'retrying' | 'skipped';

export interface VerificationLogInput {
  stage: VerificationStage;
  step: string;
  outcome: VerificationOutcome;
  provider?: string;
  failure?: ClassifiedFailure | null;
  context?: Record<string, unknown>;
  correlationId?: string;
}

function safeContext(ctx?: Record<string, unknown>): Record<string, unknown> {
  const base: Record<string, unknown> = { ...(ctx ?? {}) };
  if (typeof navigator !== 'undefined') {
    base.user_agent = navigator.userAgent?.slice(0, 240);
    base.online = navigator.onLine;
    base.language = navigator.language;
  }
  if (typeof window !== 'undefined') {
    base.path = window.location?.pathname;
    base.viewport = `${window.innerWidth}x${window.innerHeight}`;
  }
  return base;
}

/**
 * Best-effort structured log. Never throws and never blocks the UI —
 * a failed log must not break an onboarding step.
 */
export async function logVerificationEvent(input: VerificationLogInput): Promise<void> {
  const correlationId = input.correlationId ?? getCorrelationId();
  const payload = {
    p_correlation_id: correlationId,
    p_stage: input.stage,
    p_step: input.step.slice(0, 120),
    p_outcome: input.outcome,
    p_provider: input.provider ?? null,
    p_failure_code: input.failure?.code ?? null,
    p_failure_domain: input.failure?.domain ?? null,
    p_retryable: input.failure ? input.failure.retryable : null,
    p_message: (input.failure?.raw ?? '').slice(0, 1000) || null,
    p_context: safeContext(input.context) as never,
  };
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.info('[verification]', correlationId, input.stage, input.step, input.outcome, input.failure?.code ?? '');
  }
  try {
    await supabase.rpc('log_verification_event', payload as never);
  } catch { /* logging is best-effort */ }
}

/** Convenience: classify + log a failure in one call, returning the classification. */
export async function reportVerificationFailure(
  err: unknown,
  meta: { stage: VerificationStage; step: string; provider?: string; context?: Record<string, unknown>; correlationId?: string },
): Promise<ClassifiedFailure> {
  const correlationId = meta.correlationId ?? getCorrelationId();
  const failure = classifyVerificationFailure(err, { correlationId });
  await logVerificationEvent({
    stage: meta.stage,
    step: meta.step,
    outcome: 'failed',
    provider: meta.provider,
    failure,
    context: meta.context,
    correlationId,
  });
  return failure;
}
