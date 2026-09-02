import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CreditCard, Lock, ShieldOff } from "lucide-react";
import { useServiceEntitlements, type ServiceKey } from "@/hooks/useServiceEntitlements";

interface Props {
  service: ServiceKey;
  /** Optional prerequisite service that must also be entitled. */
  requires?: ServiceKey;
  label: string;
  children: ReactNode;
  /** Hide entirely (rather than showing a locked card) when region-disabled. */
  hideWhenRegionDisabled?: boolean;
}

const SUBSCRIBE_PATH = "/subscriptions";

export function SubscriptionGate({
  service,
  requires,
  label,
  children,
  hideWhenRegionDisabled = false,
}: Props) {
  const services: ServiceKey[] = requires ? [service, requires] : [service];
  const { entitlements, isLoading } = useServiceEntitlements(services);

  if (isLoading) {
    return (
      <Card data-testid="subscription-gate-loading">
        <CardContent className="p-6 space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-9 w-32" />
        </CardContent>
      </Card>
    );
  }

  const me = entitlements[service];
  const prereq = requires ? entitlements[requires] : undefined;

  // Admin has disabled the service in this region.
  if (me && !me.regionEnabled) {
    if (hideWhenRegionDisabled) return null;
    return (
      <Alert variant="destructive" data-testid="subscription-gate-region-off">
        <ShieldOff className="h-4 w-4" />
        <AlertTitle>{label} is unavailable in your region</AlertTitle>
        <AlertDescription>
          An administrator has turned off this service for your region. Please check back later.
        </AlertDescription>
      </Alert>
    );
  }

  // Prerequisite subscription missing (e.g. Insurance requires Training).
  if (requires && prereq && !prereq.hasActivePayment) {
    return (
      <Card className="border-dashed" data-testid="subscription-gate-prereq">
        <CardContent className="p-6 space-y-3">
          <Alert>
            <Lock className="h-4 w-4" />
            <AlertTitle>Complete a prerequisite subscription</AlertTitle>
            <AlertDescription>
              <span className="font-medium">{label}</span> requires an active{" "}
              <span className="font-medium">
                {requires === "driver_training" ? "Driver Training" : requires.replace("_", " ")}
              </span>{" "}
              subscription first.
            </AlertDescription>
          </Alert>
          <Button asChild size="sm">
            <Link to={SUBSCRIBE_PATH}>
              <CreditCard className="h-4 w-4 mr-2" />
              Subscribe now
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Missing paid subscription for this service.
  if (me && !me.hasActivePayment) {
    return (
      <Card className="border-dashed" data-testid="subscription-gate-payment">
        <CardContent className="p-6 space-y-3">
          <Alert>
            <CreditCard className="h-4 w-4" />
            <AlertTitle>Subscription & payment required</AlertTitle>
            <AlertDescription>
              <span className="font-medium">{label}</span> is a compulsory subscription. It unlocks
              only after a successful payment is confirmed.
            </AlertDescription>
          </Alert>
          <Button asChild size="sm">
            <Link to={SUBSCRIBE_PATH}>
              <CreditCard className="h-4 w-4 mr-2" />
              Subscribe & pay
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return <>{children}</>;
}

export default SubscriptionGate;
