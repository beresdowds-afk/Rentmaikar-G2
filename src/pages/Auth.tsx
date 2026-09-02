import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/contexts/AuthContext';
import { idempotencyHeaders, resetEmailIdempotencyKey } from '@/lib/email-idempotency';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlternativeAuthOptions } from '@/components/auth/AlternativeAuthOptions';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import ConsentSection, { type MessagingChannel } from '@/components/registration/ConsentSection';
import { Loader2, AlertCircle, User, Users, ArrowLeft, Mail, CheckCircle, Smartphone } from 'lucide-react';
import PhoneOtpPanel from '@/components/auth/PhoneOtpPanel';
import { toast } from 'sonner';
import rentmaikarLogo from '@/assets/rentmaikar-logo.jpg';
import { TwoFactorChallenge } from '@/components/auth/TwoFactorChallenge';
import { PasswordInput } from '@/components/ui/password-input';
import { EmailVerification } from '@/components/auth/EmailVerification';
import { ResendButton } from '@/components/auth/ResendButton';
import { ROLE_HOME, ROLE_ONBOARDING, isStaffRole, type AppRole } from '@/lib/role-home';
import { resolvePostLoginDestination } from '@/lib/post-login-destination';
import { isRestorablePath, readReturnTo, clearReturnTo } from '@/lib/return-to';
import { logRegistrationEvent } from '@/lib/registration-audit';
import { recordSmsConsentPair } from '@/lib/sms-consent';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const signupSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters').max(100, 'Name is too long'),
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
  role: z.enum(['driver', 'owner'] as const),
  agreeTerms: z.boolean().refine(val => val, 'You must agree to the Terms of Use and Privacy Policy'),
  messagingConsent: z.boolean().refine(val => val, 'You must consent to receive service messages'),
  messagingChannel: z.string().refine((val) => ['sms', 'whatsapp'].includes(val), 'Select SMS or WhatsApp as your second channel'),
  dataSharingConsent: z.boolean().refine(val => val, 'You must consent to third-party data sharing'),
  // Optional A2P 10DLC SMS opt-ins — never required.
  smsServiceConsent: z.boolean().optional().default(false),
  smsMarketingConsent: z.boolean().optional().default(false),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

type LoginFormData = z.infer<typeof loginSchema>;
type SignupFormData = z.infer<typeof signupSchema>;
type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

