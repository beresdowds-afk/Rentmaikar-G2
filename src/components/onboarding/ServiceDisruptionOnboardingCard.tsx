import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { 
  ShieldAlert, 
  Car, 
  Clock, 
  CheckCircle2, 
  FileText, 
  PhoneCall, 
  AlertTriangle,
  Radio,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useSyncedDisruptionPolicy } from '@/hooks/useSyncedDisruptionPolicy';

interface Props {
  role?: 'driver' | 'owner';
  region?: 'USA' | 'Nigeria';
  interactive?: boolean;
  onAcknowledge?: (acknowledged: boolean) => void;
  className?: string;
}

export function ServiceDisruptionOnboardingCard({
  role = 'driver',
  region,
  interactive = true,
  onAcknowledge,
  className = '',
}: Props) {
  const { policy } = useSyncedDisruptionPolicy(region);
  const [acknowledged, setAcknowledged] = useState(false);
  const [showFullText, setShowFullText] = useState(false);

  const handleCheck = (checked: boolean) => {
    setAcknowledged(checked);
    if (onAcknowledge) {
      onAcknowledge(checked);
    }
  };

  const isDriver = role === 'driver';

  return (
    <Card className={`border-amber-500/40 bg-gradient-to-br from-amber-500/5 via-background to-background ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                {isDriver ? 'Telematics & Service Disruption Policy' : 'Owner Asset Protection & Service Disruption Protocol'}
              </CardTitle>
              <CardDescription className="text-xs">
                Synchronized with master legal agreement template (v{policy.version} · {policy.region})
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300 text-[11px] gap-1">
              <Radio className="h-3 w-3 animate-pulse text-amber-500" />
              Stationary-Only Safety
            </Badge>
            <Badge variant="secondary" className="text-[11px]">
              24h Call-In Window
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground text-xs leading-relaxed">
          {isDriver 
            ? 'As a Rentmaikar driver, your rented vehicle is safeguarded by 24/7 telematics. Review the synchronized service disruption and vehicle call-in terms governing your rental agreement:'
            : 'As a vehicle owner, your asset is safeguarded by Rentmaikar telematics, proactive call-in protocols, and remote service disruption mechanisms that activate automatically upon payment default or adverse reports:'}
        </p>

        {/* 4 Pillars Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3 rounded-lg border bg-background/80 space-y-1">
            <div className="flex items-center gap-2 font-medium text-xs text-foreground">
              <Car className="h-4 w-4 text-primary" />
              <span>1. Stationary-Only Safety Mandate</span>
            </div>
            <p className="text-xs text-muted-foreground leading-normal">
              Remote starter disruption is <strong>strictly executed only when the vehicle is stationary</strong> (speed &lt; 2 mph, engine/ignition off). Disruption is never initiated while in motion on a roadway.
            </p>
          </div>

          <div className="p-3 rounded-lg border bg-background/80 space-y-1">
            <div className="flex items-center gap-2 font-medium text-xs text-foreground">
              <Clock className="h-4 w-4 text-amber-500" />
              <span>2. Payment Grace Periods</span>
            </div>
            <p className="text-xs text-muted-foreground leading-normal">
              Service disruption qualifies after <strong>36 hours</strong> for daily plans (with 3 12h alerts) or <strong>72 hours</strong> for weekly plans (with 3 24h alerts). Settle promptly to prevent starter restriction.
            </p>
          </div>

          <div className="p-3 rounded-lg border bg-background/80 space-y-1">
            <div className="flex items-center gap-2 font-medium text-xs text-foreground">
              <PhoneCall className="h-4 w-4 text-blue-500" />
              <span>3. Mandatory 24-Hour Call-In</span>
            </div>
            <p className="text-xs text-muted-foreground leading-normal">
              Rentmaikar operations may issue a formal Call-In Notice. {isDriver ? 'You must present the vehicle or check in within 24 hours' : 'Drivers are given a strict 24-hour compliance window'}, after which remote disruption and recovery initiate.
            </p>
          </div>

          <div className="p-3 rounded-lg border bg-background/80 space-y-1">
            <div className="flex items-center gap-2 font-medium text-xs text-foreground">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span>4. Referee Fraud &amp; Boundary Violations</span>
            </div>
            <p className="text-xs text-muted-foreground leading-normal">
              Adverse guarantor/referee fraud reports or unapproved boundary crossings result in immediate vehicle recall and starter lock upon parking.
            </p>
          </div>
        </div>

        {/* Collapsible raw clause text */}
        <div className="rounded-lg border bg-muted/30 p-2.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFullText(!showFullText)}
            className="w-full flex items-center justify-between text-xs font-normal text-muted-foreground h-7 px-2"
          >
            <span className="flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-primary" />
              {showFullText ? 'Hide full agreement clause text' : 'View full legal agreement clause text'}
            </span>
            {showFullText ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>

          {showFullText && (
            <div className="mt-2.5 pt-2.5 border-t text-[11px] font-mono leading-relaxed text-muted-foreground whitespace-pre-wrap max-h-48 overflow-y-auto bg-card p-2.5 rounded border">
              {policy.rawClauseText}
            </div>
          )}
        </div>

        {interactive && (
          <div className="pt-1 flex items-start space-x-2.5">
            <Checkbox
              id="service-disruption-agree"
              checked={acknowledged}
              onCheckedChange={(c) => handleCheck(Boolean(c))}
              className="mt-0.5 data-[state=checked]:bg-amber-600 data-[state=checked]:border-amber-600"
            />
            <div className="grid gap-1 leading-none">
              <Label
                htmlFor="service-disruption-agree"
                className="text-xs font-medium leading-normal cursor-pointer"
              >
                {isDriver 
                  ? 'I understand and agree to the 24-hour vehicle call-in directive and stationary service disruption terms.'
                  : 'I acknowledge the automated service disruption and 24-hour call-in protocols protecting my vehicle.'}
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Terms recorded in digital contract registry upon submission.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
