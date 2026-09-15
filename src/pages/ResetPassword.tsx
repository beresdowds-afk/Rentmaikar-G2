import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { KeyRound, Loader2, AlertCircle, CheckCircle, Eye, EyeOff, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { ResendButton } from '@/components/auth/ResendButton';
import { idempotencyHeaders, resetEmailIdempotencyKey } from '@/lib/email-idempotency';

const resetPasswordSchema = z.object({
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

const ResetPassword = () => {
  const navigate = useNavigate();
  const { sendPasswordReset } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [redirectSeconds, setRedirectSeconds] = useState(5);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isValidSession, setIsValidSession] = useState<boolean | null>(null);
  const [linkErrorMessage, setLinkErrorMessage] = useState<string | null>(null);
  const [resendEmail, setResendEmail] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('email') || '';
    } catch {
      return '';
    }
  });
  const [resendStatus, setResendStatus] = useState<'idle' | 'sent' | 'error'>('idle');
  const [otpCode, setOtpCode] = useState('');
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const sessionFoundRef = useRef(false);

  const handleVerifyCode = async () => {
    const targetEmail = resendEmail.trim().toLowerCase();
    const targetCode = otpCode.trim();
    if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
      toast.error('Please enter a valid email address.');
      return;
    }
    if (!targetCode || targetCode.length < 6) {
      toast.error('Please enter the 6-digit code sent to your email.');
      return;
    }
    setIsVerifyingOtp(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        type: 'recovery',
        email: targetEmail,
        token: targetCode,
      });
      if (error) {
        toast.error('Invalid or expired code. Please request a new one.');
      } else {
        toast.success('Code verified! Enter your new password below.');
        sessionFoundRef.current = true;
        setIsValidSession(true);
        window.history.replaceState({}, '', '/reset-password');
      }
    } catch (err: any) {
      toast.error(err.message || 'Verification failed');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const form = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  });

  useEffect(() => {
    const markValid = () => {
      sessionFoundRef.current = true;
      setIsValidSession(true);
    };

    // Listen for auth state changes FIRST (recovery link will trigger this)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        markValid();
      } else if (event === 'SIGNED_IN' && session) {
        markValid();
      }
    });

    // Recovery links arrive in three shapes depending on how they were minted:
    //   #access_token=...        -> handled automatically by detectSessionInUrl
    //   ?code=...                -> PKCE, needs an explicit exchange
    //   ?token_hash=...&type=recovery -> needs verifyOtp
    // Providers can also bounce back an error in the hash/query.
    const consumeLink = async () => {
      const query = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));

      const linkError = query.get('error_description') || hash.get('error_description')
        || query.get('error') || hash.get('error');
      if (linkError) {
        setLinkErrorMessage(
          /expired|invalid/i.test(linkError)
            ? 'This reset link has expired or was already used.'
            : linkError,
        );
        sessionFoundRef.current = true;
        setIsValidSession(false);
        return;
      }

      const code = query.get('code');
      const tokenHash = query.get('token_hash') ?? hash.get('token_hash');
      const token = query.get('token') ?? query.get('otp') ?? hash.get('token');
      const email = query.get('email') ?? hash.get('email');

      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (!error) {
            markValid();
            window.history.replaceState({}, '', '/reset-password');
            return;
          }
        } else if (token && email) {
          const { error } = await supabase.auth.verifyOtp({
            type: 'recovery',
            email: email.trim().toLowerCase(),
            token: token.trim(),
          });
          if (!error) {
            markValid();
            window.history.replaceState({}, '', '/reset-password');
            return;
          }
        } else if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash });
          if (!error) {
            markValid();
            window.history.replaceState({}, '', '/reset-password');
            return;
          }
        }
      } catch {
        /* fall through to the session check below */
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session) markValid();
    };

    void consumeLink();

    // Fallback timeout — use ref to avoid stale closure
    const timeout = setTimeout(() => {
      if (!sessionFoundRef.current) {
        setIsValidSession(false);
      }
    }, 6000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const handleResetPassword = async (data: ResetPasswordFormData) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const { error } = await supabase.auth.updateUser({
        password: data.password,
      });

      if (error) {
        if (error.message.includes('same as the old password')) {
          setError('New password must be different from your current password.');
        } else {
          setError(error.message);
        }
      } else {
        setIsSuccess(true);
        toast.success('Password updated successfully!');

        // 5-second visible countdown, then sign out and route to login.
        setRedirectSeconds(5);
        const tick = setInterval(() => {
          setRedirectSeconds((s) => (s > 0 ? s - 1 : 0));
        }, 1000);
        setTimeout(async () => {
          clearInterval(tick);
          await supabase.auth.signOut();
          navigate('/auth', { replace: true });
        }, 5000);
      }
    } catch (err: any) {
      setError(err.message);
    }

    setIsSubmitting(false);
  };

  // Loading state while checking session
  if (isValidSession === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Verifying reset link...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Invalid or expired session
  if (!isValidSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center mb-4">
              <AlertCircle className="w-6 h-6 text-destructive" />
            </div>
            <CardTitle className="text-2xl font-display">Reset Link Expired</CardTitle>
            <CardDescription>
              This password reset link is invalid or has expired.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {linkErrorMessage ? `${linkErrorMessage} ` : ''}
                Password reset links expire <strong>1 hour</strong> after they are sent.
              </AlertDescription>
            </Alert>

            {/* Code Verification Option */}
            <div className="rounded-lg border bg-card p-4 space-y-3 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <KeyRound className="h-4 w-4 text-primary" />
                <span>Enter 6-Digit Reset Code</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Received an email with a 6-digit reset code? Enter it below to unlock your password reset immediately:
              </p>
              <div className="space-y-2">
                <Input
                  type="email"
                  placeholder="your.email@example.com"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  className="bg-background text-sm"
                />
                <Input
                  type="text"
                  placeholder="123456"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  className="bg-background text-base font-mono tracking-widest text-center"
                />
                <Button
                  type="button"
                  className="w-full"
                  disabled={isVerifyingOtp || otpCode.length < 6 || !resendEmail}
                  onClick={handleVerifyCode}
                >
                  {isVerifyingOtp ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying Code...
                    </>
                  ) : (
                    'Verify Code & Set Password'
                  )}
                </Button>
              </div>
            </div>

            {/* Resend Option */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Mail className="h-4 w-4 text-primary" />
                <span>Need a new reset email?</span>
              </div>
              <p className="text-xs text-muted-foreground">
                We'll deliver a fresh reset code and one-click link to your inbox.
              </p>

              {resendStatus === 'sent' && (
                <Alert className="border-green-200 bg-green-50 text-green-900 py-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-xs text-green-800">
                    A fresh reset email has been sent to <strong>{resendEmail}</strong>. Check your inbox and spam folder.
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <ResendButton
                  channel="email"
                  identifier={resendEmail.trim().toLowerCase()}
                  label="Send new reset email"
                  className="w-full"
                  variant="outline"
                  onResend={async () => {
                    const target = resendEmail.trim().toLowerCase();
                    if (!target || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
                      toast.error('Please enter a valid email address.');
                      return;
                    }
                    try {
                      const { error: resetErr } = await sendPasswordReset(target, {
                        redirectOrigin: window.location.origin,
                      });
                      if (resetErr) throw resetErr;
                      resetEmailIdempotencyKey('password_reset', target);
                      setResendStatus('sent');
                      toast.success('Reset email sent via verified gateway! Check your inbox.');
                    } catch (err) {
                      console.error('Failed to resend reset email', err);
                      toast.error('Unable to send reset email. Please try again shortly.');
                    }
                  }}
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            <Button variant="ghost" className="w-full" onClick={() => navigate('/auth')}>
              Back to Login
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Success state
  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center mb-4">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <CardTitle className="text-2xl font-display">Password Updated!</CardTitle>
            <CardDescription>
              Your password has been successfully reset.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                Redirecting you to the login page in <strong>{redirectSeconds}s</strong>...
              </AlertDescription>
            </Alert>
            <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1 text-muted-foreground">
              <p className="font-medium text-foreground">What happens next:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>You'll be signed out from every device (including this one) for security.</li>
                <li>Log in with your email and the new password you just set.</li>
                <li>If you use two-factor authentication, you'll still need your 2FA code.</li>
              </ol>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              className="w-full"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate('/auth', { replace: true });
              }}
            >
              Go to Login Now
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-xl bg-primary flex items-center justify-center mb-4">
            <KeyRound className="w-6 h-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl font-display">Create New Password</CardTitle>
          <CardDescription>
            Enter a new password for your account
          </CardDescription>
        </CardHeader>

        <form onSubmit={form.handleSubmit(handleResetPassword)}>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  {...form.register('password')}
                  disabled={isSubmitting}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              {form.formState.errors.password && (
                <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  {...form.register('confirmPassword')}
                  disabled={isSubmitting}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              {form.formState.errors.confirmPassword && (
                <p className="text-sm text-destructive">{form.formState.errors.confirmPassword.message}</p>
              )}
            </div>

            <div className="text-xs text-muted-foreground space-y-1">
              <p>Password requirements:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>At least 6 characters long</li>
                <li>Must be different from your current password</li>
              </ul>
            </div>
          </CardContent>
          
          <CardFooter>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating Password...
                </>
              ) : (
                'Update Password'
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};

export default ResetPassword;
