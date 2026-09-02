import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, ShieldAlert, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  RISK_FLAG_LABELS,
  useRequestWithdrawalAuthorization,
  useWithdrawalAuthorization,
  type WithdrawalRequestType,
} from "@/hooks/useWithdrawalAuthorization";

interface WithdrawalAuthorizationGateProps {
  requestType: WithdrawalRequestType;
  amount: number;
  currency: "USD" | "NGN" | (string & {});
  subjectUserId?: string | null;
  destinationRef?: string | null;
  metadata?: Record<string, unknown>;
  /** Rendered once an authorization has been approved. */
  children: (authorizationId: string) => React.ReactNode;
  disabled?: boolean;
  requestLabel?: string;
}

/**
 * Blocks a withdrawal action until a withdrawal authorization exists and is
 * approved. Low-risk owner payouts auto-approve; anything flagged by the
 * velocity/device-risk engine — and every platform treasury movement —
 * requires a second, different admin to approve.
 */
export function WithdrawalAuthorizationGate({
  requestType,
  amount,
  currency,
  subjectUserId,
  destinationRef,
  metadata,
  children,
  disabled,
  requestLabel = "Request authorization",
}: WithdrawalAuthorizationGateProps) {
  const [authId, setAuthId] = useState<string | null>(null);
  const request = useRequestWithdrawalAuthorization();
  const { data: authorization, isLoading } = useWithdrawalAuthorization(authId);

  // A change of amount or destination invalidates the existing approval.
  useEffect(() => {
    setAuthId(null);
  }, [amount, currency, destinationRef, requestType]);

  const submit = async () => {
    try {
      const result = await request.mutateAsync({
        requestType,
        amount,
        currency,
        subjectUserId,
        destinationRef,
        metadata,
      });
      setAuthId(result.id);
      if (result.requires_dual_auth) {
        toast.info("Second-admin approval required before this withdrawal can proceed.");
      } else {
        toast.success("Withdrawal authorized.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not request authorization");
    }
  };

  if (!authId) {
    return (
      <div className="space-y-3">
        <Alert>
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Authorization required</AlertTitle>
          <AlertDescription>
            Withdrawals run velocity and device-risk checks before any money moves. High-risk
            requests and all platform treasury movements need approval from a second admin.
          </AlertDescription>
        </Alert>
        <Button
          className="w-full"
          onClick={submit}
          disabled={disabled || amount <= 0 || request.isPending}
        >
          {request.isPending ? "Running risk checks…" : requestLabel}
        </Button>
      </div>
    );
  }

  if (isLoading || !authorization) {
    return <Skeleton className="h-24 w-full" />;
  }

  const flags = authorization.risk_flags ?? [];

  if (authorization.status === "approved" || authorization.status === "consumed") {
    return (
      <div className="space-y-3">
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle className="flex items-center gap-2">
            Authorized
            <Badge variant="secondary">risk {authorization.risk_score}</Badge>
          </AlertTitle>
          <AlertDescription>
            {authorization.requires_dual_auth
              ? "Approved by a second admin."
              : "Auto-approved — no risk signals detected."}
          </AlertDescription>
        </Alert>
        {children(authorization.id)}
      </div>
    );
  }

  if (authorization.status === "pending") {
    return (
      <Alert>
        <Clock className="h-4 w-4" />
        <AlertTitle className="flex items-center gap-2">
          Awaiting second-admin approval
          <Badge variant="secondary">risk {authorization.risk_score}</Badge>
        </AlertTitle>
        <AlertDescription className="space-y-2">
          <p>
            This request is queued for dual authorization and expires{" "}
            {new Date(authorization.expires_at).toLocaleString()}.
          </p>
          {flags.length > 0 && (
            <ul className="list-disc pl-5 text-sm">
              {flags.map((flag) => (
                <li key={flag}>{RISK_FLAG_LABELS[flag] ?? flag}</li>
              ))}
            </ul>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Authorization {authorization.status}</AlertTitle>
        <AlertDescription>
          {authorization.decision_reason ?? "This withdrawal request can no longer be used."}
        </AlertDescription>
      </Alert>
      <Button variant="outline" className="w-full" onClick={() => setAuthId(null)}>
        <CheckCircle2 className="mr-2 h-4 w-4" />
        Start a new request
      </Button>
    </div>
  );
}

export default WithdrawalAuthorizationGate;
