import { supabase } from '@/integrations/supabase/client';
import type { AppRole } from '@/lib/role-home';

/**
 * Single client-side entry point for role assignment.
 *
 * Role assignment goes through the authenticated backend gateway, which applies
 * the caller's self-service or administrative authorization before provisioning.
 *
 * Enforces fail-closed: verifies that user_roles actually contains the role
 * after provisioning attempts.
 */
export async function assignRole(
  userId: string,
  role: AppRole,
  email?: string | null,
): Promise<void> {
  if (!userId) {
    throw new Error('assignRole requires a valid userId');
  }

  let lastError: unknown = null;

  try {
    const { data, error: fnErr } = await supabase.functions.invoke('provision-user-account', {
      body: { userId, role, email },
    });
    if (fnErr) {
      lastError = fnErr;
    } else if (!data?.ok) {
      lastError = new Error('Account provisioning was not confirmed by the backend.');
    }
  } catch (err) {
    lastError = err;
  }

  // Mandatory durable state verification:
  // After fallback chain completes, verify user_roles contains the expected user_id + requested role.
  const { data: roleRows, error: verifyError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId);

  const hasRoleDirect = Array.isArray(roleRows) && roleRows.some((r: any) => r.role === role);

  if (!hasRoleDirect) {
    // If direct select did not find the role (or was blocked by RLS), check has_role RPC
    let hasRoleRpc = false;
    try {
      const { data: rpcRes, error: rpcErr } = await (supabase.rpc as any)('has_role', {
        _user_id: userId,
        _role: role,
      });
      if (!rpcErr && rpcRes === true) {
        hasRoleRpc = true;
      }
    } catch {
      // ignore
    }

    if (!hasRoleRpc) {
      const roleFailError = new Error(
        `Role verification failed: user_roles does not contain role "${role}" for user "${userId}".`,
      );
      (roleFailError as any).code = 'ROLE_VERIFICATION_FAILED';
      (roleFailError as any).cause = verifyError || lastError;
      throw roleFailError;
    }
  }
}

/**
 * Verifies that the auth trigger created a durable profile for the user.
 * Profile repair must use a server-authorized flow; the browser cannot invoke
 * the privileged provisioning RPC directly.
 */
export async function verifyProfileExists(
  userId: string,
): Promise<void> {
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (profileErr) {
    const err = new Error(`Profile verification failed: ${profileErr.message}`);
    (err as any).code = 'PROFILE_VERIFICATION_FAILED';
    (err as any).cause = profileErr;
    throw err;
  }

  if (profile) return;

  const err = new Error(
    `Profile provisioning failed: durable profile record was not created for user ${userId}.`,
  );
  (err as any).code = 'PROFILE_PROVISIONING_FAILED';
  throw err;
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
 * Shared by the driver and owner registration flows.
 *
 * Enforces fail-closed semantics:
 * - If a different user is signed in, they are signed out first.
 * - Confirms valid Auth user identity (never returns null/undefined user ID).
 * - Confirms profile existence.
 * - Confirms role assignment in user_roles.
 * - Reconciles existing registered accounts cleanly on duplicate submission without duplicating identities.
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
    await verifyProfileExists(existingUserId);
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
        await verifyProfileExists(userId);
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
        await verifyProfileExists(userId);
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
      await verifyProfileExists(userId);
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
    const missingUserErr = new Error('Authentication failed: Supabase Auth did not return a valid user identity.');
    (missingUserErr as any).code = 'AUTH_USER_MISSING';
    throw missingUserErr;
  }

  // 5. Verify profile exists (fails closed if missing)
  await verifyProfileExists(userId);

  // 6. Ensure role and account setup is immediately provisioned and verified in user_roles
  if (requestedRole) {
    await assignRole(userId, requestedRole, normalizedEmail);
  }

  return userId;
}
