import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

export type ResendChannel = 'email' | 'sms' | 'whatsapp' | '2fa' | 'password_reset';

const DEFAULT_COOLDOWN: Record<ResendChannel, number> = {
  email: 30,
  sms: 60,
  whatsapp: 60,
  '2fa': 60,
  password_reset: 30,
};

const BACKOFF = [30, 60, 120, 300];

interface StoredState {
  lastSentAt: number;
  cooldownSec: number;
  attempts: number;
}

function storageKey(channel: ResendChannel, identifier: string) {
  return `resend:${channel}:${identifier}`;
}

function read(channel: ResendChannel, identifier: string): StoredState | null {
  try {
    const raw = localStorage.getItem(storageKey(channel, identifier));
    return raw ? (JSON.parse(raw) as StoredState) : null;
  } catch {
    return null;
  }
}

function write(channel: ResendChannel, identifier: string, s: StoredState) {
  try {
    localStorage.setItem(storageKey(channel, identifier), JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/**
 * Shared cooldown for verification/2FA/OTP resends. Persists across reloads
 * via localStorage, honors 429 `Retry-After`, and escalates via exponential
 * backoff on repeated rate-limit hits.
 */
export function useResendCooldown(
  channel: ResendChannel,
  identifier: string | null | undefined,
) {
  const id = identifier || '_';
  const [remaining, setRemaining] = useState(0);
  const timerRef = useRef<number | null>(null);

  const recompute = useCallback(() => {
    const s = read(channel, id);
    if (!s) {
      setRemaining(0);
      return;
    }
    const elapsed = Math.floor((Date.now() - s.lastSentAt) / 1000);
    setRemaining(Math.max(0, s.cooldownSec - elapsed));
  }, [channel, id]);

  useEffect(() => {
    recompute();
    timerRef.current = window.setInterval(recompute, 1000);
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
    };
  }, [recompute]);

  const trigger = useCallback(
    async (fn: () => Promise<{ retryAfterSec?: number } | void>) => {
      if (remaining > 0) return false;
      const prev = read(channel, id);
      const attempts = (prev?.attempts ?? 0) + 1;
      try {
        const result = (await fn()) as { retryAfterSec?: number } | void;
        const server = result && typeof result === 'object' ? result.retryAfterSec : undefined;
        const cooldown = server ?? DEFAULT_COOLDOWN[channel];
        write(channel, id, { lastSentAt: Date.now(), cooldownSec: cooldown, attempts });
        setRemaining(cooldown);
        return true;
      } catch (err: any) {
        // Escalate cooldown on any failure, harder on rate limits.
        const raw = err?.message || String(err ?? '');
        const isRate = /rate|too many|429|over_email/i.test(raw);
        const idx = Math.min(attempts, BACKOFF.length) - 1;
        const cooldown = isRate ? BACKOFF[Math.max(idx, 0)] : DEFAULT_COOLDOWN[channel];
        write(channel, id, { lastSentAt: Date.now(), cooldownSec: cooldown, attempts });
        setRemaining(cooldown);
        toast.error(
          isRate
            ? `Too many attempts. Try again in ${cooldown}s.`
            : `Could not resend. Try again in ${cooldown}s.`,
        );
        return false;
      }
    },
    [remaining, channel, id],
  );

  return { remaining, canSend: remaining === 0, trigger };
}
