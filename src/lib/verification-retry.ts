/**
 * Retry with exponential backoff for transient verification/auth failures.
 * Permanent failures (user must act) short-circuit immediately.
 */
import { classifyVerificationFailure, isTransient, type ClassifiedFailure } from '@/lib/verification-failures';
import { logVerificationEvent, getCorrelationId, type VerificationStage } from '@/lib/verification-logger';

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  stage: VerificationStage;
  step: string;
  provider?: string;
  correlationId?: string;
  /** Override the default "is this worth retrying" decision. */
  shouldRetry?: (failure: ClassifiedFailure) => boolean;
}

export class VerificationError extends Error {
  failure: ClassifiedFailure;
  constructor(failure: ClassifiedFailure) {
    super(failure.message);
    this.name = 'VerificationError';
    this.failure = failure;
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Runs `fn`, retrying transient failures with jittered exponential backoff.
 * Throws a `VerificationError` carrying the classified failure.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const base = opts.baseDelayMs ?? 600;
  const max = opts.maxDelayMs ?? 6000;
  const correlationId = opts.correlationId ?? getCorrelationId();
  let lastFailure: ClassifiedFailure | null = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const result = await fn();
      if (attempt > 1) {
        void logVerificationEvent({
          stage: opts.stage, step: opts.step, outcome: 'succeeded',
          provider: opts.provider, correlationId, context: { attempt },
        });
      }
      return result;
    } catch (err) {
      const failure = classifyVerificationFailure(err, { correlationId });
      lastFailure = failure;
      const retry = opts.shouldRetry ? opts.shouldRetry(failure) : isTransient(failure);
      const hasBudget = attempt < attempts;

      void logVerificationEvent({
        stage: opts.stage,
        step: opts.step,
        outcome: retry && hasBudget ? 'retrying' : 'failed',
        provider: opts.provider,
        failure,
        correlationId,
        context: { attempt, attempts },
      });

      if (!retry || !hasBudget) throw new VerificationError(failure);
      const delay = Math.min(max, base * 2 ** (attempt - 1));
      await sleep(delay + Math.random() * 250);
    }
  }

  throw new VerificationError(lastFailure ?? classifyVerificationFailure('unknown_failure', { correlationId }));
}
