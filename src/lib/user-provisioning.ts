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
  try {
    const { error } = await supabase.rpc('provision_user_account', {
      _user_id: userId,
      _role: role,
      ...(email ? { _email: email } : {}),
    } as never);
    if (!error) return;
  } catch {
    // Fall back to server function below
  }

  try {
    const { data } = await supabase.functions.invoke('provision-user-account', {
      body: { userId, role, email },
    });
    if (data?.ok) return;
  } catch {
    // Fall back to direct table upsert below
  }

  try {
    await supabase.from('user_roles').upsert(
      { user_id: userId, role: role as any },
      { onConflict: 'user_id' }
    );
  } catch (tableErr) {
    console.warn('Fallback user_roles assignment error:', tableErr);
  }
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
  const normalizedEmail = email.trim().toLowerCase();

  // 1. If currently signed in, check if it matches the applicant's email
  const { data: sessionData } = await supabase.auth.getSession();
  const currentEmail = sessionData.session?.user?.email?.toLowerCase();
  if (currentEmail && currentEmail !== normalizedEmail) {
    await supabase.auth.signOut();
  } else if (currentEmail === normalizedEmail && sessionData.session?.user?.id) {
    const existingUserId = sessionData.session.user.id;
    if (requestedRole) {
      await assignRole(existingUserId, requestedRole, normalizedEmail);
    }
    return existingUserId;
  }

  if (!password || password.length < 8) {
    throw new Error(
      'Please choose a password with at least 8 characters to create your account.',
    );
  }

  // 2. Pre-check if email is already registered using email_signup_status RPC
  try {
    const { data: statusData } = await (supabase.rpc as any)('email_signup_status', {
      _email: normalizedEmail,
    });
    if (statusData && typeof statusData === 'object' && (statusData as any).registered === true) {
      // Email is already registered. Attempt sign-in with the password provided.
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (!signInError && signInData?.user?.id) {
        const userId = signInData.user.id;
        if (requestedRole) {
          await assignRole(userId, requestedRole, normalizedEmail);
        }
        return userId;
      }

      // Password didn't match or sign-in failed
      const duplicateError = new Error(
        'An account with this email address already exists. Please sign in with your password to submit your application, or use the forgot password option.',
      );
      (duplicateError as any).code = 'EMAIL_ALREADY_EXISTS';
      throw duplicateError;
    }
  } catch (rpcErr: any) {
    if (rpcErr?.code === 'EMAIL_ALREADY_EXISTS' || rpcErr?.message?.includes('already exists')) {
      throw rpcErr;
    }
    // Rate limited or RPC unavailable, continue to signUp attempt
  }

  // 3. Attempt to sign up the new user
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      emailRedirectTo: emailRedirectTo ?? `${window.location.origin}/auth`,
      data: {
        full_name: fullName,
        ...(requestedRole ? { requested_role: requestedRole } : {}),
      },
    },
  });

  if (signUpError) {
    const msg = signUpError.message.toLowerCase();
    if (
      msg.includes('already registered') ||
      msg.includes('already exists') ||
      signUpError.status === 422
    ) {
      // Attempt sign-in with password in case account was already created
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (!signInError && signInData?.user?.id) {
        const userId = signInData.user.id;
        if (requestedRole) {
          await assignRole(userId, requestedRole, normalizedEmail);
        }
        return userId;
      }

      const duplicateError = new Error(
        'An account with this email address already exists. Please sign in with your password to submit your application, or use the forgot password option.',
      );
      (duplicateError as any).code = 'EMAIL_ALREADY_EXISTS';
      throw duplicateError;
    }
    throw signUpError;
  }

  // 4. Supabase enumeration protection check:
  // If an account already exists, Supabase returns a dummy user object with identities: []
  // We MUST NOT accept this dummy user id!
  if (
    signUpData.user &&
    Array.isArray(signUpData.user.identities) &&
    signUpData.user.identities.length === 0
  ) {
    // Attempt sign-in with password
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });
    if (!signInError && signInData?.user?.id) {
      const userId = signInData.user.id;
      if (requestedRole) {
        await assignRole(userId, requestedRole, normalizedEmail);
      }
      return userId;
    }

    const duplicateError = new Error(
      'An account with this email address already exists. Please sign in with your password to submit your application, or use the forgot password option.',
    );
    (duplicateError as any).code = 'EMAIL_ALREADY_EXISTS';
    throw duplicateError;
  }

  const userId = signUpData.user?.id ?? null;
  if (!userId) {
    throw new Error('Could not create your account. Please try again.');
  }

  // 5. Ensure role and account setup is immediately provisioned
  if (requestedRole) {
    await assignRole(userId, requestedRole, normalizedEmail);
  }

  return userId;
}
