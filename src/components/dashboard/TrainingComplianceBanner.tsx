import { Link } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { GraduationCap, Clock, AlertTriangle } from 'lucide-react';
import { useTrainingStatus } from '@/hooks/useTrainingStatus';

/**
 * Persistent compliance-training notification. Stays visible on the driver
 * dashboard until every required module has been completed AND verified by
 * an admin reviewer.
 */
export function TrainingComplianceBanner() {
  const { data, isLoading } = useTrainingStatus();

  if (isLoading || !data || !data.authenticated) return null;
  if (data.total_modules === 0) return null;
  if (data.is_complete) return null;

  const remaining = Math.max(data.total_modules - data.verified, 0);
  const awaitingReview = data.pending_review > 0;
  const rejected = data.rejected > 0;

  const Icon = rejected ? AlertTriangle : awaitingReview ? Clock : GraduationCap;

  return (
    <Alert className="mb-6 border-amber-500/40 bg-amber-500/10">
      <Icon className="h-4 w-4 text-amber-500" />
      <AlertTitle className="text-amber-600">
        {rejected
          ? 'Compliance training needs your attention'
          : awaitingReview
          ? 'Compliance training awaiting review'
          : 'Compliance training incomplete'}
      </AlertTitle>
      <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-sm text-muted-foreground">
          {rejected
            ? `${data.rejected} module${data.rejected === 1 ? '' : 's'} were rejected and must be retaken.`
            : awaitingReview
            ? `${data.pending_review} module${data.pending_review === 1 ? '' : 's'} submitted and pending admin verification. ${remaining} of ${data.total_modules} still outstanding.`
            : `${remaining} of ${data.total_modules} required modules outstanding. Training must be completed and verified.`}
        </span>
        <Button asChild size="sm" className="shrink-0">
          <Link to="/driver/training">
            {rejected ? 'Retake training' : 'Continue training'}
          </Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export default TrainingComplianceBanner;
