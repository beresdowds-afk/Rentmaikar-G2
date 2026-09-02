import { AlertTriangle, RefreshCw, RotateCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useOnboardingProgressReconciliation } from '@/hooks/useOnboardingProgressReconciliation';
import { toast } from '@/hooks/use-toast';
import { trackOnboardingEvent } from '@/lib/onboarding-analytics';

/** Fallback UI shown when the server-side onboarding stage disagrees with
 *  what the deep link expected (e.g. app was resumed after admin approval,
 *  or after documents were rejected on another device). */
export function OnboardingReconciliationBanner() {
  const { status, expected, actual, acknowledge, refetch } =
    useOnboardingProgressReconciliation();
  const [resyncing, setResyncing] = useState(false);

  if (status !== 'mismatch') return null;

  const resync = async () => {
    setResyncing(true);
    trackOnboardingEvent('progress_manual_resync', {
      extra: { expected, actual, source: 'reconciliation_banner' },
    });
    try {
      await Promise.resolve(refetch());
      toast({
        title: 'Onboarding progress synced',
        description: 'We refreshed your latest stage from the server.',
      });
    } finally {
      setResyncing(false);
    }
  };

  return (
    <Alert variant="destructive" data-testid="onboarding-reconciliation-banner">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Your onboarding progress was updated</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>
          We noticed your account has moved to a different stage since you
          last opened this link. To make sure you see the right options, we
          refreshed your progress.
        </p>
        <p className="text-xs">
          Expected: <span className="font-mono">{expected ?? 'unknown'}</span>
          {' · '}
          Current: <span className="font-mono">{actual ?? 'unknown'}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={resync}
            disabled={resyncing}
            data-testid="reconciliation-resync"
          >
            <RotateCw
              className={`h-3 w-3 mr-1 ${resyncing ? 'animate-spin' : ''}`}
            />
            {resyncing ? 'Syncing…' : 'Resync onboarding'}
          </Button>
          <Button size="sm" variant="outline" onClick={refetch}>
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
          </Button>
          <Button size="sm" onClick={acknowledge} data-testid="reconciliation-dismiss">
            Continue
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

export default OnboardingReconciliationBanner;
