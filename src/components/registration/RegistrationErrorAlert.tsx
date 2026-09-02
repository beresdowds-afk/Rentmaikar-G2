import { AlertTriangle, RotateCw, LogIn, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { FriendlyRegistrationError } from '@/lib/registration-errors';
import { logRegistrationEvent } from '@/lib/registration-audit';

interface Props {
  error: FriendlyRegistrationError;
  onRetry: () => void;
  isRetrying?: boolean;
  /** Where to send an already-registered user after signing in. */
  signInReturnTo?: string;
}

export function RegistrationErrorAlert({ error, onRetry, isRetrying, signInReturnTo }: Props) {
  const signInHref = signInReturnTo
    ? `/auth?returnTo=${encodeURIComponent(signInReturnTo)}`
    : '/auth';

  return (
    <Alert variant="destructive" className="border-destructive/50">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{error.title}</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>{error.description}</p>

        {error.fields.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium opacity-90">Needs attention:</span>
            {error.fields.map((field) => (
              <Badge key={field} variant="outline" className="border-current text-[11px]">
                {field}
              </Badge>
            ))}
          </div>
        )}

        {error.fixSteps.length > 0 && (
          <ul className="space-y-1.5">
            {error.fixSteps.map((step) => (
              <li key={step} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-80" />
                <span>{step}</span>
              </li>
            ))}
          </ul>
        )}

        <details className="text-[11px] opacity-80">
          <summary className="cursor-pointer select-none">Technical details (for support)</summary>
          <p className="mt-1 break-all font-mono">{error.raw}</p>
        </details>

        <div className="flex flex-wrap gap-2">
          {error.isDuplicate ? (
            <Button type="button" size="sm" variant="outline" asChild className="gap-2">
              <Link
                to={signInHref}
                onClick={() =>
                  void logRegistrationEvent('signin_redirect_existing_email', {
                    metadata: { origin: 'registration_error_alert', reason: error.title },
                  })
                }
              >
                <LogIn className="h-3.5 w-3.5" />
                Sign in instead
              </Link>
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onRetry}
              disabled={isRetrying}
              className="gap-2"
            >
              <RotateCw className={`h-3.5 w-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
              {isRetrying ? 'Retrying…' : error.isFixableByUser ? 'Submit again' : 'Retry submission'}
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}
