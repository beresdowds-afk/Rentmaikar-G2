import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { backendBridge } from '@/lib/backend-bridge';
import { assignRole, verifyProfileExists } from '@/lib/user-provisioning';
import { useAuthTabSync } from '@/hooks/useAuthTabSync';
import { primaryRole, type AppRole } from '@/lib/role-home';
import { guardedPasswordSignIn } from '@/lib/auth-password-sign-in';


export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  shouldRetry?: (error: any) => boolean;
  onRetry?: (attempt: number, error: any, nextDelayMs: number) => void;
}

/**
 * Detects if an error is likely transient/network-related and worth retrying
 */
export function isTransientAuthError(error: any): boolean {
  if (!error) return false;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  const msg = String(error.message || error || '').toLowerCase();
  const status = (error as any)?.status || (error as any)?.statusCode;

  if (status && [408, 429, 500, 502, 503, 504].includes(Number(status))) {
    return true;
  }

  return (
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('timeout') ||
    msg.includes('failed to fetch') ||
    msg.includes('load failed') ||
    msg.includes('econnreset') ||
    msg.includes('connection refused') ||
    msg.includes('gateway') ||
    msg.includes('offline') ||
    msg.includes('aborted')
  );
}

/**
 * Executes an async operation with exponential backoff and jitter for transient errors
 */
