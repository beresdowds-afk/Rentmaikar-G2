import { supabase } from '@/integrations/supabase/client';
import type { AuthResponse } from '@supabase/supabase-js';

/**
 * Guarded password sign-in function.
 * Normalizes email input, validates credentials preflight, and invokes Supabase auth.
 */
export async function guardedPasswordSignIn(
  email: string,
  password: string
): Promise<AuthResponse> {
  const normalizedEmail = (email || '').trim().toLowerCase();

  if (!normalizedEmail || !password) {
    return {
      data: { user: null, session: null },
      error: {
        name: 'AuthValidationError',
        message: 'Email and password are required.',
        status: 400,
      } as any,
    };
  }

  try {
    const response = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    return response;
  } catch (err: any) {
    return {
      data: { user: null, session: null },
      error: {
        name: 'AuthError',
        message: err?.message || 'Authentication failed',
        status: 500,
      } as any,
    };
  }
}
