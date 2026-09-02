import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Lock, LogIn } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { ROLE_HOME, type AppRole } from '@/lib/role-home';

interface GateArgs {
  allowedRoles: AppRole[];
  label: string;
}

/**
 * Returns a JSX element to render in place of the dashboard when the
 * visitor is not authenticated or lacks the required role. Returns null
 * when the caller should render its real dashboard content.
 *
 * Use as an early return so downstream JSX (which may deref rental /
 * vehicle fields) never evaluates for unauthenticated users.
 */
export function useDashboardAuthGate({ allowedRoles, label }: GateArgs): ReactNode | null {
  const { user, isLoading, userRole, isRoleLoading } = useAuth();
  const location = useLocation();

  // A user who already registered must never be pushed back into a fresh
  // sign-up. Look up their existing application so the "no role yet" screen
  // can show status instead of registration CTAs.
  const { data: existingApplication } = useQuery({
    queryKey: ['auth-gate-application', user?.id],
    enabled: !!user?.id && !userRole && !isRoleLoading,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('applications')
        .select('id, status, application_type')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data ?? null;
    },
  });


  if (isLoading || (user && isRoleLoading)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="text-sm">Loading your dashboard…</p>
        </div>
      </div>
    );
  }

  const effectiveAllowed: AppRole[] = Array.from(new Set([...allowedRoles, 'admin']));

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center px-4 py-16">
          <h1 className="sr-only">{label}</h1>
          <Card className="max-w-md w-full border-primary/20">
            <CardHeader className="text-center space-y-3">
              <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Lock className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>Sign in to view your {label}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                This page shows personalized rental, payment and vehicle
                information. Please sign in to your Rentmaikar account to
                continue.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                <Button asChild className="gap-2">
                  <Link to="/auth" state={{ from: location }}>
                    <LogIn className="h-4 w-4" />
                    Sign in
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/">Back to home</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  // A signed-in account with no role row must NOT fall through to the
  // dashboard — treat "no role" the same as "wrong role".
  if (!userRole || !effectiveAllowed.includes(userRole)) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center px-4 py-16">
          <h1 className="sr-only">{label}</h1>
          <Card className="max-w-md w-full border-destructive/30">
            <CardHeader className="text-center space-y-3">
              <div className="mx-auto h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <Lock className="h-6 w-6 text-destructive" />
              </div>
              <CardTitle>You don’t have access to the {label}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                {userRole ? (
                  <>
                    Your account is registered as{' '}
                    <span className="font-semibold">{userRole.replace('_', ' ')}</span>.
                    Please head to your own workspace instead.
                  </>
                ) : existingApplication ? (
                  <>
                    Your {existingApplication.application_type ?? ''} registration is on
                    file (status:{' '}
                    <span className="font-semibold">{existingApplication.status}</span>).
                    You don’t need to sign up again — access opens as soon as an admin
                    finishes the review.
                  </>
                ) : (
                  <>
                    No role has been assigned to your account yet. Complete your
                    registration, or contact support if you believe this is an error.
                  </>
                )}
              </p>
              {userRole ? (
                <Button asChild>
                  <Link to={ROLE_HOME[userRole]}>Go to my dashboard</Link>
                </Button>
              ) : existingApplication ? (
                <div className="flex flex-col sm:flex-row gap-2 justify-center">
                  <Button onClick={() => window.location.reload()}>
                    Refresh access
                  </Button>
                  <Button asChild variant="ghost">
                    <Link to="/faq">Contact support</Link>
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-2 justify-center">
                  <Button asChild>
                    <Link to="/driver/register">Register as a driver</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link to="/owner/register">Register as an owner</Link>
                  </Button>
                  <Button asChild variant="ghost">
                    <Link to="/faq">Contact support</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  return null;
}
