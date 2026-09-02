import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  type PaymentDefault,
  getHoursUntilLockdown 
} from '@/lib/payment-config';
import { PaymentDefaultHandler } from '@/lib/payment-default-handler';
import { formatCurrency } from '@/lib/payment-config';
import { 
  AlertTriangle, 
  Clock, 
  Car, 
  CreditCard,
  Bell,
  XCircle
} from 'lucide-react';

interface PaymentDefaultAlertProps {
  paymentDefault: PaymentDefault;
  onPayNow?: () => void;
  onInitiateDeactivation?: () => void;
  onContactSupport?: () => void;
  isDriverView?: boolean;
}

export function PaymentDefaultAlert({
  paymentDefault,
  onPayNow,
  onInitiateDeactivation,
  onContactSupport,
  isDriverView = false,
}: PaymentDefaultAlertProps) {
  const status = PaymentDefaultHandler.getStatusSummary(paymentDefault);
  const progress = (paymentDefault.notificationsSent / 3) * 100;
  const hoursUntilLockdown = getHoursUntilLockdown(paymentDefault);
  const isDaily = paymentDefault.paymentFrequency === 'daily';

  const severityStyles = {
    low: 'border-yellow-500/50 bg-yellow-500/10',
    medium: 'border-orange-500/50 bg-orange-500/10',
    high: 'border-red-500/50 bg-red-500/10',
    critical: 'border-red-700/50 bg-red-700/10',
  };

  const severityIcons = {
    low: <Clock className="h-5 w-5 text-yellow-500" />,
    medium: <AlertTriangle className="h-5 w-5 text-orange-500" />,
    high: <Bell className="h-5 w-5 text-red-500" />,
    critical: <XCircle className="h-5 w-5 text-red-700" />,
  };

  return (
    <Alert className={`${severityStyles[status.severity]} relative overflow-hidden`}>
      <div className="flex items-start gap-3">
        {severityIcons[status.severity]}
        <div className="flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <AlertTitle className="text-base font-semibold">
              Payment Default - {paymentDefault.hoursOverdue}h Overdue
              {isDaily && <span className="ml-2 text-xs font-normal text-muted-foreground">(Daily Plan)</span>}
            </AlertTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {isDaily ? '36h lockdown' : '72h lockdown'}
              </Badge>
              <Badge 
                variant={status.severity === 'critical' ? 'destructive' : 'secondary'}
              >
                {status.severity.toUpperCase()}
              </Badge>
            </div>
          </div>
          
          <AlertDescription className="space-y-3">
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1">
                <CreditCard className="h-4 w-4" />
                <span className="font-medium">
                  {formatCurrency(paymentDefault.amountDue, paymentDefault.currency)}
                </span>
              </div>
              <div className="flex items-center gap-1 text-muted-foreground">
                <Car className="h-4 w-4" />
                <span>Vehicle: {paymentDefault.vehicleId}</span>
              </div>
            </div>

            <p className="text-sm">{status.message}</p>

            {/* Notification Progress */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Notifications Sent ({isDaily ? '12h intervals' : '24h intervals'})</span>
                <span>{paymentDefault.notificationsSent}/3</span>
              </div>
              <Progress value={progress} className="h-2" />
              {hoursUntilLockdown > 0 && (
                <p className="text-xs text-orange-500">
                  {hoursUntilLockdown}h until vehicle lockdown eligible
                </p>
              )}
            </div>

            {/* Action Text */}
            <p className="text-xs text-muted-foreground italic">
              {status.action}
            </p>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              {isDriverView ? (
                <>
                  <Button size="sm" onClick={onPayNow}>
                    <CreditCard className="mr-2 h-4 w-4" />
                    Pay Now
                  </Button>
                  <Button size="sm" variant="outline" onClick={onContactSupport}>
                    Contact Support
                  </Button>
                </>
              ) : (
                <>
                  {paymentDefault.deactivationEligible && (
                    <Button 
                      size="sm" 
                      variant="destructive"
                      onClick={onInitiateDeactivation}
                    >
                      <Car className="mr-2 h-4 w-4" />
                      Initiate Deactivation
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={onContactSupport}>
                    Contact Driver
                  </Button>
                </>
              )}
            </div>
          </AlertDescription>
        </div>
      </div>

      {/* Deactivation Warning Strip */}
      {paymentDefault.deactivationEligible && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-red-600 animate-pulse" />
      )}
    </Alert>
  );
}
