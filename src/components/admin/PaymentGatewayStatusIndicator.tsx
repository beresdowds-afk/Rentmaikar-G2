import { useState } from 'react';
import { CreditCard, CheckCircle2, AlertTriangle, XCircle, RefreshCw, ExternalLink, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { usePaymentGatewayHealth } from '@/hooks/usePaymentGatewayHealth';

interface PaymentGatewayStatusIndicatorProps {
  onOpenDetailedCard?: () => void;
  compact?: boolean;
}

export function PaymentGatewayStatusIndicator({
  onOpenDetailedCard,
  compact = false,
}: PaymentGatewayStatusIndicatorProps) {
  const { data, loading, isPinging, refetch } = usePaymentGatewayHealth();
  const [isOpen, setIsOpen] = useState(false);

  const healthyCount = data?.summary.healthyCount ?? 0;
  const totalCount = data?.summary.total ?? 3;
  const isAllHealthy = data?.summary.allHealthy ?? false;
  const isCompliant = (data?.summary.complianceStatus === 'fully_compliant' || data?.summary.complianceStatus === 'operational_compliant');

  const paypal = data?.gateways.paypal;
  const paystack = data?.gateways.paystack;
  const opay = data?.gateways.opay;

  const renderStatusDot = (status?: string) => {
    switch (status) {
      case 'healthy':
        return <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse inline-block" />;
      case 'degraded':
      case 'unconfigured':
        return <span className="h-2 w-2 rounded-full bg-amber-500 inline-block" />;
      case 'error':
      case 'down':
      default:
        return <span className="h-2 w-2 rounded-full bg-rose-500 inline-block" />;
    }
  };

  const getBadgeVariant = () => {
    if (isAllHealthy) return 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20';
    if (isCompliant) return 'border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/20';
    return 'border-destructive/40 text-destructive bg-destructive/10';
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id="btn-payment-gateways-status-indicator"
          className="group flex items-center gap-1.5 focus:outline-hidden text-left"
          title="Payment Gateways API Connectivity & Compliance Status"
        >
          <span className="text-muted-foreground font-medium text-xs hidden md:inline">Gateways:</span>
          <Badge
            variant="outline"
            className={`text-[11px] font-mono py-0.5 px-2 gap-1.5 cursor-pointer transition-all hover:shadow-xs group-hover:border-foreground/30 ${getBadgeVariant()}`}
          >
            {isAllHealthy ? (
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            ) : isCompliant ? (
              <ShieldCheck className="h-3 w-3 text-amber-500" />
            ) : (
              <AlertTriangle className="h-3 w-3 text-rose-500" />
            )}
            <span>
              {loading && !data ? 'Checking PSPs...' : `${healthyCount}/${totalCount} PSPs Active`}
            </span>
            <span className="text-[10px] opacity-75 font-sans hidden sm:inline">
              (PayPal · Paystack · OPay)
            </span>
          </Badge>
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-80 sm:w-96 p-4 shadow-xl border-border bg-popover" align="start">
        <div className="space-y-3">
          {/* Popover Header */}
          <div className="flex items-center justify-between pb-2 border-b border-border/70">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                Payment Gateways Health
              </span>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              disabled={isPinging || loading}
              onClick={() => void refetch()}
              title="Ping all 3 payment gateways"
            >
              <RefreshCw className={`h-3 w-3 ${isPinging ? 'animate-spin text-primary' : ''}`} />
            </Button>
          </div>

          {/* Gateway Status Rows */}
          <div className="space-y-2 text-xs">
            {/* PayPal */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50 border border-border/50">
              <div className="flex items-center gap-2">
                {renderStatusDot(paypal?.operationalStatus)}
                <div>
                  <div className="font-medium text-foreground flex items-center gap-1.5">
                    <span>PayPal</span>
                    <span className="text-[10px] text-muted-foreground uppercase">
                      ({paypal?.mode ?? 'sandbox'})
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    USA & Global · Driver Rentals & Hardware
                  </p>
                </div>
              </div>
              <div className="text-right">
                <Badge
                  variant={paypal?.operationalStatus === 'healthy' ? 'outline' : 'secondary'}
                  className="text-[10px] font-mono py-0"
                >
                  {paypal?.latencyMs ? `${paypal.latencyMs}ms` : paypal?.operationalStatus ?? 'probe'}
                </Badge>
              </div>
            </div>

            {/* Paystack */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50 border border-border/50">
              <div className="flex items-center gap-2">
                {renderStatusDot(paystack?.operationalStatus)}
                <div>
                  <div className="font-medium text-foreground flex items-center gap-1.5">
                    <span>Paystack</span>
                    <span className="text-[10px] text-muted-foreground uppercase">
                      ({paystack?.mode ?? 'test'})
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Nigeria Primary · Rentals & Owner Payouts
                  </p>
                </div>
              </div>
              <div className="text-right">
                <Badge
                  variant={paystack?.operationalStatus === 'healthy' ? 'outline' : 'secondary'}
                  className="text-[10px] font-mono py-0"
                >
                  {paystack?.latencyMs ? `${paystack.latencyMs}ms` : paystack?.operationalStatus ?? 'probe'}
                </Badge>
              </div>
            </div>

            {/* OPay */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50 border border-border/50">
              <div className="flex items-center gap-2">
                {renderStatusDot(opay?.operationalStatus)}
                <div>
                  <div className="font-medium text-foreground flex items-center gap-1.5">
                    <span>OPay</span>
                    <span className="text-[10px] text-muted-foreground uppercase">
                      ({opay?.mode ?? 'sandbox'})
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Nigeria Secondary · Cashier & Wallet
                  </p>
                </div>
              </div>
              <div className="text-right">
                <Badge
                  variant={opay?.operationalStatus === 'healthy' ? 'outline' : 'secondary'}
                  className="text-[10px] font-mono py-0"
                >
                  {opay?.latencyMs ? `${opay.latencyMs}ms` : opay?.operationalStatus ?? 'probe'}
                </Badge>
              </div>
            </div>
          </div>

          {/* Compliance Summary & Link */}
          <div className="pt-2 border-t border-border/60 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              {data?.summary.statusText ?? 'Checking operational compliance...'}
            </span>
            {onOpenDetailedCard && (
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs text-primary font-medium gap-1"
                onClick={() => {
                  setIsOpen(false);
                  onOpenDetailedCard();
                }}
              >
                Inspect
                <ExternalLink className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