export async function withAuthRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const initialDelayMs = options.initialDelayMs ?? 1000;
  const maxDelayMs = options.maxDelayMs ?? 5000;
  const factor = options.factor ?? 2;
  const shouldRetry = options.shouldRetry ?? isTransientAuthError;

  let lastError: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (err: any) {
      lastError = err;
      if (attempt >= maxAttempts || !shouldRetry(err)) {
        break;
      }
      const baseDelay = Math.min(initialDelayMs * Math.pow(factor, attempt - 1), maxDelayMs);
      const delay = Math.round(baseDelay * (0.8 + 0.4 * Math.random()));
      if (options.onRetry) {
        options.onRetry(attempt, err, delay);
      } else {
        console.warn(`[AuthRetry] Attempt ${attempt}/${maxAttempts} failed (${err?.message || 'Error'}). Retrying in ${delay}ms...`);
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

interface TwoFactorStatus {
  requires_2fa: boolean;
  is_setup: boolean;
  is_mandatory: boolean;
  has_phone: boolean;
  preferred_channel: string;
  phone?: string;
  /** True when the status lookup failed and we are failing closed. */
  check_failed?: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  userRole: AppRole | null;
  userRoles: AppRole[];
  hasAccountTypeConflict: boolean;
  isRoleLoading: boolean;
  twoFactorStatus: TwoFactorStatus | null;
  twoFactorVerified: boolean;
  setTwoFactorVerified: (verified: boolean) => void;
  signUp: (email: string, password: string, fullName: string, role: 'driver' | 'owner') => Promise<{
    error: Error | null;
    emailExists?: boolean;
    user?: User | null;
    userId?: string | null;
    confirmationRequired?: boolean;
    status?: 'success' | 'rejected' | 'ambiguous';
  }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null; userId?: string }>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  refreshRoles: () => Promise<void>;
  check2FAStatus: (userId: string) => Promise<TwoFactorStatus | null>;
  sendPasswordReset: (email: string, options?: { redirectOrigin?: string; maxAttempts?: number }) => Promise<{ error: Error | null; success: boolean }>;
  sendGoogleSsoAuthEmail: (params: { email: string; fullName?: string; isNewUser?: boolean; device?: string; location?: string; origin?: string }) => Promise<{ success: boolean; error?: Error }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<AppRole | null>(null);
  const [userRoles, setUserRoles] = useState<AppRole[]>([]);
  const [hasAccountTypeConflict, setHasAccountTypeConflict] = useState(false);
  const [isRoleLoading, setIsRoleLoading] = useState(true);
  const [twoFactorStatus, setTwoFactorStatus] = useState<TwoFactorStatus | null>(null);
  const [twoFactorVerified, setTwoFactorVerified] = useState(false);
  const twoFactorStatusRef = useRef<TwoFactorStatus | null>(null);
  twoFactorStatusRef.current = twoFactorStatus;
  const authGeneration = useRef(0);
  const activeUserId = useRef<string | null>(null);

  const fetchUserRole = async (userId: string, userEmail?: string | null, generation = authGeneration.current) => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);
      if (error) {
        console.error('Error fetching user role:', error);
        if (generation === authGeneration.current && activeUserId.current === userId) {
          setUserRoles([]);
        }
        return null;
      }

      let roles = (data ?? []).map((row) => row.role as AppRole);
      const conflictingTypes = roles.includes('driver') && roles.includes('owner');
      if (conflictingTypes) {
        roles = roles.filter((role) => role !== 'driver' && role !== 'owner');
      }
      let effectiveRole = primaryRole(roles);

      if (generation !== authGeneration.current || activeUserId.current !== userId) return null;

      setHasAccountTypeConflict(conflictingTypes);
      setUserRoles(roles);

      if (typeof window !== 'undefined') {
        try {
          if (effectiveRole === 'admin' || effectiveRole === 'admin_assistant') {
            localStorage.setItem('rentmaikar_admin_active', 'true');
            localStorage.setItem('rentmaikar_admin_role', effectiveRole);
            localStorage.setItem('rentmaikar_admin_email', userEmail?.trim().toLowerCase() || '');
          } else {
            localStorage.removeItem('rentmaikar_admin_active');
            localStorage.removeItem('rentmaikar_admin_role');
            localStorage.removeItem('rentmaikar_admin_email');
            localStorage.removeItem('rentmaikar_admin_name');
            localStorage.removeItem('rentmaikar_admin_phone');
          }
        } catch {
          // ignore
        }
      }

      return effectiveRole;
    } catch (err) {
      console.error('Error in fetchUserRole:', err);
      return null;
    }
  };

  const check2FAStatus = async (userId: string): Promise<TwoFactorStatus | null> => {
    const generation = authGeneration.current;
    try {
      const hasStoredTotp = typeof window !== 'undefined' && !!localStorage.getItem(`rentmaikar:totp:${userId}`);
      const bridgeRes = await backendBridge.invokeEdgeFunction('send-2fa-code', {
        action: 'status',
      });
      if (bridgeRes.error || !bridgeRes.data?.success) {
        throw bridgeRes.error || new Error('Unable to verify MFA status');
      }

      const data = bridgeRes.data;
      const isAuthenticator = data.preferred_channel === 'authenticator' || hasStoredTotp;
      const isSetup = !!data.is_setup;
      const requires2FA = !!data.requires_2fa;

      const status: TwoFactorStatus = {
        requires_2fa: requires2FA,
        is_setup: isSetup,
        is_mandatory: !!data.is_mandatory,
        has_phone: !!data.has_phone,
        preferred_channel: isAuthenticator ? 'authenticator' : data.preferred_channel || 'sms',
        phone: data.has_phone ? data.phone : undefined,
      };
      if (generation === authGeneration.current && activeUserId.current === userId) {
        setTwoFactorStatus(status);
        if (!requires2FA) {
          setTwoFactorVerified(true);
        }
      }
      return status;
    } catch (err) {
      // Fail closed: if we cannot determine whether 2FA applies, do not grant
      // the session a verified state. The user is routed to the 2FA challenge
      // (or can sign out / retry) instead of silently bypassing it.
      console.error('[AuthContext] 2FA status check failed; failing closed:', err);
      const failed: TwoFactorStatus = {
        requires_2fa: true,
        is_setup: true,
        is_mandatory: false,
        has_phone: false,
        preferred_channel: 'sms',
        check_failed: true,
      };
      if (generation === authGeneration.current && activeUserId.current === userId) {
        setTwoFactorStatus(failed);
        setTwoFactorVerified(false);
      }
      return failed;
    }
  };

  // Log an authentication event via the SECURITY DEFINER RPC. Never trusts
  // client-supplied user_id — the RPC derives it from auth.uid() on the server.
  const logAuthEvent = async (
    eventType: string,
    opts: { email?: string; provider?: string; success?: boolean; errorCode?: string; metadata?: Record<string, unknown> } = {}
  ) => {
    try {
      await supabase.rpc('log_auth_event', {
        _event_type: eventType,
        _email: opts.email ?? null,
        _provider: opts.provider ?? null,
        _success: opts.success ?? true,
        _error_code: opts.errorCode ?? null,
        _metadata: (opts.metadata ?? {}) as any,
      });
    } catch {
      // Never let logging failures break auth.
    }
  };

  // Cross-tab authentication synchronizer
  const { broadcastSession, broadcastSignOut } = useAuthTabSync({
    session,
    onSessionSynced: (syncedSession) => {
      const changedUser = activeUserId.current !== syncedSession.user.id;
      activeUserId.current = syncedSession.user.id;
      const generation = ++authGeneration.current;
      if (changedUser) {
        setUserRole(null);
        setUserRoles([]);
        setHasAccountTypeConflict(false);
        setTwoFactorStatus(null);
        setTwoFactorVerified(false);
      }
      setSession(syncedSession);
      setUser(syncedSession.user);
      if (syncedSession.user) {
        setIsRoleLoading(true);
        fetchUserRole(syncedSession.user.id, syncedSession.user.email, generation)
          .then((role) => {
            if (generation === authGeneration.current) setUserRole(role);
          })
          .finally(() => {
            if (generation === authGeneration.current) setIsRoleLoading(false);
          });

        void check2FAStatus(syncedSession.user.id);
      }
    },
    onSignedOut: () => {
      activeUserId.current = null;
      ++authGeneration.current;
      setSession(null);
      setUser(null);
      setUserRole(null);
      setUserRoles([]);
      setHasAccountTypeConflict(false);
      setTwoFactorStatus(null);
      setTwoFactorVerified(false);
      setIsRoleLoading(false);
      setIsLoading(false);
    },
  });

  // Watchdog: Ensure isRoleLoading can never hang indefinitely
  useEffect(() => {
    if (isRoleLoading) {
      const timer = setTimeout(() => {
        setIsRoleLoading(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [isRoleLoading]);

  useEffect(() => {
    // Set up auth state listener FIRST — synchronous state, deferred side effects.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        const uid = session?.user?.id ?? null;
        const changedUser = activeUserId.current !== uid;
        activeUserId.current = uid;
        const generation = ++authGeneration.current;
        if (changedUser || event === 'SIGNED_IN') {
          setUserRole(null);
          setUserRoles([]);
          setHasAccountTypeConflict(false);
          setTwoFactorStatus(null);
          setTwoFactorVerified(false);
        }
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          setIsRoleLoading(true);
          const uemail = session.user.email;
          // Supabase auth callbacks run under its session lock.
          setTimeout(() => {
            if (generation !== authGeneration.current) return;
            fetchUserRole(session.user.id, uemail, generation)
              .then((role) => {
                if (generation === authGeneration.current) setUserRole(role);
              })
              .finally(() => {
                if (generation === authGeneration.current) setIsRoleLoading(false);
              });
            void check2FAStatus(session.user.id);
          }, 0);
        } else {
          setUserRole(null);
          setUserRoles([]);
          setHasAccountTypeConflict(false);
          setIsRoleLoading(false);
          setTwoFactorStatus(null);
          setTwoFactorVerified(false);
        }

        setIsLoading(false);

        // Broadcast auth updates across open tabs
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          broadcastSession(session, event as any);
        } else if (event === 'SIGNED_OUT') {
          broadcastSignOut();
        }

        // Server-side auth event journal. Supabase rotates refresh tokens on
        // TOKEN_REFRESHED and mints new sessions on SIGNED_IN, which is our
        // defense against session fixation; we simply record the transitions.
        // Pull auth-layer email/phone changes into profiles (no auth-schema
        // triggers are permitted, so this is the UPDATE-side sync path).
        if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'INITIAL_SESSION') {
          setTimeout(() => {
            if (!session?.user) return;
            supabase.functions.invoke('sync-auth-identity').catch(() => {});
            void Promise.resolve(supabase.rpc('link_my_verified_email_contacts' as never))
              .then(({ error }) => {
                if (error) console.error('[AuthContext] Contact correlation failed:', error);
              })
              .catch((error) => console.error('[AuthContext] Contact correlation failed:', error));
          }, 0);
        }

        setTimeout(() => {
          if (event === 'SIGNED_IN') {
            const provider = (session?.user?.app_metadata as any)?.provider ?? 'email';
            const providers = (session?.user?.app_metadata as any)?.providers || [];
            const isGoogleAuth = provider === 'google' || providers.includes('google');

            if (isGoogleAuth && session?.user?.email) {
              const alertKey = `rm_gauth_alert_${session.user.id}_${session.access_token?.slice(-12) || 'session'}`;
              if (!sessionStorage.getItem(alertKey)) {
                sessionStorage.setItem(alertKey, '1');
                const isNewUser = !!(session.user.created_at && (Date.now() - new Date(session.user.created_at).getTime() < 180000));
                const fullName = (session.user.user_metadata as any)?.full_name || (session.user.user_metadata as any)?.name || '';
                sendGoogleSsoAuthEmail({
                  email: session.user.email,
                  fullName,
                  isNewUser,
                  device: navigator.userAgent ? navigator.userAgent.slice(0, 100) : 'Web Client',
                  origin: window.location.origin,
                }).catch(() => {});
              }
            }

            logAuthEvent('sign_in_success', {
              email: session?.user?.email ?? undefined,
              provider,
              metadata: { providers: (session?.user?.app_metadata as any)?.providers },
            });
          } else if (event === 'SIGNED_OUT') {
            logAuthEvent('sign_out');
          } else if (event === 'TOKEN_REFRESHED') {
            logAuthEvent('token_refreshed', { metadata: { silent: true } });
          } else if (event === 'USER_UPDATED') {
            logAuthEvent('user_updated');
          } else if (event === 'PASSWORD_RECOVERY') {
            logAuthEvent('password_recovery_started');
          }
        }, 0);
      }
    );

    // THEN check for existing session.
    // Multi-tab resilience: When multiple tabs open concurrently, another tab might
    // be actively rotating/refreshing the session token. Avoid wiping local storage
    // prematurely during concurrent tab initialization.
    const initialGeneration = authGeneration.current;
    supabase.auth.getSession().then(async ({ data: { session: initialSession }, error }) => {
      if (initialGeneration !== authGeneration.current) return;
      let activeSession = initialSession;
      const staleToken =
        !!error &&
        /refresh[_ ]token|invalid|expired/i.test(error.message ?? '');

      if (staleToken) {
        // Multi-tab grace period: Check if another tab recently refreshed or has a valid session
        await new Promise((resolve) => setTimeout(resolve, 500));
        if (initialGeneration !== authGeneration.current) return;
        try {
          const retryRes = await supabase.auth.getSession();
          if (initialGeneration !== authGeneration.current) return;
          if (retryRes?.data?.session) {
            activeSession = retryRes.data.session;
          } else {
            try {
              await supabase.auth.signOut({ scope: 'local' });
            } catch {
              /* ignore */
            }
            setSession(null);
            setUser(null);
            setUserRole(null);
            setUserRoles([]);
            setHasAccountTypeConflict(false);
            setIsRoleLoading(false);
            setIsLoading(false);
            return;
          }
        } catch {
          // Proceed safely
        }
      }

      if (initialGeneration !== authGeneration.current) return;
      activeUserId.current = activeSession?.user.id ?? null;
      const generation = ++authGeneration.current;
      setSession(activeSession);
      setUser(activeSession?.user ?? null);

      if (activeSession?.user) {
        broadcastSession(activeSession, 'SIGNED_IN');
        setIsRoleLoading(true);
        const uid = activeSession.user.id;
        const uemail = activeSession.user.email;
        fetchUserRole(uid, uemail, generation)
          .then((role) => {
            if (generation === authGeneration.current) setUserRole(role);
          })
          .catch((err) => {
            console.error('Error fetching user role in getSession:', err);
            if (generation === authGeneration.current) setUserRole(null);
          })
          .finally(() => {
            if (generation === authGeneration.current) setIsRoleLoading(false);
          });

        void check2FAStatus(uid);
      } else {
        setIsRoleLoading(false);
      }

      setIsLoading(false);
    });

    return () => {
      ++authGeneration.current;
      activeUserId.current = null;
      subscription.unsubscribe();
    };
  }, [broadcastSession, broadcastSignOut]);
  const signUp: AuthContextType['signUp'] = async (email, password, fullName, role) => {
    try {
      const redirectUrl = `${window.location.origin}/auth`;
      const normalizedEmail = email.trim().toLowerCase();
      const effectiveFullName = fullName.trim();
      const effectiveRole: 'driver' | 'owner' = role === 'owner' ? 'owner' : 'driver';

      // Server-side duplicate guard: authoritative check against auth.users
      // (rate limited) so a registered email is routed to sign-in instead of
      // producing a silent/duplicate sign-up attempt.
      try {
        const { data: statusData } = await supabase.rpc('email_signup_status', {
          _email: normalizedEmail,
        });
        const status = statusData as { registered?: boolean; rate_limited?: boolean } | null;
        if (status?.registered) {
          await logAuthEvent('sign_up_failure', {
            email: normalizedEmail,
            errorCode: 'email_already_registered_precheck',
          });
          return {
            error: new Error('This email is already registered. Please sign in instead.'),
            emailExists: true,
          };
        }
      } catch (precheckError) {
        // Non-fatal: fall through to Supabase's own duplicate handling below.
        console.warn('Sign-up precheck unavailable:', precheckError);
      }

      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,

        options: {
          emailRedirectTo: redirectUrl,
          // `requested_role` is consumed by the handle_new_user trigger, which
          // is the single place that provisions profile + role + wallet.
          data: { full_name: effectiveFullName, requested_role: effectiveRole },
        },
      });

      if (error) {
        await logAuthEvent('sign_up_failure', { email: normalizedEmail, errorCode: error.message });
        // The email is already registered: surface it as a routable signal so
        // the UI can send the user to sign-in instead of a dead-end error.
        if (/already|registered|exists/i.test(error.message)) {
          return {
            error: new Error('This email is already registered. Please sign in instead.'),
            emailExists: true,
            status: 'rejected' as const,
          };
        }
        return { error, status: 'rejected' as const };
      }

      // Supabase obfuscates duplicate sign-ups when email confirmation is on:
      // it returns a user object with an EMPTY identities array instead of an
      // error. Treat that as "already registered" and route to sign-in.
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        await logAuthEvent('sign_up_failure', { email: normalizedEmail, errorCode: 'email_already_registered' });
        return {
          error: new Error('This email is already registered. Please sign in instead.'),
          emailExists: true,
          status: 'rejected',
        };
      }

      // Invariant: Supabase Auth must return a valid user identity
      if (!data.user || !data.user.id) {
        await logAuthEvent('sign_up_failure', { email: normalizedEmail, errorCode: 'auth_user_identity_missing' });
        return {
          error: new Error('Account creation failed: Supabase Auth did not return a valid user identity.'),
          status: 'ambiguous',
        };
      }

      const uid = data.user.id;

      // The database trigger provisions the account during sign-up. With
      // email confirmation enabled there is no authenticated session yet, so
      // RLS prevents client-side profile and role verification until sign-in.
      if (!data.session) {
        return { error: null, user: data.user, userId: uid, confirmationRequired: true, status: 'success' };
      }

      // Fail-closed verification: ensure profile exists and role is assigned in user_roles
      try {
        await verifyProfileExists(uid);
        await assignRole(uid, effectiveRole, normalizedEmail);
      } catch (provisionError) {
        console.error('Error provisioning account during signup:', provisionError);
        await logAuthEvent('sign_up_failure', { email: normalizedEmail, errorCode: 'provisioning_failed' });
        return {
          error: provisionError instanceof Error ? provisionError : new Error(String(provisionError)),
          userId: uid,
          status: 'rejected',
        };
      }

      await logAuthEvent('sign_up_success', { email: normalizedEmail, metadata: { role } });
      return { error: null, user: data.user, userId: uid, status: 'success' };
    } catch (err) {
      return { error: err as Error, status: 'rejected' };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await guardedPasswordSignIn(email, password);

      if (error) {
        const msg = error.message || '';
        const code = (error as any).code || '';
        if (/email.*not.*confirm/i.test(msg) || code === 'email_not_confirmed') {
          return { error: new Error('Email not confirmed. Please check your inbox or resend verification.') };
        }
        if (/rate.*limit/i.test(msg)) {
          return { error: new Error('Too many attempts. Please wait a few minutes and try again.') };
        }
        if (isTransientAuthError(error) || Number((error as { status?: number }).status) >= 500) {
          return { error: new Error('Sign-in is temporarily unavailable. Please check your connection and try again.') };
        }
        // Generic error text — avoid account enumeration for bad credentials.
        return { error: new Error('Invalid email or password.') };
      }

      return { error: null, userId: data.user?.id };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const signOut = async () => {
    broadcastSignOut();
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setUserRole(null);
    setUserRoles([]);
    setTwoFactorStatus(null);
    setTwoFactorVerified(false);
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('rentmaikar_admin_active');
        localStorage.removeItem('rentmaikar_admin_role');
        localStorage.removeItem('rentmaikar_admin_email');
        localStorage.removeItem('rentmaikar_admin_name');
        localStorage.removeItem('rentmaikar_admin_phone');
        localStorage.removeItem('rentmaikar_oauth_role');
        sessionStorage.removeItem('rentmaikar_oauth_role');
      } catch {
        // ignore
      }
    }
  };


  const hasRole = (role: AppRole) => {
    return userRoles.includes('admin') || userRoles.includes(role);
  };

  const refreshRoles = async () => {
    const uid = activeUserId.current;
    if (!uid) return;
    const generation = authGeneration.current;
    setIsRoleLoading(true);
    try {
      const role = await fetchUserRole(uid, user?.email, generation);
      if (generation === authGeneration.current) setUserRole(role);
      const previouslyRequired = twoFactorStatusRef.current?.requires_2fa;
      const status = await check2FAStatus(uid);
      if (generation === authGeneration.current && status?.requires_2fa && !previouslyRequired) {
        setTwoFactorVerified(false);
      }
    } finally {
      if (generation === authGeneration.current) setIsRoleLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase.channel(`auth-roles:${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_roles',
        filter: `user_id=eq.${user.id}`,
      }, () => {
        setUserRole(null);
        setUserRoles([]);
        void refreshRoles();
      })
      .subscribe();
    const refreshOnFocus = () => { void refreshRoles(); };
    window.addEventListener('focus', refreshOnFocus);
    return () => {
      window.removeEventListener('focus', refreshOnFocus);
      void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  /**
   * Sends Google SSO welcome or sign-in alert email with automatic exponential backoff retries
   */
  const sendGoogleSsoAuthEmail = async (params: {
    email: string;
    fullName?: string;
    isNewUser?: boolean;
    device?: string;
    location?: string;
    origin?: string;
  }): Promise<{ success: boolean; error?: Error }> => {
    try {
      await withAuthRetry(
        async () => {
          const { error } = await supabase.functions.invoke('google-sso-auth-email', {
            body: {
              email: params.email,
              fullName: params.fullName,
              isNewUser: params.isNewUser,
              device: params.device || (typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 100) : 'Web Client'),
              location: params.location,
              origin: params.origin || (typeof window !== 'undefined' ? window.location.origin : 'https://rentmaikar.com'),
            },
          });
          if (error) {
            throw new Error(error.message || 'Google SSO email invocation failed');
          }
        },
        {
          maxAttempts: 3,
          initialDelayMs: 1200,
          onRetry: (attempt, err, delay) => {
            console.warn(`[AuthContext] Retrying Google SSO email delivery (attempt ${attempt}/3) in ${delay}ms:`, err?.message);
          },
        }
      );
      return { success: true };
    } catch (err: any) {
      console.error('[AuthContext] Google SSO auth email delivery failed after retries:', err?.message || err);
      return { success: false, error: err as Error };
    }
  };

  /**
   * Sends password reset email with automatic exponential backoff retries
   */
  const sendPasswordReset = async (
    email: string,
    options?: { redirectOrigin?: string; maxAttempts?: number }
  ): Promise<{ error: Error | null; success: boolean }> => {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return { error: new Error('Please enter a valid email address.'), success: false };
    }

    try {
      await withAuthRetry(
        async () => {
          const { data, error } = await supabase.functions.invoke('send-password-reset', {
            body: {
              email: normalized,
              redirectOrigin: options?.redirectOrigin || (typeof window !== 'undefined' ? window.location.origin : 'https://rentmaikar.com'),
            },
          });
          if (error) {
            throw new Error(error.message || 'Password reset request failed');
          }
          return data;
        },
        {
          maxAttempts: options?.maxAttempts ?? 3,
          initialDelayMs: 1000,
          onRetry: (attempt, err, delay) => {
            console.warn(`[AuthContext] Retrying password reset request (attempt ${attempt}/3) in ${delay}ms:`, err?.message);
          },
        }
      );
      return { error: null, success: true };
    } catch (err: any) {
      console.error('[AuthContext] Password reset request failed after retries:', err?.message || err);
      return { error: err as Error, success: false };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading,
        userRole,
        userRoles,
        hasAccountTypeConflict,
        isRoleLoading,
        twoFactorStatus,
        twoFactorVerified,
        setTwoFactorVerified,
        signUp,
        signIn,
        signOut,
        hasRole,
        refreshRoles,
        check2FAStatus,
        sendPasswordReset,
        sendGoogleSsoAuthEmail,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
