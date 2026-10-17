import { supabase } from '@/integrations/supabase/client';

export type AuthSignInGuardErrorCode =
  | 'AUTH_RATE_LIMITED'
  | 'AUTH_RATE_LIMIT_UNAVAILABLE';

export function isAuthSignInGuardError(
  error: unknown,
): error is Error & { code: AuthSignInGuardErrorCode } {
  return (
    error instanceof Error &&
    ((error as Error & { code?: string }).code === 'AUTH_RATE_LIMITED' ||
      (error as Error & { code?: string }).code === 'AUTH_RATE_LIMIT_UNAVAILABLE')
  );
}

async function logAuthEvent(
  eventType: string,
  email: string,
  source: string,
  errorCode?: string,
) {
  try {
    await supabase.rpc('log_auth_event', {
      _event_type: eventType,
      _email: email,
      _provider: null,
      _success: eventType === 'sign_in_success',
      _error_code: errorCode ?? null,
      _metadata: { source } as never,
    });
  } catch {
    // Authentication must not depend on the audit RPC being available.
  }
}

export async function guardedPasswordSignIn(
  email: string,
  password: string,
  source = 'signin',
) {
  const normalizedEmail = email.trim().toLowerCase();
  let allowed: boolean | null = null;
  let rateLimitError: unknown;

  try {
    const result = await supabase.rpc('check_auth_rate_limit', {
      _identifier: `signin:${normalizedEmail}`,
      _endpoint: 'auth.signin',
      _max_requests: 5,
      _window_seconds: 300,
    });
    allowed = result.data;
    rateLimitError = result.error;
  } catch (error) {
    rateLimitError = error;
  }

  if (rateLimitError || allowed !== true) {
    const limited = !rateLimitError && allowed === false;
    const code: AuthSignInGuardErrorCode = limited
      ? 'AUTH_RATE_LIMITED'
      : 'AUTH_RATE_LIMIT_UNAVAILABLE';
    await logAuthEvent(
      limited ? 'sign_in_rate_limited' : 'sign_in_rate_limit_unavailable',
      normalizedEmail,
      source,
      code,
    );
    const error = new Error(
      limited
        ? 'Too many sign-in attempts. Please wait a few minutes and try again.'
        : 'Sign-in is temporarily unavailable. Please try again shortly.',
    ) as Error & { code: AuthSignInGuardErrorCode };
    error.code = code;
    throw error;
  }

  const result = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });
  await logAuthEvent(
    result.error ? 'sign_in_failure' : 'sign_in_success',
    normalizedEmail,
    source,
    result.error?.message,
  );
  return result;
}