const Auth = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const {
    user,
    isLoading: authLoading,
    userRole,
    twoFactorVerified,
    setTwoFactorVerified,
    signUp,
    signIn,
    check2FAStatus,
  } = useAuth();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEmailVerification, setShowEmailVerification] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string>('');
  const [activeTab, setActiveTab] = useState('login');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [loginMethod, setLoginMethod] = useState<'email' | 'phone'>('email');
  const [showLoginRecovery, setShowLoginRecovery] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);

  // 2FA state
  const [show2FA, setShow2FA] = useState(false);
  const [twoFAUserId, setTwoFAUserId] = useState<string>('');
  const [twoFAPhone, setTwoFAPhone] = useState<string>('');
  const [twoFAChannel, setTwoFAChannel] = useState<string>('sms');

  // Where to send the user after a successful sign-in. Router state is lost on a
  // hard refresh of /auth, so fall back to the sessionStorage copy written by
  // ProtectedRoute — that keeps deep links intact across reloads.
  const navState = location.state as { from?: { pathname: string; search?: string; hash?: string } } | null;
  const fromState = navState?.from
    ? `${navState.from.pathname}${navState.from.search ?? ''}${navState.from.hash ?? ''}`
    : null;
  const from = (isRestorablePath(fromState) ? fromState : readReturnTo()) || '/';

  // Deep-link support: `/auth?forgot=1` opens the forgot-password view directly
  // (used from the "Request a new reset link" button on the ResetPassword page).
  // Also surfaces OAuth-provider errors coming back on the callback URL, e.g.
  // `?error=access_denied&error_description=...`, with a friendly retry message.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('forgot') === '1') {
      setShowForgotPassword(true);
    }
    const oauthError = params.get('error') || params.get('error_code');
    const oauthDesc = params.get('error_description');
    if (oauthError) {
      const map: Record<string, string> = {
        access_denied: 'You denied access on the Google consent screen. Please retry and choose Allow.',
        server_error: 'Google could not complete sign-in. Please retry in a moment.',
        temporarily_unavailable: 'Google sign-in is temporarily unavailable. Please retry shortly.',
        invalid_request: 'The Google callback is misconfigured for this environment. Please contact support.',
        identity_already_exists: 'This Google account is already linked to a different RentMaikar user. Sign in with that account instead.',
      };
      // Supabase surfaces the "email already registered" case as an
      // "email_exists" / "user_already_exists" description. Steer the user to
      // sign in with their existing password first, then link Google from
      // Profile Settings → Connected Accounts (so no duplicate account is created).
      const dupHint = /email.*exists|user.*already.*exists|already.*registered/i.test(oauthDesc || '')
        ? 'An account with this email already exists. Sign in with your password below, then link Google from Profile Settings → Connected Accounts.'
        : null;
      const msg = dupHint || map[oauthError] || oauthDesc || 'Google sign-in failed. Please try again.';
      setError(msg);
      // Clean the URL so the error doesn't stick on refresh.
      const url = new URL(window.location.href);
      ['error', 'error_code', 'error_description', 'state'].forEach(k => url.searchParams.delete(k));
      window.history.replaceState({}, '', url.toString());
    }
  }, [location.search]);

  // Redirect authenticated users (only if 2FA is verified or not required)
  // IMPORTANT: wait until userRole has hydrated before navigating, otherwise
  // admin_assistant / support users race past the role check and land on `/`.
  useEffect(() => {
    if (!user || authLoading || !twoFactorVerified || show2FA) return;
    if (userRole === null) return; // still hydrating role

    const finishRedirect = (target: string) => {
      // Honour any real destination the user was trying to reach (deep links,
      // tab query params, role homes) instead of dropping them on a default page.
      const destination = from !== '/' && isRestorablePath(from) ? from : target;
      clearReturnTo();
      navigate(destination, { replace: true });
    };

    const routeWithCompletionCheck = async (fallbackTarget: string) => {
      // Staff accounts (admin, admin assistant, support) operate the platform
      // and have no driver/owner profile requirements — never trap them in the
      // completion wizard, which would lock them out of their dashboard.
      if (isStaffRole(userRole as AppRole)) {
        finishRedirect(fallbackTarget);
        return;
      }
      // OAuth (e.g. Google) users may land here with a bare profile — send
      // them to the completion wizard when mandatory fields are missing.
      const { data: comp } = await supabase.rpc('get_profile_completion_status');
      const mandatoryComplete = (comp as { mandatory_complete?: boolean } | null)?.mandatory_complete;
      if (comp && mandatoryComplete === false) {
        const returnTo = encodeURIComponent(fallbackTarget);
        navigate(`/onboarding/complete-profile?returnTo=${returnTo}`, { replace: true });
        return;
      }
      finishRedirect(fallbackTarget);
    };

    // Role-based landing: staff go to their operations dashboard; drivers and
    // owners land on the agreement page when a signature is still outstanding,
    // otherwise on their own dashboard (which renders <OnboardingChecklist />
    // so they can continue any incomplete steps).
    void (async () => {
      const target = await resolvePostLoginDestination(
        user.id,
        userRole as AppRole,
        (from as string) || '/',
      );
      await routeWithCompletionCheck(target);
    })();
  }, [user, authLoading, userRole, navigate, from, twoFactorVerified, show2FA]);

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const signupForm = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      fullName: '',
      email: '',
      password: '',
      confirmPassword: '',
      role: 'driver',
      agreeTerms: false,
      messagingConsent: false,
      messagingChannel: 'none',
      dataSharingConsent: false,
      smsServiceConsent: false,
      smsMarketingConsent: false,
    },
  });

  const forgotPasswordForm = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: '',
    },
  });

  const handleLogin = async (data: LoginFormData) => {
    setIsSubmitting(true);
    setError(null);
    setShowEmailVerification(false);
    setShowLoginRecovery(false);

    const { error, userId } = await signIn(data.email, data.password);

    if (error) {
      if (/invalid (login credentials|email or password)/i.test(error.message)) {
        setError('Invalid email or password.');
        // Most failures here are accounts created through Google (no password
        // set yet) or a forgotten password. Offer both recoveries inline —
        // shown for every failure, so it never reveals whether the account exists.
        setShowLoginRecovery(true);
        forgotPasswordForm.setValue('email', data.email.trim().toLowerCase());
      } else if (error.message.includes('Email not confirmed') || error.message.includes('email_not_confirmed')) {
        setUnverifiedEmail(data.email);
        setShowEmailVerification(true);
      } else {
        setError(error.message);
      }
      setIsSubmitting(false);
      return;
    }


    // Check 2FA status
    if (userId) {
      const status = await check2FAStatus(userId);
      if (status && (status.requires_2fa || status.is_setup) && status.has_phone && status.phone) {
        // Show 2FA challenge
        setTwoFAUserId(userId);
        setTwoFAPhone(status.phone);
        setTwoFAChannel(status.preferred_channel);
        setShow2FA(true);
        setIsSubmitting(false);
        return;
      }
    }

    // No 2FA required — mark as verified and proceed
    setTwoFactorVerified(true);
    toast.success('Welcome back!');
    setIsSubmitting(false);
  };

  const handleBackFromVerification = () => {
    setShowEmailVerification(false);
    setUnverifiedEmail('');
  };

  const handleSignup = async (data: SignupFormData) => {
    // Prevent duplicate submissions
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    const { error, emailExists } = await signUp(data.email, data.password, data.fullName, data.role);

    if (error) {
      const normalized = data.email.trim().toLowerCase();
      if (emailExists || error.message.includes('already registered')) {
        // Registered email: switch to the sign-in tab with the email prefilled
        // instead of leaving the user stuck on the sign-up form.
        loginForm.setValue('email', normalized);
        forgotPasswordForm.setValue('email', normalized);
        setActiveTab('login');
        setError('This email is already registered — please sign in below.');
        void logRegistrationEvent('signin_redirect_existing_email', {
          email: normalized,
          metadata: { origin: 'auth_signup_tab', requested_role: data.role },
        });
        toast.info('You already have an account', {
          description: 'We switched you to sign-in. Use "Forgot password" if needed.',
        });
        setTimeout(() => loginForm.setFocus('password'), 100);
      } else {
        setError(error.message);
      }
    } else {
      // Drivers and owners must produce an `applications` record, otherwise the
      // onboarding checklist has no stage to advance. Send them straight into
      // the registration flow instead of leaving them on a dead-end account.
      // Persist consent choices on the freshly created profile.
      try {
        const { data: session } = await supabase.auth.getUser();
        const uid = session?.user?.id;
        if (uid) {
          await supabase
            .from('profiles')
            .update({
              notification_email: true,
              notification_sms: data.messagingChannel === 'sms',
              notification_whatsapp: data.messagingChannel === 'whatsapp',
              messaging_consent_at: new Date().toISOString(),
              data_sharing_consent: data.dataSharingConsent,
              data_sharing_consent_at: data.dataSharingConsent ? new Date().toISOString() : null,
            })
            .eq('user_id', uid);

          // A2P 10DLC: auditable SMS opt-in record with the disclosure shown.
          await recordSmsConsentPair({
            userId: uid,
            serviceConsent: !!data.smsServiceConsent,
            marketingConsent: !!data.smsMarketingConsent,
            source: 'signup',
          });
        }
      } catch (e) {
        console.warn('Could not persist consent preferences:', e);
      }

      const registrationPath =
        data.role === 'owner' ? '/owner/register' : '/driver/register';

      toast.success('Account created successfully!', {
        description: 'Next: complete your registration details.',
      });
      signupForm.reset();
      navigate(registrationPath, { replace: true });
    }


    setIsSubmitting(false);
  };

  const handleForgotPassword = async (data: ForgotPasswordFormData) => {
    if (isSubmitting) return;

    const normalized = data.email.trim().toLowerCase();

    if (!normalized) {
      setError('Please enter your email address.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Rate-limit reset requests: 3 per email per 15 minutes.
      const { data: allowed } = await supabase.rpc('check_auth_rate_limit', {
        _identifier: `reset:${normalized}`,
        _endpoint: 'auth.reset_password',
        _max_requests: 3,
        _window_seconds: 900,
      });

      if (allowed !== false) {
        // Delivered through our own Resend pipeline (branded template, the same
        // path all other transactional mail uses) instead of the built-in auth
        // mailer, so reset links reliably reach the inbox.
        const { error } = await supabase.functions.invoke('send-password-reset', {
          body: { email: normalized, redirectOrigin: window.location.origin },
          headers: idempotencyHeaders('password_reset', normalized),
        });
        // Log outcome server-side without revealing it to the caller.
        await supabase.rpc('log_auth_event', {
          _event_type: error ? 'password_reset_failure' : 'password_reset_requested',
          _email: normalized,
          _success: !error,
          _error_code: error?.message ?? null,
          _metadata: {} as any,
        });
      } else {
        await supabase.rpc('log_auth_event', {
          _event_type: 'password_reset_rate_limited',
          _email: normalized,
          _success: false,
          _metadata: {} as any,
        });
      }


      // Always respond generically to prevent account enumeration.
      setResetEmailSent(true);
      toast.success('If an account exists for that email, a reset link has been sent.', {
        description: 'Check your inbox and spam folder.',
      });
    } catch (err: any) {
      // Still respond generically even on unexpected errors.
      setResetEmailSent(true);
    }

    setIsSubmitting(false);
  };



  const handleBackToLogin = () => {
    setShowForgotPassword(false);
    setShowLoginRecovery(false);
    setResetEmailSent(false);
    setError(null);
    forgotPasswordForm.reset();
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Two-Factor Authentication Challenge
  if (show2FA) {
    return (
      <TwoFactorChallenge
        userId={twoFAUserId}
        phone={twoFAPhone}
        channel={twoFAChannel}
        onVerified={() => {
          setShow2FA(false);
          setTwoFactorVerified(true);
          toast.success('Welcome back!');
        }}
        onCancel={async () => {
          setShow2FA(false);
          await supabase.auth.signOut();
        }}
      />
    );
  }

  // Email Verification Required View
  if (showEmailVerification) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-xl bg-warning/10 flex items-center justify-center mb-4">
              <Mail className="w-6 h-6 text-warning" />
            </div>
            <CardTitle className="text-2xl font-display">Verify Your Email</CardTitle>
            <CardDescription>
              Your email address needs to be verified before you can log in
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <EmailVerification
              email={unverifiedEmail}
              showAsCard={false}
              redirectTo={`${window.location.origin}/auth`}
            />

            <div className="pt-4 border-t border-border">
              <div className="text-sm text-muted-foreground space-y-2">
                <p className="font-medium">Tips:</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>Check your spam or junk folder</li>
                  <li>Make sure you entered the correct email address</li>
                  <li>Verification links expire after 24 hours</li>
                  <li>Add our email to your contacts to prevent spam filtering</li>
                </ul>
              </div>
            </div>
          </CardContent>

          
          <CardFooter>
            <Button 
              variant="ghost" 
              className="w-full gap-2" 
              onClick={handleBackFromVerification}
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Login
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Forgot Password View
  if (showForgotPassword) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-xl bg-primary flex items-center justify-center mb-4">
              <Mail className="w-6 h-6 text-primary-foreground" />
            </div>
            <CardTitle className="text-2xl font-display">Reset Password</CardTitle>
            <CardDescription>
              {resetEmailSent 
                ? "Check your email for a reset link"
                : "Enter your email to receive a password reset link"
              }
            </CardDescription>
          </CardHeader>

          {resetEmailSent ? (
            <CardContent className="space-y-4">
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  We've sent a password reset link to <strong>{forgotPasswordForm.getValues('email')}</strong>.
                </AlertDescription>
              </Alert>
              <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-2">
                <p className="font-medium text-foreground">What happens next:</p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>Open the email and tap <strong>Reset password</strong>.</li>
                  <li>Choose a new password (min. 6 characters, different from the old one).</li>
                  <li>You'll be signed out on all devices and asked to log in again.</li>
                </ol>
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-2">
                  ⏱ The reset link expires in <strong>1 hour</strong>. If it expires, request a new one from this page.
                </p>
              </div>
              <ResendButton
                channel="email"
                identifier={forgotPasswordForm.getValues('email')}
                label="Resend reset email"
                className="w-full"
                onResend={async () => {
                  const target = forgotPasswordForm.getValues('email').trim().toLowerCase();
                  if (!target) throw new Error('Enter your email first.');
                  const { error } = await supabase.functions.invoke('send-password-reset', {
                    body: { email: target, redirectOrigin: window.location.origin },
                    headers: idempotencyHeaders('password_reset', target),
                  });
                  if (error) throw error;
                  resetEmailIdempotencyKey('password_reset', target);
                  toast.success('Reset email sent again. Check your inbox and spam folder.');
                }}
              />
              <p className="text-xs text-muted-foreground text-center">
                Didn't receive the email? Check your spam folder, then resend.
              </p>
            </CardContent>

          ) : (
            <form onSubmit={forgotPasswordForm.handleSubmit(handleForgotPassword)}>
              <CardContent className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                
                <div className="space-y-2">
                  <Label htmlFor="forgot-email">Email</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    autoFocus
                    {...forgotPasswordForm.register('email')}
                    disabled={isSubmitting}
                  />
                  {forgotPasswordForm.formState.errors.email && (
                    <p className="text-sm text-destructive">{forgotPasswordForm.formState.errors.email.message}</p>
                  )}
                </div>
              </CardContent>
              
              <CardFooter className="flex flex-col gap-3">
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    'Send Reset Link'
                  )}
                </Button>
              </CardFooter>
            </form>
          )}
          
          <CardFooter className="pt-0">
            <Button 
              variant="ghost" 
              className="w-full gap-2" 
              onClick={handleBackToLogin}
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Login
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <h1 className="sr-only">Sign in to Rentmaikar</h1>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Link to="/" className="mx-auto mb-4">
            <img 
              src={rentmaikarLogo} 
              alt="Rentmaikar" 
              className="h-16 w-auto object-contain"
            />
          </Link>
          <CardTitle className="text-2xl font-display">Welcome Back</CardTitle>
          <CardDescription>
            Sign in to access your dashboard
          </CardDescription>
        </CardHeader>
        
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 mx-4" style={{ width: 'calc(100% - 2rem)' }}>
            <TabsTrigger value="login">Log In</TabsTrigger>
            <TabsTrigger value="signup">Sign Up</TabsTrigger>
          </TabsList>

          {/* Login Tab */}
          <TabsContent value="login">
            <form onSubmit={loginForm.handleSubmit(handleLogin)}>
              <CardContent className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {error}
                      {showLoginRecovery && (
                        <span className="mt-2 block text-sm">
                          If you created this account with Google, use{' '}
                          <strong>Continue with Google</strong> below. Otherwise{' '}
                          <button
                            type="button"
                            className="underline underline-offset-2 font-medium"
                            onClick={() => {
                              setShowForgotPassword(true);
                              setShowLoginRecovery(false);
                              setError(null);
                            }}
                          >
                            reset your password
                          </button>
                          .
                        </span>
                      )}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Choose how to sign in: password or a one-time SMS code. */}
                <div className="grid grid-cols-2 gap-2" role="group" aria-label="Sign-in method">
                  <Button
                    type="button"
                    variant={loginMethod === 'email' ? 'default' : 'outline'}
                    onClick={() => setLoginMethod('email')}
                    data-testid="login-method-email"
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Email
                  </Button>
                  <Button
                    type="button"
                    variant={loginMethod === 'phone' ? 'default' : 'outline'}
                    onClick={() => setLoginMethod('phone')}
                    data-testid="login-method-phone"
                  >
                    <Smartphone className="h-4 w-4 mr-2" />
                    Phone OTP
                  </Button>
                </div>

                {loginMethod === 'phone' ? (
                  <PhoneOtpPanel mode="signin" defaultRole="driver" />
                ) : (
                  <>
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    autoFocus
                    {...loginForm.register('email')}
                    disabled={isSubmitting}
                  />
                  {loginForm.formState.errors.email && (
                    <p className="text-sm text-destructive">{loginForm.formState.errors.email.message}</p>
                  )}
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="login-password">Password</Label>
                    <Button 
                      type="button"
                      variant="link" 
                      className="px-0 h-auto text-sm text-muted-foreground hover:text-primary"
                      onClick={() => {
                        setShowForgotPassword(true);
                        setError(null);
                      }}
                    >
                      Forgot password?
                    </Button>
                  </div>
                  <PasswordInput
                    id="login-password"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    {...loginForm.register('password')}
                    disabled={isSubmitting}
                  />
                  {loginForm.formState.errors.password && (
                    <p className="text-sm text-destructive">{loginForm.formState.errors.password.message}</p>
                  )}
                </div>
                  </>
                )}

                <ConsentSection
                  messagingConsent={!!signupForm.watch('messagingConsent')}
                  messagingChannel={(signupForm.watch('messagingChannel') as MessagingChannel) ?? 'none'}
                  dataSharingConsent={!!signupForm.watch('dataSharingConsent')}
                  onMessagingConsentChange={(v) => signupForm.setValue('messagingConsent', v, { shouldValidate: true })}
                  onMessagingChannelChange={(v) => signupForm.setValue('messagingChannel', v, { shouldValidate: true })}
                  onDataSharingConsentChange={(v) => signupForm.setValue('dataSharingConsent', v, { shouldValidate: true })}
                  messagingError={signupForm.formState.errors.messagingConsent?.message as string | undefined}
                  channelError={signupForm.formState.errors.messagingChannel?.message as string | undefined}
                  dataSharingError={signupForm.formState.errors.dataSharingConsent?.message as string | undefined}
                  smsServiceConsent={!!signupForm.watch('smsServiceConsent')}
                  smsMarketingConsent={!!signupForm.watch('smsMarketingConsent')}
                  onSmsServiceConsentChange={(v) => signupForm.setValue('smsServiceConsent', v)}
                  onSmsMarketingConsentChange={(v) => signupForm.setValue('smsMarketingConsent', v)}
                />

                <AlternativeAuthOptions defaultRole="driver" showPhone={loginMethod === 'email'} />

              </CardContent>
              
              {loginMethod === 'email' && (
                <CardFooter>
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      'Sign In'
                    )}
                  </Button>
                </CardFooter>
              )}

            </form>
          </TabsContent>

          {/* Signup Tab */}
          <TabsContent value="signup">
            <form onSubmit={signupForm.handleSubmit(handleSignup)}>
              <CardContent className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Full Name</Label>
                  <Input
                    id="signup-name"
                    type="text"
                    placeholder="John Doe"
                    autoComplete="name"
                    autoFocus
                    {...signupForm.register('fullName')}
                    disabled={isSubmitting}
                  />
                  {signupForm.formState.errors.fullName && (
                    <p className="text-sm text-destructive">{signupForm.formState.errors.fullName.message}</p>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    {...signupForm.register('email')}
                    disabled={isSubmitting}
                  />
                  {signupForm.formState.errors.email && (
                    <p className="text-sm text-destructive">{signupForm.formState.errors.email.message}</p>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="signup-role">I am a</Label>
                  <Select
                    value={signupForm.watch('role')}
                    onValueChange={(value: 'driver' | 'owner') => signupForm.setValue('role', value)}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select your role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="driver">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          Driver
                        </div>
                      </SelectItem>
                      <SelectItem value="owner">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4" />
                          Vehicle Owner
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <PasswordInput
                    id="signup-password"
                    placeholder="••••••••"
                    autoComplete="new-password"
                    {...signupForm.register('password')}
                    disabled={isSubmitting}
                  />
                  {signupForm.formState.errors.password && (
                    <p className="text-sm text-destructive">{signupForm.formState.errors.password.message}</p>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="signup-confirm">Confirm Password</Label>
                  <PasswordInput
                    id="signup-confirm"
                    placeholder="••••••••"
                    autoComplete="new-password"
                    {...signupForm.register('confirmPassword')}
                    disabled={isSubmitting}
                  />
                  {signupForm.formState.errors.confirmPassword && (
                    <p className="text-sm text-destructive">{signupForm.formState.errors.confirmPassword.message}</p>
                  )}
                </div>

                <div className="flex items-start gap-3">
                  <Checkbox
                    id="signup-terms"
                    checked={signupForm.watch('agreeTerms')}
                    onCheckedChange={(checked) => signupForm.setValue('agreeTerms', checked as boolean)}
                    disabled={isSubmitting}
                  />
                  <label htmlFor="signup-terms" className="text-sm text-muted-foreground cursor-pointer leading-relaxed">
                    I have read and agree to the{" "}
                    <a href="/terms" target="_blank" className="text-primary hover:underline font-medium">
                      Terms of Use
                    </a>{" "}
                    and{" "}
                    <a href="/privacy" target="_blank" className="text-primary hover:underline font-medium">
                      Privacy Policy
                    </a>
                  </label>
                </div>
                {signupForm.formState.errors.agreeTerms && (
                  <p className="text-sm text-destructive">{signupForm.formState.errors.agreeTerms.message}</p>
                )}

                <AlternativeAuthOptions defaultRole={(signupForm.watch('role') as 'driver' | 'owner') || 'driver'} />
              </CardContent>
              
              <CardFooter>
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating account...
                    </>
                  ) : (
                    'Create Account'
                  )}
                </Button>
              </CardFooter>
            </form>
          </TabsContent>
        </Tabs>
      </Card>
    </main>
  );
};

export default Auth;
