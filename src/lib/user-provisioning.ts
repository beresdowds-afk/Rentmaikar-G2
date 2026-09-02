import { supabase } from '@/integrations/supabase/client';
import type { AppRole } from '@/lib/role-home';

/**
 * Single client-side entry point for role assignment.
 *
 * Every caller routes through the `provision_user_account` SECURITY DEFINER
 * RPC, which idempotently ensures profile + user_roles + two-factor settings +
 * wallet. Direct `user_roles` inserts/upserts from the UI are deprecated —
 * they duplicated logic and produced duplicate-key errors.
 */
export async function assignRole(
  userId: string,
  role: AppRole,
  email?: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('provision_user_account', {
    _user_id: userId,
    _role: role,
    ...(email ? { _email: email } : {}),
  } as never);
  if (error) throw error;
}

/** Revoke a single role row. Provisioning never removes roles, so this stays direct. */
export async function revokeRole(userId: string, role: AppRole): Promise<void> {
  const { error } = await supabase
    .from('user_roles')
    .delete()
    .eq('user_id', userId)
    .eq('role', role as never);
  if (error) throw error;
}

export interface EnsureAuthUserArgs {
  email: string;
  password?: string;
  fullName: string;
  requestedRole?: 'driver' | 'owner';
  emailRedirectTo?: string;
}

/**
 * Ensures an auth user exists for an applicant and returns their id.
 * Shared by the driver and owner registration flows (previously duplicated
 * verbatim in both pages).
 *
 * If a *different* user is signed in, they are signed out first so the new
 * application never gets linked to the wrong account.
 */
export async function ensureAuthUserForApplicant({
  email,
  password,
  fullName,
  requestedRole,
  emailRedirectTo,
}: EnsureAuthUserArgs): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession();
  const currentEmail = sessionData.session?.user?.email?.toLowerCase();
  if (currentEmail && currentEmail !== email.toLowerCase()) {
    await supabase.auth.signOut();
  }

  const { data: sessionAfter } = await supabase.auth.getSession();
  const existingId = sessionAfter.session?.user?.id ?? null;
  if (existingId) return existingId;

  if (!password || password.length < 8) {
    throw new Error(
      'Please choose a password with at least 8 characters to create your account.',
    );
  }

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: emailRedirectTo ?? `${window.location.origin}/auth`,
      data: {
        full_name: fullName,
        ...(requestedRole ? { requested_role: requestedRole } : {}),
      },
    },
  });
  if (signUpError) throw signUpError;

  const userId = signUpData.user?.id ?? null;
  if (!userId) throw new Error('Could not create your account. Please try again.');
  return userId;
}
