import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { assignRole } from '@/lib/user-provisioning';

type AppRole = 'admin' | 'admin_assistant' | 'owner' | 'driver' | 'legal_support' | 'iot_support' | 'vehicle_support';

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
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  userRole: AppRole | null;
  userRoles: AppRole[];
  isRoleLoading: boolean;
  twoFactorStatus: TwoFactorStatus | null;
  twoFactorVerified: boolean;
  setTwoFactorVerified: (verified: boolean) => void;
  signUp: (email: string, password: string, fullName: string, role: AppRole) => Promise<{ error: Error | null; emailExists?: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null; userId?: string }>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
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
  const [isRoleLoading, setIsRoleLoading] = useState(true);
  const [twoFactorStatus, setTwoFactorStatus] = useState<TwoFactorStatus | null>(null);
  const [twoFactorVerified, setTwoFactorVerified] = useState(false);

  const ADMIN_EMAILS = [
    'adebayoolusola39@gmail.com',
  ];

  const USER_ROLE_OVERRIDES: Record<string, { role: AppRole; fullName?: string; phone?: string }> = {
    'adebayoolusola39@gmail.com': {
      role: 'admin',
      fullName: 'Olusola Adebayo',
      phone: '+2348139051772',
    },
    'eastfortemain@gmail.com': {
      role: 'admin_assistant',
      fullName: 'Olusola Adebayo',
      phone: '+2348139051772',
    },
    'ibrahimganiyu026@gmail.com': {
      role: 'admin_assistant',
      fullName: 'Ibrahim Ganiyu',
    },
    'beresanddowds@gmail.com': {
      role: 'owner',
      fullName: 'Beres & Dowds',
    },
    'wale@gmail.com': {
      role: 'driver',
      fullName: 'Wale',
    },
  };

  const KNOWN_ADMINS: Record<string, { fullName: string; phone: string; role: AppRole }> = {
    'eastfortemain@gmail.com': {
      fullName: 'Olusola Adebayo',
      phone: '+2348139051772',
      role: 'admin_assistant',
    },
    'ibrahimganiyu026@gmail.com': {
      fullName: 'Ibrahim Ganiyu',
      phone: '',
      role: 'admin_assistant',
    },
    'adebayoolusola39@gmail.com': {
      fullName: 'Olusola Adebayo',
      phone: '+2348139051772',
      role: 'admin',
    },
  };

  // Strictly enforce single role per user to preserve RBAC policies and prevent
  // privilege escalation or inconsistent authorization states.
  const ROLE_PRIORITY: AppRole[] = [
    'admin',
    'admin_assistant',
    'legal_support',
    'iot_support',
    'vehicle_support',
    'owner',
    'driver',
  ];

  const fetchUserRole = async (userId: string, userEmail?: string | null) => {
    try {
      const normalizedEmail = userEmail?.trim().toLowerCase();
      const predefined = normalizedEmail ? USER_ROLE_OVERRIDES[normalizedEmail] : null;

      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching user role:', error);
        if (predefined) return predefined.role;
        return null;
      }

      let assignedRole = (data?.role as AppRole) ?? null;
      if (!assignedRole) {
        // Also check admin_assistant_permissions in case user was provisioned as assistant
        const { data: assistantRow } = await supabase
          .from('admin_assistant_permissions')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();
        if (assistantRow) {
          assignedRole = 'admin_assistant';
        }
      }
      let effectiveRole: AppRole | null = predefined ? predefined.role : assignedRole;

      // Handle new OAuth / Google SSO users without an existing role assignment:
      // Read target role chosen during sign-up (defaults to driver) and provision it.
      if (!effectiveRole && userId) {
        const storedRole = (typeof window !== 'undefined'
          ? (sessionStorage.getItem('rentmaikar_oauth_role') || localStorage.getItem('rentmaikar_oauth_role'))
          : null) as AppRole;
        const targetRole: AppRole = storedRole === 'owner' ? 'owner' : 'driver';
        effectiveRole = targetRole;

        try {
          await assignRole(userId, targetRole, normalizedEmail);
        } catch (e) {
          console.warn('[AuthContext] Auto-assigning OAuth role failed:', e);
        }

        if (typeof window !== 'undefined') {
          try {
            sessionStorage.removeItem('rentmaikar_oauth_role');
            localStorage.removeItem('rentmaikar_oauth_role');
          } catch {
            // ignore
          }
        }
      }

      // Strictly prohibit multiple roles for users to preserve RBAC policies
      setUserRoles(effectiveRole ? [effectiveRole] : []);

      if (predefined) {
        if (assignedRole !== predefined.role) {
          assignRole(userId, predefined.role, normalizedEmail).catch(() => {
            supabase
              .from('user_roles')
              .upsert({ user_id: userId, role: predefined.role as any }, { onConflict: 'user_id' })
              .catch(() => {});
          });
        }

        if (predefined.fullName) {
          supabase
            .from('profiles')
            .upsert(
              {
                user_id: userId,
                email: normalizedEmail,
                full_name: predefined.fullName,
                phone: predefined.phone,
              },
              { onConflict: 'user_id' }
            )
            .catch(() => {});
        }

        if (predefined.phone) {
          supabase
            .from('two_factor_settings')
            .upsert(
              {
                user_id: userId,
                phone_number: predefined.phone,
                preferred_channel: 'sms',
                is_enabled: true,
              },
              { onConflict: 'user_id' }
            )
            .catch(() => {});
        }

        if (typeof window !== 'undefined') {
          try {
            if (predefined.role === 'admin' || predefined.role === 'admin_assistant') {
              localStorage.setItem('rentmaikar_admin_active', 'true');
              localStorage.setItem('rentmaikar_admin_role', predefined.role);
              localStorage.setItem('rentmaikar_admin_email', normalizedEmail!);
              if (predefined.fullName) localStorage.setItem('rentmaikar_admin_name', predefined.fullName);
              if (predefined.phone) localStorage.setItem('rentmaikar_admin_phone', predefined.phone);
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

        return predefined.role;
      }

      if (typeof window !== 'undefined') {
        try {
          if (effectiveRole === 'admin' || effectiveRole === 'admin_assistant') {
            localStorage.setItem('rentmaikar_admin_active', 'true');
            localStorage.setItem('rentmaikar_admin_role', effectiveRole);
            localStorage.setItem('rentmaikar_admin_email', normalizedEmail || '');
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
      if (userEmail) {
        const normalized = userEmail.trim().toLowerCase();
        if (USER_ROLE_OVERRIDES[normalized]) {
          return USER_ROLE_OVERRIDES[normalized].role;
        }
      }
      return null;
    }
  };

  const check2FAStatus = async (userId: string): Promise<TwoFactorStatus | null> => {
    try {
      // Check database settings first
      const { data: settings } = await supabase
        .from('two_factor_settings')
        .select('phone_number, preferred_channel, is_enabled')
        .eq('user_id', userId)
        .maybeSingle();

      const hasStoredTotp = typeof window !== 'undefined' && !!localStorage.getItem(`rentmaikar:totp:${userId}`);
      const isAuthenticator = settings?.preferred_channel === 'authenticator' || hasStoredTotp;

      const { data, error } = await supabase.functions.invoke('send-2fa-code', {
        body: { action: 'status', user_id: userId },
      });

      const currentUserEmail = user?.email?.trim().toLowerCase();
      const predefined = currentUserEmail ? USER_ROLE_OVERRIDES[currentUserEmail] : null;
      const adminInfo = currentUserEmail ? KNOWN_ADMINS[currentUserEmail] : null;
      const effectivePhone = settings?.phone_number || predefined?.phone || adminInfo?.phone || undefined;

      const isSetup = (data && data.success && data.is_setup) || isAuthenticator || !!settings?.is_enabled || !!predefined?.phone || !!adminInfo;
      const requires2FA = (data && data.success && data.requires_2fa) || isAuthenticator || !!settings?.is_enabled;

      const status: TwoFactorStatus = {
        requires_2fa: requires2FA,
        is_setup: isSetup,
        is_mandatory: (data && data.success && data.is_mandatory) || false,
        has_phone: (data && data.success && data.has_phone) || !!effectivePhone,
        preferred_channel: isAuthenticator ? 'authenticator' : (settings?.preferred_channel || (data && data.preferred_channel) || 'sms'),
        phone: effectivePhone,
      };
      setTwoFactorStatus(status);
      if (!requires2FA) {
        setTwoFactorVerified(true);
      }
      return status;
    } catch {
      setTwoFactorVerified(true);
      return null;
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
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          setIsRoleLoading(true);
          const uid = session.user.id;
          const uemail = session.user.email;
          fetchUserRole(uid, uemail)
            .then((role) => {
              setUserRole(role);
            })
            .catch((err) => {
              console.error('Failed to fetch role:', err);
              setUserRole(null);
            })
            .finally(() => {
              setIsRoleLoading(false);
            });

          check2FAStatus(uid).then((status) => {
            if (!status || !status.requires_2fa) {
              setTwoFactorVerified(true);
            }
          }).catch(() => {
            setTwoFactorVerified(true);
          });
        } else {
          setUserRole(null);
          setUserRoles([]);
          setIsRoleLoading(false);
          setTwoFactorStatus(null);
          setTwoFactorVerified(false);
        }

        setIsLoading(false);

        // Server-side auth event journal. Supabase rotates refresh tokens on
        // TOKEN_REFRESHED and mints new sessions on SIGNED_IN, which is our
        // defense against session fixation; we simply record the transitions.
        // Pull auth-layer email/phone changes into profiles (no auth-schema
        // triggers are permitted, so this is the UPDATE-side sync path).
        if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
          setTimeout(() => {
            supabase.functions.invoke('sync-auth-identity').catch(() => {});
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
      // A stale/rotated refresh token left in localStorage makes every
      // subsequent request fail with `refresh_token_not_found` and leaves the
      // app stuck half-signed-in. Detect that and clear local storage so the
      // user simply lands on a clean sign-in form.
    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      const staleToken =
        !!error &&
        /refresh[_ ]token|invalid|expired/i.test(error.message ?? '');

      if (staleToken) {
        try {
          await supabase.auth.signOut({ scope: 'local' });
        } catch {
          /* ignore */
        }
        setSession(null);
        setUser(null);
        setUserRole(null);
        setUserRoles([]);
        setIsRoleLoading(false);
        setIsLoading(false);
        return;
      }

      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        setIsRoleLoading(true);
        const uid = session.user.id;
        const uemail = session.user.email;
        fetchUserRole(uid, uemail)
          .then((role) => {
            setUserRole(role);
          })
          .catch((err) => {
            console.error('Error fetching user role in getSession:', err);
            setUserRole(null);
          })
          .finally(() => {
            setIsRoleLoading(false);
          });

        check2FAStatus(uid).then((status) => {
          if (!status || !status.requires_2fa) {
            setTwoFactorVerified(true);
          }
        }).catch(() => {
          setTwoFactorVerified(true);
        });
      } else {
        setIsRoleLoading(false);
      }

      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);
  const signUp = async (email: string, password: string, fullName: string, role: AppRole) => {
    try {
      const redirectUrl = `${window.location.origin}/`;
      const normalizedEmail = email.trim().toLowerCase();
      const predefined = USER_ROLE_OVERRIDES[normalizedEmail];
      const adminInfo = KNOWN_ADMINS[normalizedEmail];
      const effectiveFullName = fullName.trim() || predefined?.fullName || adminInfo?.fullName || fullName;
      const effectiveRole: AppRole = predefined ? predefined.role : (ADMIN_EMAILS.includes(normalizedEmail) ? 'admin' : role);

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
        email,
        password,

        options: {
          emailRedirectTo: redirectUrl,
          // `requested_role` is consumed by the handle_new_user trigger, which
          // is the single place that provisions profile + role + wallet.
          data: { full_name: effectiveFullName, requested_role: effectiveRole },
        },
      });

      if (error) {
        await logAuthEvent('sign_up_failure', { email, errorCode: error.message });
        // The email is already registered: surface it as a routable signal so
        // the UI can send the user to sign-in instead of a dead-end error.
        if (/already|registered|exists/i.test(error.message)) {
          return {
            error: new Error('This email is already registered. Please sign in instead.'),
            emailExists: true,
          };
        }
        return { error };
      }

      // Supabase obfuscates duplicate sign-ups when email confirmation is on:
      // it returns a user object with an EMPTY identities array instead of an
      // error. Treat that as "already registered" and route to sign-in.
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        await logAuthEvent('sign_up_failure', { email, errorCode: 'email_already_registered' });
        return {
          error: new Error('This email is already registered. Please sign in instead.'),
          emailExists: true,
        };
      }

      // Safety net only: the trigger already provisioned the account. Route
      // through the single idempotent provisioning RPC instead of a raw upsert.
      if (data.user) {
        try {
          await assignRole(data.user.id, effectiveRole, email.trim().toLowerCase());
        } catch (roleError) {
          console.error('Error assigning role:', roleError);
        }
      }


      await logAuthEvent('sign_up_success', { email, metadata: { role } });
      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const normalized = email.trim().toLowerCase();

      // Server-side rate limit: 5 attempts / 5 minutes per email.
      const { data: allowed, error: rlError } = await supabase.rpc('check_auth_rate_limit', {
        _identifier: `signin:${normalized}`,
        _endpoint: 'auth.signin',
        _max_requests: 5,
        _window_seconds: 300,
      });
      if (!rlError && allowed === false) {
        await logAuthEvent('sign_in_rate_limited', { email: normalized, success: false });
        return { error: new Error('Too many sign-in attempts. Please wait a few minutes and try again.') };
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalized,
        password,
      });

      if (error) {
        await logAuthEvent('sign_in_failure', {
          email: normalized,
          success: false,
          errorCode: error.message,
        });
        const msg = error.message || '';
        const code = (error as any).code || '';
        if (/email.*not.*confirm/i.test(msg) || code === 'email_not_confirmed') {
          return { error: new Error('Email not confirmed. Please check your inbox or resend verification.') };
        }
        if (/rate.*limit/i.test(msg)) {
          return { error: new Error('Too many attempts. Please wait a few minutes and try again.') };
        }
        // Generic error text — avoid account enumeration for bad credentials.
        return { error: new Error('Invalid email or password.') };
      }

      // 2FA challenge handled by the Auth page.
      setTwoFactorVerified(false);
      return { error: null, userId: data.user?.id };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const signOut = async () => {
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
    return userRole === role;
  };

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
        isRoleLoading,
        twoFactorStatus,
        twoFactorVerified,
        setTwoFactorVerified,
        signUp,
        signIn,
        signOut,
        hasRole,
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
