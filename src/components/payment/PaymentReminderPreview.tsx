import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Bell, 
  AlertTriangle, 
  AlertOctagon, 
  Clock, 
  MessageSquare, 
  Phone,
  Car,
  Ban,
  ChevronRight,
  Calendar,
  DollarSign
} from 'lucide-react';
import { PAYMENT_CONFIG, type PaymentFrequency, formatCurrency } from '@/lib/payment-config';

interface NotificationPreviewProps {
  driverName?: string;
  amountDue?: number;
  currency?: 'USD' | 'NGN' | (string & {});
  paymentFrequency?: PaymentFrequency;
}

interface NotificationStage {
  number: number;
  hour: number;
  severity: 'warning' | 'urgent' | 'critical';
  title: string;
  icon: React.ReactNode;
  channels: ('sms' | 'whatsapp')[];
  message: string;
}

export function PaymentReminderPreview({
  driverName = 'Driver',
  amountDue = 96,
  currency = 'USD',
  paymentFrequency = 'weekly',
}: NotificationPreviewProps) {
  const [selectedFrequency, setSelectedFrequency] = useState<PaymentFrequency>(paymentFrequency);
  const [expandedNotification, setExpandedNotification] = useState<number | null>(1);

  const config = selectedFrequency === 'daily' 
    ? PAYMENT_CONFIG.DAILY_DEFAULT 
    : PAYMENT_CONFIG.WEEKLY_DEFAULT;

  const intervalLabel = selectedFrequency === 'daily' ? '12 hours' : '24 hours';
  const formattedAmount = formatCurrency(amountDue, currency);

  const getNotificationStages = (): NotificationStage[] => {
    const hoursRemaining = (index: number) => config.LOCKDOWN_AFTER_HOURS - config.NOTIFICATION_HOURS[index];
    
    return [
      {
        number: 1,
        hour: config.NOTIFICATION_HOURS[0],
        severity: 'warning',
        title: 'Payment Reminder',
        icon: <Bell className="h-5 w-5" />,
        channels: ['sms'],
        message: `🔔 Rentmaikar Payment Reminder (1/3)

Dear ${driverName},

Your payment of ${formattedAmount} is overdue. Please make payment immediately.

⚠️ ${selectedFrequency === 'daily' ? 'DAILY' : 'WEEKLY'} plan: Vehicle lockdown in ${hoursRemaining(0)}h if not resolved.

Pay now to avoid service interruption.

Next notification in ${intervalLabel}.`,
      },
      {
        number: 2,
        hour: config.NOTIFICATION_HOURS[1],
        severity: 'urgent',
        title: 'Urgent Notice',
        icon: <AlertTriangle className="h-5 w-5" />,
        channels: ['sms', 'whatsapp'],
        message: `⚠️ URGENT: Payment Overdue (2/3)

Dear ${driverName},

Your ${formattedAmount} payment remains outstanding.

🚨 ${hoursRemaining(1)}h until vehicle lockdown!

${selectedFrequency === 'daily' ? 'Daily plans require faster resolution.' : ''}

Contact support if you need assistance.

Next notification in ${intervalLabel}.`,
      },
      {
        number: 3,
        hour: config.NOTIFICATION_HOURS[2],
        severity: 'critical',
        title: 'Final Notice',
        icon: <AlertOctagon className="h-5 w-5" />,
        channels: ['sms', 'whatsapp'],
        message: `🚨 FINAL NOTICE (3/3)

Dear ${driverName},

FINAL WARNING: ${formattedAmount} critically overdue.

❌ Vehicle lockdown authorized. Your vehicle will be disabled when parked.

${selectedFrequency === 'daily' ? '⚡ Daily payment plans are now FORBIDDEN for your account due to this default.' : ''}

Pay immediately to avoid lockdown.`,
      },
    ];
  };

  const stages = getNotificationStages();

  const getSeverityStyles = (severity: NotificationStage['severity']) => {
    switch (severity) {
      case 'warning':
        return {
          bg: 'bg-amber-50 border-amber-200',
          text: 'text-amber-700',
          badge: 'bg-amber-100 text-amber-800 border-amber-300',
          icon: 'text-amber-600',
        };
      case 'urgent':
        return {
          bg: 'bg-orange-50 border-orange-200',
          text: 'text-orange-700',
          badge: 'bg-orange-100 text-orange-800 border-orange-300',
          icon: 'text-orange-600',
        };
      case 'critical':
        return {
          bg: 'bg-red-50 border-red-200',
          text: 'text-red-700',
          badge: 'bg-red-100 text-red-800 border-red-300',
          icon: 'text-red-600',
        };
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Payment Reminder Preview
            </CardTitle>
            <CardDescription>
              See the notification sequence you'll receive if a payment is overdue
            </CardDescription>
          </div>
          <Badge variant="outline" className="gap-1">
            <Clock className="h-3 w-3" />
            {config.LOCKDOWN_AFTER_HOURS}h Total
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Payment Frequency Toggle */}
        <Tabs value={selectedFrequency} onValueChange={(v) => setSelectedFrequency(v as PaymentFrequency)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="weekly" className="gap-2">
              <Calendar className="h-4 w-4" />
              Weekly Plan
            </TabsTrigger>
            <TabsTrigger value="daily" className="gap-2">
              <DollarSign className="h-4 w-4" />
              Daily Plan
            </TabsTrigger>
          </TabsList>

          <TabsContent value="weekly" className="mt-4">
            <div className="p-3 rounded-lg bg-muted/50 text-sm">
              <p className="font-medium mb-1">Weekly Payment Plan</p>
              <p className="text-muted-foreground">
                72-hour grace period with notifications at 24h, 48h, and 72h intervals.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="daily" className="mt-4">
            <div className="p-3 rounded-lg bg-muted/50 text-sm">
              <p className="font-medium mb-1">Daily Payment Plan (+10% fee)</p>
              <p className="text-muted-foreground">
                36-hour grace period with notifications at 12h, 24h, and 36h intervals.
                <span className="text-destructive font-medium"> Daily plans are forbidden after any default.</span>
              </p>
            </div>
          </TabsContent>
        </Tabs>

        {/* Timeline */}
        <div className="relative">
          {/* Timeline connector */}
          <div className="absolute left-6 top-8 bottom-8 w-0.5 bg-gradient-to-b from-amber-300 via-orange-400 to-red-500" />

          <div className="space-y-4">
            {/* Start Point */}
            <div className="flex items-center gap-4 relative">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center z-10">
                <Clock className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">Payment Due</p>
                <p className="text-sm text-muted-foreground">Auto-debit runs at 12:01 AM daily</p>
              </div>
            </div>

            {/* Notification Stages */}
            {stages.map((stage) => {
              const styles = getSeverityStyles(stage.severity);
              const isExpanded = expandedNotification === stage.number;

              return (
                <div key={stage.number} className="relative">
                  <button
                    onClick={() => setExpandedNotification(isExpanded ? null : stage.number)}
                    className={`w-full text-left p-4 rounded-lg border-2 transition-all ${styles.bg} ${isExpanded ? 'ring-2 ring-primary/20' : ''}`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-full bg-background flex items-center justify-center z-10 border-2 ${styles.text}`}>
                        {stage.icon}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{stage.title}</span>
                            <Badge className={styles.badge}>
                              {stage.number}/3
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              +{stage.hour}h
                            </Badge>
                            <ChevronRight className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          {stage.channels.map((channel) => (
                            <span key={channel} className="flex items-center gap-1">
                              {channel === 'sms' ? (
                                <MessageSquare className="h-3 w-3" />
                              ) : (
                                <Phone className="h-3 w-3" />
                              )}
                              {channel === 'sms' ? 'SMS' : 'WhatsApp'}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Expanded Message Preview */}
                    {isExpanded && (
                      <div className="mt-4 ml-16">
                        <div className="p-4 rounded-lg bg-background border shadow-sm">
                          <div className="flex items-center gap-2 mb-2 text-sm font-medium text-muted-foreground">
                            <MessageSquare className="h-4 w-4" />
                            Message Preview
                          </div>
                          <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">
                            {stage.message}
                          </pre>
                        </div>
                      </div>
                    )}
                  </button>
                </div>
              );
            })}

            {/* Lockdown Point */}
            <div className="flex items-center gap-4 relative">
              <div className="w-12 h-12 rounded-full bg-destructive flex items-center justify-center z-10">
                <Ban className="h-5 w-5 text-destructive-foreground" />
              </div>
              <div>
                <p className="font-medium text-destructive">Vehicle Lockdown</p>
                <p className="text-sm text-muted-foreground">
                  After {config.LOCKDOWN_AFTER_HOURS}h, vehicle can be remotely disabled when parked
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Important Notes */}
        <div className="p-4 rounded-lg bg-muted/50 space-y-2">
          <h4 className="font-semibold flex items-center gap-2">
            <Car className="h-4 w-4" />
            Important Information
          </h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Vehicle lockdown only occurs when the vehicle is safely parked (speed &lt; 2 mph)</li>
            <li>• Pay immediately upon receiving any notification to avoid escalation</li>
            <li>• Contact support if you're experiencing payment difficulties</li>
            {selectedFrequency === 'daily' && (
              <li className="text-destructive font-medium">
                • Daily payment plans are permanently revoked after any payment default
              </li>
            )}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
