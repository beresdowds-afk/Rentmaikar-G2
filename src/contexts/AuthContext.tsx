import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { assignRole } from '@/lib/user-provisioning';

type AppRole = 'admin' | 'admin_assistant' | 'owner' | 'driver' | 'legal_support' | 'iot_support' | 'vehicle_support';

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
  isRoleLoading: boolean;
  twoFactorStatus: TwoFactorStatus | null;
  twoFactorVerified: boolean;
  setTwoFactorVerified: (verified: boolean) => void;
  signUp: (email: string, password: string, fullName: string, role: AppRole) => Promise<{ error: Error | null; emailExists?: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null; userId?: string }>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  check2FAStatus: (userId: string) => Promise<TwoFactorStatus | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<AppRole | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);
  const [twoFactorStatus, setTwoFactorStatus] = useState<TwoFactorStatus | null>(null);
  const [twoFactorVerified, setTwoFactorVerified] = useState(false);

  // Users can legitimately hold more than one role row. Resolve deterministically
  // by priority instead of asking PostgREST for a single row (which errors out
  // with PGRST116 and leaves the app role-less / flickering).
  const ROLE_PRIORITY: AppRole[] = [
    'admin',
    'admin_assistant',
    'legal_support',
    'iot_support',
    'vehicle_support',
    'owner',
    'driver',
  ];

  const fetchUserRole = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      if (error) {
        console.error('Error fetching user role:', error);
        return null;
      }

      const roles = (data ?? []).map((r) => r.role as AppRole);
      if (roles.length === 0) return null;

      return ROLE_PRIORITY.find((r) => roles.includes(r)) ?? roles[0];
    } catch (err) {
      console.error('Error in fetchUserRole:', err);
      return null;
    }
  };


  const check2FAStatus = async (userId: string): Promise<TwoFactorStatus | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('send-2fa-code', {
        body: { action: 'status', user_id: userId },
      });
      if (error || !data?.success) return null;

      // Also get the phone number from 2FA settings
      const { data: settings } = await supabase
        .from('two_factor_settings')
        .select('phone_number, preferred_channel')
        .eq('user_id', userId)
        .maybeSingle();

      const status: TwoFactorStatus = {
        requires_2fa: data.requires_2fa,
        is_setup: data.is_setup,
        is_mandatory: data.is_mandatory,
        has_phone: data.has_phone,
        preferred_channel: data.preferred_channel || 'sms',
        phone: settings?.phone_number || undefined,
      };
      setTwoFactorStatus(status);
      return status;
    } catch {
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

  useEffect(() => {
    // Set up auth state listener FIRST — synchronous state, deferred side effects.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          setIsRoleLoading(true);
          setTimeout(() => {
            fetchUserRole(session.user.id).then((role) => {
              setUserRole(role);
              setIsRoleLoading(false);
            });
          }, 0);
        } else {
          setUserRole(null);
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
        setIsRoleLoading(false);
        setIsLoading(false);
        return;
      }

      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        setIsRoleLoading(true);
        fetchUserRole(session.user.id).then((role) => {
          setUserRole(role);
          setIsRoleLoading(false);
        });
        setTwoFactorVerified(true);
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
          data: { full_name: fullName, requested_role: role },
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
          await assignRole(data.user.id, role as AppRole, email.trim().toLowerCase());
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
        // Generic error text — avoid account enumeration.
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
    setTwoFactorStatus(null);
    setTwoFactorVerified(false);
  };


  const hasRole = (role: AppRole) => {
    return userRole === role;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading,
        userRole,
        isRoleLoading,
        twoFactorStatus,
        twoFactorVerified,
        setTwoFactorVerified,
        signUp,
        signIn,
        signOut,
        hasRole,
        check2FAStatus,
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
