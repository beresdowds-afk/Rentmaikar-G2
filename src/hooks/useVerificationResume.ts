/**
 * Resume interrupted verification sessions.
 *
 * Persona sessions are frequently interrupted (tab closed, refresh, network
 * drop, app backgrounded on mobile). We persist a lightweight session marker
 * so the user can continue instead of restarting the whole flow, and so the
 * UI can tell the difference between "never started" and "left half-way".
 */
import { useCallback, useEffect, useState } from 'react';

const KEY = 'rentmaikar_verification_session';
/** Persona inquiry sessions are short-lived; treat older markers as stale. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface VerificationSessionMarker {
  inquiryId: string | null;
  sessionToken?: string | null;
  environmentId?: string | null;
  hostedUrl?: string | null;
  subjectRole?: string | null;
  region?: string | null;
  correlationId: string;
  startedAt: string;
  lastStep?: string;
}

function read(): VerificationSessionMarker | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VerificationSessionMarker;
    if (!parsed?.startedAt) return null;
    if (Date.now() - Date.parse(parsed.startedAt) > MAX_AGE_MS) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveVerificationSession(marker: VerificationSessionMarker): void {
  try { window.localStorage.setItem(KEY, JSON.stringify(marker)); } catch { /* ignore */ }
}

export function clearVerificationSession(): void {
  try { window.localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function getVerificationSession(): VerificationSessionMarker | null {
  if (typeof window === 'undefined') return null;
  return read();
}

/**
 * Exposes any interrupted verification session so screens can offer
 * "Resume verification" instead of forcing a restart.
 */
export function useVerificationResume() {
  const [session, setSession] = useState<VerificationSessionMarker | null>(() => getVerificationSession());

  const refresh = useCallback(() => setSession(getVerificationSession()), []);

  useEffect(() => {
    const onFocus = () => refresh();
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) refresh(); };
    window.addEventListener('focus', onFocus);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('storage', onStorage);
    };
  }, [refresh]);

  const clear = useCallback(() => { clearVerificationSession(); setSession(null); }, []);
  const save = useCallback((m: VerificationSessionMarker) => { saveVerificationSession(m); setSession(m); }, []);

  return { session, canResume: !!session?.inquiryId, refresh, clear, save };
}
