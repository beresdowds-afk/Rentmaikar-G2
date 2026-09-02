import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, Car, Shield, CreditCard, ArrowRight, Loader2, AlertTriangle, RefreshCw, LogIn } from 'lucide-react';
import { toast } from 'sonner';
import { classifyOnboardingError, routeForStage, type ClassifiedOnboardingError } from '@/lib/onboarding-error';

const steps = [
  { icon: Car, title: 'Browse available vehicles', desc: 'Find a car that matches your rideshare goals in your city.' },
  { icon: Shield, title: 'Complete identity verification', desc: 'Upload your driver license and complete Persona verification.' },
  { icon: CreditCard, title: 'Set up your payment method', desc: 'Add a card or configure a proxy billing account to start renting.' },
];

const MAX_ATTEMPTS = 3;

const DriverOnboarding = () => {
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState<ClassifiedOnboardingError | null>(null);

  useEffect(() => {
    if (!isLoading && !user) navigate('/auth', { replace: true });
  }, [user, isLoading, navigate]);

  const finish = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const { error: docErr } = await supabase.rpc('advance_registration_stage', { _target: 'documents_submitted' });
      if (docErr) throw docErr;
      const { error: verErr } = await supabase.rpc('advance_registration_stage', { _target: 'verification_pending' });
      if (verErr) throw verErr;
      toast.success('Submitted for verification', { description: 'Admin will review and unlock full access shortly.' });
      navigate('/driver/dashboard', { replace: true });
    } catch (err) {
      const classified = classifyOnboardingError(err);
      const nextAttempts = attempts + 1;
      setAttempts(nextAttempts);
      setError(classified);
      toast.error(classified.title, { description: classified.raw });
      setSubmitting(false);
    }
  };

  const refreshAndRetry = async () => {
    try {
      await supabase.auth.refreshSession();
      toast.success('Session refreshed');
    } catch {
      // fall through — finish() will surface a fresh error if needed
    }
    finish();
  };

  const routeToCorrectStep = async () => {
    // Ask the server which step this user should be on, then bounce there.
    try {
      const { data } = await supabase.rpc('get_my_registration_progress');
      const p = (data as { role?: 'driver' | 'owner'; stage?: string }) || {};
      navigate(routeForStage(p.role ?? 'driver', (p.stage as never) ?? null), { replace: true });
    } catch {
      navigate('/driver/register', { replace: true });
    }
  };

  const buttonLabel = submitting
    ? 'Completing…'
    : error
      ? attempts >= MAX_ATTEMPTS
        ? 'Try one more time'
        : `Retry (attempt ${attempts + 1} of ${MAX_ATTEMPTS})`
      : 'Go to my dashboard';

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted p-4 flex items-center justify-center">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
            <CheckCircle2 className="h-7 w-7 text-primary" />
          </div>
          <CardTitle className="text-2xl">You're approved, welcome aboard!</CardTitle>
          <CardDescription>Here's what to do next to start earning on the road.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {steps.map((s, i) => (
            <div key={i} className="flex gap-3 items-start p-3 rounded-lg border">
              <div className="p-2 rounded-md bg-primary/10">
                <s.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h4 className="font-medium">{i + 1}. {s.title}</h4>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </div>
            </div>
          ))}

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{error.title}</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>{error.description}</p>
                <p className="text-xs opacity-80">{error.actionable}</p>
                {error.raw && (
                  <code className="block text-xs bg-background/50 rounded p-2 break-all">
                    {error.code ? `[${error.code}] ` : ''}{error.raw}
                  </code>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  {error.kind === 'auth' && (
                    <Button variant="outline" size="sm" onClick={refreshAndRetry}>
                      <LogIn className="h-3.5 w-3.5 mr-1.5" /> Refresh session & retry
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={routeToCorrectStep}>
                    Go to the right step
                  </Button>
                  {attempts >= MAX_ATTEMPTS && (
                    <Button variant="outline" size="sm" onClick={() => navigate('/faq')}>
                      Contact support
                    </Button>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

          <Button className="w-full" onClick={finish} disabled={submitting} aria-busy={submitting}>
            {submitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : error ? (
              <RefreshCw className="h-4 w-4 mr-2" />
            ) : (
              <ArrowRight className="h-4 w-4 mr-2" />
            )}
            {buttonLabel}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default DriverOnboarding;
