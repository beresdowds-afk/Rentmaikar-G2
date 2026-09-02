import { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Info, RefreshCw, ShieldCheck } from "lucide-react";
import {
  describeIssue,
  usePaymentPreflight,
  type PreflightOperation,
} from "@/hooks/usePaymentPreflight";

interface Props {
  operation: PreflightOperation;
  amount?: number | null;
  currency?: string;
  context?: Record<string, unknown>;
  enabled?: boolean;
  /** Rendered only when every blocking check passes. */
  children: ReactNode;
  /** Hide the "all checks passed" confirmation strip. */
  hideSuccessNote?: boolean;
}

/**
 * Wraps a payment / payout / withdrawal action and only reveals it once the
 * server-side pre-flight checks pass. Blocking problems are shown with the
 * exact reason and the next step the user should take.
 */
export function PaymentPreflightGate({
  operation,
  amount,
  currency = "USD",
  context,
  enabled = true,
  children,
  hideSuccessNote,
}: Props) {
  const { blockers, warnings, canProceed, loading, error, run } = usePaymentPreflight({
    operation,
    amount,
    currency,
    context,
    enabled,
  });

  if (!enabled) return null;

  if (loading && !blockers.length) {
    return (
      <div className="space-y-2" aria-busy="true">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Could not run payment checks</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>{error}</p>
          <Button size="sm" variant="outline" onClick={() => void run()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Retry checks
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      {blockers.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            {blockers.length === 1 ? "One thing blocks this transaction" : `${blockers.length} things block this transaction`}
          </AlertTitle>
          <AlertDescription>
            <ul className="mt-1 space-y-2">
              {blockers.map((b) => (
                <li key={b.code}>
                  <span className="font-medium">{describeIssue(b)}</span>
                  {b.remediation && <span className="block text-sm opacity-90">{b.remediation}</span>}
                </li>
              ))}
            </ul>
            {blockers.some((b) => b.retryable) && (
              <Button size="sm" variant="outline" className="mt-3" onClick={() => void run()}>
                <RefreshCw className="mr-2 h-4 w-4" /> I've fixed this — re-check
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {warnings.length > 0 && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Before you continue</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 space-y-1 text-sm">
              {warnings.map((w) => (
                <li key={w.code}>
                  {describeIssue(w)}
                  {w.remediation ? ` ${w.remediation}` : ""}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {canProceed && (
        <>
          {!hideSuccessNote && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Account, verification and balance checks passed.
            </p>
          )}
          {children}
        </>
      )}
    </div>
  );
}
