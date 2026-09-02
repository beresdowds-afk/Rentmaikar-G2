import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { 
  calculatePaymentBreakdown, 
  formatCurrency, 
} from '@/lib/payment-config';
import { calculateTaxSync } from '@/lib/tax-engine';
import { CreditCard, Wallet, Building2, TrendingUp, Receipt } from 'lucide-react';

interface PaymentBreakdownCardProps {
  baseAmount: number;
  currency: 'USD' | 'NGN' | (string & {});
  gateway: 'paypal' | 'paystack';
  showOwnerView?: boolean;
  showTax?: boolean;
  customerCountry?: 'USA' | 'Nigeria' | (string & {});
  stateCode?: string;
}

export function PaymentBreakdownCard({
  baseAmount,
  currency,
  gateway,
  showOwnerView = false,
  showTax = true,
  customerCountry,
  stateCode,
}: PaymentBreakdownCardProps) {
  const breakdown = calculatePaymentBreakdown(baseAmount, currency);
  
  // Determine customer country from currency if not provided
  const country = customerCountry || (currency === 'NGN' ? 'Nigeria' : 'USA');
  
  // Calculate tax (sync version for UI)
  const taxResult = showTax
    ? calculateTaxSync(breakdown.driverTotal, currency, country, stateCode)
    : null;

  const activeTaxLines = taxResult?.taxLines.filter(l => !l.isExempt && l.taxAmount > 0) || [];
  const exemptLines = taxResult?.taxLines.filter(l => l.isExempt) || [];

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Payment Breakdown
          </CardTitle>
          <Badge variant={gateway === 'paypal' ? 'default' : 'secondary'}>
            {gateway === 'paypal' ? 'PayPal' : 'Paystack'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Driver View */}
        {!showOwnerView && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Base Rental</span>
              <span className="font-medium">{formatCurrency(breakdown.baseAmount, currency)}</span>
            </div>
            <div className="flex justify-between items-center text-orange-600">
              <span className="flex items-center gap-1">
                <TrendingUp className="h-4 w-4" />
                Admin Fee (20%)
              </span>
              <span>+{formatCurrency(breakdown.adminFee, currency)}</span>
            </div>
            
            {/* Tax Lines */}
            {showTax && activeTaxLines.map((line, i) => (
              <div key={i} className="flex justify-between items-center text-blue-600">
                <span className="flex items-center gap-1">
                  <Receipt className="h-4 w-4" />
                  {line.taxType} ({line.rate}%)
                </span>
                <span>+{formatCurrency(line.taxAmount, currency)}</span>
              </div>
            ))}
            
            {/* Exempt lines shown as info */}
            {showTax && exemptLines.map((line, i) => (
              <div key={`exempt-${i}`} className="flex justify-between items-center text-muted-foreground text-xs">
                <span>{line.taxType}: {line.exemptionReason || 'Exempt'}</span>
                <span>{formatCurrency(0, currency)}</span>
              </div>
            ))}
            
            <Separator />
            <div className="flex justify-between items-center text-lg font-bold">
              <span className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                You Pay
              </span>
              <span className="text-primary">
                {formatCurrency(breakdown.driverTotal + (taxResult?.totalTax || 0), currency)}
              </span>
            </div>
          </div>
        )}

        {/* Owner View */}
        {showOwnerView && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Base Rental</span>
              <span className="font-medium">{formatCurrency(breakdown.baseAmount, currency)}</span>
            </div>
            <div className="flex justify-between items-center text-red-600">
              <span className="flex items-center gap-1">
                <Building2 className="h-4 w-4" />
                Management Fee (20%)
              </span>
              <span>-{formatCurrency(breakdown.managementFee, currency)}</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center text-lg font-bold">
              <span className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                You Receive
              </span>
              <span className="text-green-600">{formatCurrency(breakdown.ownerPayout, currency)}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-2 p-2 bg-muted rounded-md">
              💰 Payouts are processed every Friday
            </div>
          </div>
        )}

        {/* Platform Earnings (Admin View) */}
        <div className="pt-3 border-t">
          <div className="text-xs text-muted-foreground space-y-1">
            <div className="flex justify-between">
              <span>Platform Earnings</span>
              <span className="font-medium text-foreground">
                {formatCurrency(breakdown.platformEarnings, currency)} (40%)
              </span>
            </div>
            {showTax && taxResult && taxResult.totalTax > 0 && (
              <div className="flex justify-between">
                <span>Tax Collected</span>
                <span className="font-medium text-foreground">
                  {formatCurrency(taxResult.totalTax, currency)}
                </span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
