import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ROLE_HOME, type AppRole } from '@/lib/role-home';
import { rememberReturnTo } from '@/lib/return-to';

interface PortalSignInFormProps {
  /** Roles allowed to use this portal entrance. */
  allowedRoles: AppRole[];
  title: string;
  description: string;
  /** Where to land after a successful, role-checked sign-in. */
  destination: string;
  /** Optional sign-up route shown under the form. */
  signUpHref?: string;
  signUpLabel?: string;
}

/**
 * Role-scoped sign-in entrance. Uses the same credentials and session as the
 * main auth screen, but only lets the named roles through and lands them
 * directly on their portal. Accounts with mandatory 2FA are handed to /auth,
 * which owns the challenge UI.
 */
export default function PortalSignInForm({
  allowedRoles,
  title,
  description,
  destination,
  signUpHref,
  signUpLabel,
}: PortalSignInFormProps) {
  const navigate = useNavigate();
  const { signIn, check2FAStatus } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { error: signInError, userId } = await signIn(email, password);
      if (signInError || !userId) {
        setError(signInError?.message ?? 'Invalid email or password.');
        return;
      }

      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      const held = (roles ?? []).map((r) => r.role as AppRole);
      const match = held.find((r) => allowedRoles.includes(r));
      if (!match) {
        await supabase.auth.signOut();
        setError('This account does not have access to this portal.');
        return;
      }

      // Mandatory 2FA (admins/owners) is challenged on the main auth screen.
      const status = await check2FAStatus(userId);
      if (status?.requires_2fa) {
        rememberReturnTo(destination);
        navigate('/auth', { replace: true });
        return;
      }

      navigate(destination || ROLE_HOME[match] || '/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-2">
        <div className="flex items-center gap-2 text-primary">
          <ShieldCheck className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-wide">Secure portal</span>
        </div>
        <CardTitle className="text-2xl">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="portal-email">Email address</Label>
            <Input
              id="portal-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="portal-password">Password</Label>
            <PasswordInput
              id="portal-password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Sign in
          </Button>
        </form>
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-2 text-sm text-muted-foreground">
        <Link to="/auth" className="underline underline-offset-4 hover:text-foreground">
          Forgot your password?
        </Link>
        {signUpHref && (
          <Link to={signUpHref} className="underline underline-offset-4 hover:text-foreground">
            {signUpLabel ?? 'Create an account'}
          </Link>
        )}
      </CardFooter>
    </Card>
  );
}
