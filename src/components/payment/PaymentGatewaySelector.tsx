import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { regions, type Region } from '@/lib/regions';
import { formatCurrency, calculatePaymentBreakdown } from '@/lib/payment-config';
import { MapPin, CreditCard, Loader2 } from 'lucide-react';

interface PaymentGatewaySelectorProps {
  baseAmount: number;
  onRegionSelect: (region: Region) => void;
  onPaymentInitiate: (region: Region) => Promise<void>;
  selectedRegion?: Region;
  isProcessing?: boolean;
}

export function PaymentGatewaySelector({
  baseAmount,
  onRegionSelect,
  onPaymentInitiate,
  selectedRegion,
  isProcessing = false,
}: PaymentGatewaySelectorProps) {
  const [selectedId, setSelectedId] = useState<string>(selectedRegion?.id || '');

  const handleRegionChange = (regionId: string) => {
    setSelectedId(regionId);
    const region = regions.find(r => r.id === regionId);
    if (region) {
      onRegionSelect(region);
    }
  };

  const usaRegions = regions.filter(r => r.country === 'USA');
  const nigeriaRegions = regions.filter(r => r.country === 'Nigeria');

  const currentRegion = regions.find(r => r.id === selectedId);
  const breakdown = currentRegion 
    ? calculatePaymentBreakdown(baseAmount, currentRegion.currency)
    : null;

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Select Your Region
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <RadioGroup value={selectedId} onValueChange={handleRegionChange}>
          {/* USA Regions */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">🇺🇸</span>
              <h3 className="font-semibold">United States (USD)</h3>
              <Badge variant="outline" className="ml-auto">PayPal</Badge>
            </div>
            <div className="grid grid-cols-1 gap-2 ml-7">
              {usaRegions.map(region => (
                <div
                  key={region.id}
                  className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors ${
                    selectedId === region.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <RadioGroupItem value={region.id} id={region.id} />
                  <Label htmlFor={region.id} className="flex-1 cursor-pointer">
                    <div className="font-medium">{region.name}</div>
                    {region.cities && (
                      <div className="text-xs text-muted-foreground">
                        {region.cities.slice(0, 3).join(', ')}
                        {region.cities.length > 3 && '...'}
                      </div>
                    )}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Nigeria Regions */}
          <div className="space-y-3 pt-4">
            <div className="flex items-center gap-2">
              <span className="text-xl">🇳🇬</span>
              <h3 className="font-semibold">Nigeria (NGN)</h3>
              <Badge variant="secondary" className="ml-auto">Paystack</Badge>
            </div>
            <div className="grid grid-cols-1 gap-2 ml-7">
              {nigeriaRegions.map(region => (
                <div
                  key={region.id}
                  className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors ${
                    selectedId === region.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <RadioGroupItem value={region.id} id={region.id} />
                  <Label htmlFor={region.id} className="flex-1 cursor-pointer">
                    <div className="font-medium">{region.name}</div>
                    {region.cities && (
                      <div className="text-xs text-muted-foreground">
                        {region.cities.slice(0, 3).join(', ')}
                        {region.cities.length > 3 && '...'}
                      </div>
                    )}
                  </Label>
                  {region.requiresPoliceReport && (
                    <Badge variant="outline" className="text-xs">
                      Police Report Required
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        </RadioGroup>

        {/* Payment Summary */}
        {breakdown && currentRegion && (
          <div className="mt-6 p-4 bg-muted rounded-lg space-y-3">
            <h4 className="font-semibold flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Payment Summary
            </h4>
            <div className="text-sm space-y-1">
              <div className="flex justify-between">
                <span>Base Rental</span>
                <span>{formatCurrency(breakdown.baseAmount, breakdown.currency)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Admin Fee (20%)</span>
                <span>+{formatCurrency(breakdown.adminFee, breakdown.currency)}</span>
              </div>
              <div className="flex justify-between font-bold pt-2 border-t">
                <span>Total</span>
                <span className="text-primary">
                  {formatCurrency(breakdown.driverTotal, breakdown.currency)}
                </span>
              </div>
            </div>
            <Button
              className="w-full mt-4"
              onClick={() => onPaymentInitiate(currentRegion)}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  Pay with {currentRegion.paymentGateway === 'paypal' ? 'PayPal' : 'Paystack'}
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
