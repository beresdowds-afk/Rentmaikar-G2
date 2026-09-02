import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { 
  PAYMENT_CONFIG, 
  formatCurrency, 
  type PaymentMethod, 
  type PaymentFrequency 
} from '@/lib/payment-config';
import { useDailyPlanEligibility } from '@/hooks/useDailyPlanEligibility';
import { 
  CreditCard, 
  Building2, 
  Calendar, 
  CalendarDays, 
  AlertTriangle,
  Loader2,
  Info,
  Copy,
  Check,
  Ban,
  Clock
} from 'lucide-react';
import { toast } from 'sonner';

interface PaymentOptionsSelectorProps {
  baseAmount: number;
  currency: 'USD' | 'NGN' | (string & {});
  country: 'USA' | 'Nigeria' | (string & {});
  onPaymentSubmit: (options: PaymentSelection) => Promise<void>;
  isProcessing?: boolean;
}

export interface PaymentSelection {
  method: PaymentMethod;
  frequency: PaymentFrequency;
  downPaymentDays: number;
  totalAmount: number;
  dailyRate: number;
  fineAmount: number;
}

export function PaymentOptionsSelector({
  baseAmount,
  currency,
  country,
  onPaymentSubmit,
  isProcessing = false,
}: PaymentOptionsSelectorProps) {
  const [method, setMethod] = useState<PaymentMethod | ''>('');
  const [frequency, setFrequency] = useState<PaymentFrequency>('weekly');
  const [downPaymentDays, setDownPaymentDays] = useState<number>(PAYMENT_CONFIG.MINIMUM_DOWN_PAYMENT_DAYS);
  const [copied, setCopied] = useState(false);
  
  // Check if driver is eligible for daily payment plan
  const dailyEligibility = useDailyPlanEligibility();

  const availableMethods = country === 'USA' 
    ? PAYMENT_CONFIG.PAYMENT_METHODS.USA 
    : PAYMENT_CONFIG.PAYMENT_METHODS.NIGERIA;

  const bankDetails = country === 'USA' 
    ? PAYMENT_CONFIG.BANK_ACCOUNTS.USA 
    : PAYMENT_CONFIG.BANK_ACCOUNTS.NIGERIA;

  // Calculate amounts based on frequency
  const dailyRate = baseAmount / 7; // Weekly rate divided by 7
  const dailyFine = frequency === 'daily' 
    ? dailyRate * (PAYMENT_CONFIG.DAILY_PAYMENT_FINE_PERCENT / 100)
    : 0;
  const effectiveDailyRate = dailyRate + dailyFine;
  
  // Admin fee calculation
  const adminFeePercent = PAYMENT_CONFIG.ADMIN_FEE_PERCENT / 100;
  
  // Calculate totals based on frequency
  const weeklyTotal = baseAmount * (1 + adminFeePercent);
  const dailyTotal = effectiveDailyRate * 7 * (1 + adminFeePercent);
  
  // Down payment calculation (minimum 2 days)
  const downPaymentAmount = effectiveDailyRate * downPaymentDays * (1 + adminFeePercent);

  const handleCopyBankDetails = () => {
    const details = country === 'USA'
      ? `Bank: ${(bankDetails as typeof PAYMENT_CONFIG.BANK_ACCOUNTS.USA).bankName}\nAccount: ${(bankDetails as typeof PAYMENT_CONFIG.BANK_ACCOUNTS.USA).accountNumber}\nRouting: ${(bankDetails as typeof PAYMENT_CONFIG.BANK_ACCOUNTS.USA).routingNumber}`
      : `Bank: ${(bankDetails as typeof PAYMENT_CONFIG.BANK_ACCOUNTS.NIGERIA).bankName}\nAccount: ${(bankDetails as typeof PAYMENT_CONFIG.BANK_ACCOUNTS.NIGERIA).accountNumber}`;
    
    navigator.clipboard.writeText(details);
    setCopied(true);
    toast.success('Bank details copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = () => {
    if (!method) {
      toast.error('Please select a payment method');
      return;
    }

    onPaymentSubmit({
      method,
      frequency,
      downPaymentDays,
      totalAmount: frequency === 'weekly' ? weeklyTotal : dailyTotal,
      dailyRate: effectiveDailyRate,
      fineAmount: dailyFine * 7,
    });
  };

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Payment Options
        </CardTitle>
        <CardDescription>
          Select your preferred payment method and frequency
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Payment Method Selection */}
        <div className="space-y-3">
          <Label className="text-base font-semibold">Payment Method</Label>
        <RadioGroup value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
            {(availableMethods as readonly PaymentMethod[]).includes('paypal') && (
              <div
                className={`flex items-center space-x-3 p-4 rounded-lg border transition-colors ${
                  method === 'paypal'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <RadioGroupItem value="paypal" id="paypal" />
                <Label htmlFor="paypal" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    <span className="font-medium">PayPal</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Instant payment via PayPal account or card
                  </p>
                </Label>
                <Badge variant="outline">Instant</Badge>
            </div>
            )}
            
            {(availableMethods as readonly PaymentMethod[]).includes('paystack') && (
              <div
                className={`flex items-center space-x-3 p-4 rounded-lg border transition-colors ${
                  method === 'paystack'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <RadioGroupItem value="paystack" id="paystack" />
                <Label htmlFor="paystack" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    <span className="font-medium">Paystack</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Pay with card, bank, or USSD
                  </p>
                </Label>
                <Badge variant="outline">Instant</Badge>
              </div>
            )}
            
            <div
              className={`flex items-center space-x-3 p-4 rounded-lg border transition-colors ${
                method === 'bank_transfer'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <RadioGroupItem value="bank_transfer" id="bank_transfer" />
              <Label htmlFor="bank_transfer" className="flex-1 cursor-pointer">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  <span className="font-medium">Bank Transfer / Deposit</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Transfer directly to our bank account
                </p>
              </Label>
              <Badge variant="secondary">1-2 days</Badge>
            </div>
          </RadioGroup>
        </div>

        {/* Bank Transfer Details */}
        {method === 'bank_transfer' && (
          <Alert className="bg-muted/50">
            <Info className="h-4 w-4" />
            <AlertDescription>
              <div className="mt-2 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Bank Name:</span>
                  <span className="font-medium">{bankDetails.bankName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Account Name:</span>
                  <span className="font-medium">{bankDetails.accountName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Account Number:</span>
                  <span className="font-medium">{bankDetails.accountNumber}</span>
                </div>
                {country === 'USA' && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Routing Number:</span>
                    <span className="font-medium">
                      {(bankDetails as typeof PAYMENT_CONFIG.BANK_ACCOUNTS.USA).routingNumber}
                    </span>
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-2"
                  onClick={handleCopyBankDetails}
                >
                  {copied ? (
                    <><Check className="h-4 w-4 mr-2" /> Copied!</>
                  ) : (
                    <><Copy className="h-4 w-4 mr-2" /> Copy Bank Details</>
                  )}
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <Separator />

        {/* Payment Frequency Selection */}
        <div className="space-y-3">
          <Label className="text-base font-semibold">Payment Frequency</Label>
          <RadioGroup value={frequency} onValueChange={(v) => setFrequency(v as PaymentFrequency)}>
            <div
              className={`flex items-center space-x-3 p-4 rounded-lg border transition-colors ${
                frequency === 'weekly'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <RadioGroupItem value="weekly" id="weekly" />
              <Label htmlFor="weekly" className="flex-1 cursor-pointer">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span className="font-medium">Weekly Payment</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Pay once per week - no additional fees. 72-hour lockdown policy.
                </p>
              </Label>
              <Badge className="bg-green-500 hover:bg-green-600">Recommended</Badge>
            </div>
            
            <div
              className={`flex items-center space-x-3 p-4 rounded-lg border transition-colors ${
                dailyEligibility.isForbidden
                  ? 'border-destructive/50 bg-destructive/5 opacity-60'
                  : frequency === 'daily'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <RadioGroupItem 
                value="daily" 
                id="daily" 
                disabled={dailyEligibility.isForbidden}
              />
              <Label 
                htmlFor="daily" 
                className={`flex-1 ${dailyEligibility.isForbidden ? 'opacity-60' : 'cursor-pointer'}`}
              >
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4" />
                  <span className="font-medium">Daily Payment</span>
                  {dailyEligibility.isForbidden && (
                    <Ban className="h-4 w-4 text-destructive" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {dailyEligibility.isForbidden 
                    ? 'Unavailable due to previous payment default'
                    : 'Pay daily with minimum 2-day down payment. 36-hour lockdown policy.'
                  }
                </p>
              </Label>
              {dailyEligibility.isForbidden ? (
                <Badge variant="destructive">Forbidden</Badge>
              ) : (
                <Badge variant="destructive">+10% Fee</Badge>
              )}
            </div>
          </RadioGroup>
        </div>

        {/* Daily Plan Forbidden Alert */}
        {dailyEligibility.isForbidden && (
          <Alert variant="destructive" className="bg-destructive/10">
            <Ban className="h-4 w-4" />
            <AlertDescription>
              <strong>Daily Payment Plan Unavailable</strong>
              <p className="text-sm mt-1">
                {dailyEligibility.forbiddenReason || 'Due to a previous payment default, daily payment plans are no longer available for your account.'}
              </p>
              <p className="text-xs mt-2 text-muted-foreground">
                Contact support if you believe this is an error.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {/* Daily Payment Warning */}
        {frequency === 'daily' && !dailyEligibility.isForbidden && (
          <Alert variant="destructive" className="bg-destructive/10">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>10% Extra Administrative Fee Applied</strong>
              <p className="text-sm mt-1">
                Daily payments incur a {PAYMENT_CONFIG.DAILY_PAYMENT_FINE_PERCENT}% extra fee. 
                Minimum {PAYMENT_CONFIG.MINIMUM_DOWN_PAYMENT_DAYS}-day down payment required.
              </p>
              <div className="flex items-center gap-2 mt-2 text-xs text-orange-500">
                <Clock className="h-3 w-3" />
                <span>36-hour lockdown policy with 3 notifications at 12-hour intervals</span>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Down Payment Days (for daily frequency) */}
        {frequency === 'daily' && !dailyEligibility.isForbidden && (
          <div className="space-y-3">
            <Label className="text-base font-semibold">Down Payment Days</Label>
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDownPaymentDays(Math.max(PAYMENT_CONFIG.MINIMUM_DOWN_PAYMENT_DAYS, downPaymentDays - 1))}
                disabled={downPaymentDays <= PAYMENT_CONFIG.MINIMUM_DOWN_PAYMENT_DAYS}
              >
                -
              </Button>
              <span className="text-xl font-bold w-12 text-center">{downPaymentDays}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDownPaymentDays(Math.min(7, downPaymentDays + 1))}
                disabled={downPaymentDays >= 7}
              >
                +
              </Button>
              <span className="text-sm text-muted-foreground">days (min. 2)</span>
            </div>
          </div>
        )}

        <Separator />

        {/* Payment Summary */}
        <div className="p-4 bg-muted rounded-lg space-y-3">
          <h4 className="font-semibold">Payment Summary</h4>
          <div className="text-sm space-y-2">
            <div className="flex justify-between">
              <span>Base Weekly Rate</span>
              <span>{formatCurrency(baseAmount, currency)}</span>
            </div>
            <div className="flex justify-between">
              <span>Daily Rate</span>
              <span>{formatCurrency(dailyRate, currency)}/day</span>
            </div>
            {frequency === 'daily' && (
              <>
                <div className="flex justify-between text-destructive">
                  <span>Daily Fine (10%)</span>
                  <span>+{formatCurrency(dailyFine, currency)}/day</span>
                </div>
                <div className="flex justify-between">
                  <span>Effective Daily Rate</span>
                  <span>{formatCurrency(effectiveDailyRate, currency)}/day</span>
                </div>
              </>
            )}
            <div className="flex justify-between text-muted-foreground">
              <span>Admin Fee (20%)</span>
              <span>+20%</span>
            </div>
            <Separator />
            {frequency === 'daily' ? (
              <>
                <div className="flex justify-between font-semibold">
                  <span>Down Payment ({downPaymentDays} days)</span>
                  <span className="text-primary">{formatCurrency(downPaymentAmount, currency)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground text-xs">
                  <span>Weekly Total (with fine)</span>
                  <span>{formatCurrency(dailyTotal, currency)}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between font-bold text-lg">
                <span>Weekly Total</span>
                <span className="text-primary">{formatCurrency(weeklyTotal, currency)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Submit Button */}
        <Button
          className="w-full"
          size="lg"
          onClick={handleSubmit}
          disabled={!method || isProcessing}
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : method === 'bank_transfer' ? (
            'Confirm & Get Bank Details'
          ) : (
            `Pay ${formatCurrency(frequency === 'daily' ? downPaymentAmount : weeklyTotal, currency)}`
          )}
        </Button>
      </CardContent>
    </Card>
  );
}