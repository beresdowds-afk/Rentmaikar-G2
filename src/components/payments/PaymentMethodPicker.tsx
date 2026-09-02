import { useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Info } from "lucide-react";
import { PaystackCheckout } from "./PaystackCheckout";
import { OpayCheckout } from "./OpayCheckout";
import { PayPalCheckout } from "./PayPalCheckout";
import { getCheckoutPSPs, resolveCountryCode, getRegionCurrency, type CheckoutPSP } from "@/lib/psp-support";

interface PaymentMethodPickerProps {
  country: string;
  amount: number;
  rentalId?: string;
  vehicleId?: string;
  driverId?: string;
  paymentFrequency?: "daily" | "weekly";
  description?: string;
  onSuccess?: () => void;
  onError?: () => void;
  /** Optional preselected PSP tab (e.g. after a Retry from the status panel). */
  preferredPSP?: "paystack" | "opay" | "paypal";
}

const psplabels: Record<string, string> = {
  paystack: "Paystack",
  opay: "Opay",
  paypal: "PayPal",
};

export function PaymentMethodPicker({
  country, amount, rentalId, vehicleId, driverId, paymentFrequency, description,
  onSuccess, onError, preferredPSP,
}: PaymentMethodPickerProps) {
  const cc = resolveCountryCode(country);
  const currency = getRegionCurrency(country);
  // Opay is Nigeria-only; never offer a tab we don't render content for.
  const psps = useMemo(
    () => getCheckoutPSPs(country).filter((p) => p !== "opay" || cc === "NG"),
    [country, cc],
  );

  // Auto-select with graceful fallback: if the caller's preferred PSP isn't
  // supported in this region (e.g. PayPal outside the US, Paystack in the US),
  // fall back to the first regionally-supported provider and surface why.
  const preferredUnavailable = !!preferredPSP && !psps.includes(preferredPSP);
  const defaultPSP: CheckoutPSP | undefined =
    preferredPSP && psps.includes(preferredPSP) ? preferredPSP : psps[0];

  // Controlled selection. Previously the Tabs were uncontrolled with a
  // `key={defaultPSP}` remount hack, so an async country/PSP resolution wiped
  // the user's pick — and an undefined `defaultValue` left every tab blank.
  const [selected, setSelected] = useState<CheckoutPSP | undefined>(defaultPSP);
  useEffect(() => {
    setSelected((current) =>
      current && psps.includes(current) ? current : defaultPSP,
    );
  }, [psps, defaultPSP]);


  if (psps.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Payment methods</CardTitle>
          <CardDescription>
            No payment provider is enabled for your region ({cc}) yet. Please
            try again shortly or contact support.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose how to pay</CardTitle>
        <CardDescription>
          Total {new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount)}
          {" — "}pick a provider available in your region.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {preferredUnavailable && (
          <Alert data-testid="psp-fallback-notice">
            <Info className="h-4 w-4" />
            <AlertTitle>Provider changed for your region</AlertTitle>
            <AlertDescription>
              {psplabels[preferredPSP!] ?? preferredPSP} isn't available in{" "}
              {cc}. We've selected{" "}
              <strong>{defaultPSP ? psplabels[defaultPSP] : "an alternative"}</strong>{" "}
              instead so you can complete your payment.
            </AlertDescription>
          </Alert>
        )}
        <Tabs
          value={selected}
          onValueChange={(v) => setSelected(v as CheckoutPSP)}
          className="w-full"
          data-testid="payment-method-picker"
        >

          <TabsList className="w-full" style={{ display: "grid", gridTemplateColumns: `repeat(${psps.length}, minmax(0,1fr))` }}>
            {psps.map((p) => (
              <TabsTrigger key={p} value={p}>{psplabels[p]}</TabsTrigger>
            ))}
          </TabsList>
          {psps.includes("paystack") && (
            <TabsContent value="paystack" className="pt-4">
              <PaystackCheckout
                amount={amount}
                currency={currency as any}
                rentalId={rentalId} vehicleId={vehicleId} driverId={driverId}
                paymentFrequency={paymentFrequency} description={description}
                onSuccess={onSuccess} onError={() => onError?.()}
              />
            </TabsContent>
          )}
          {psps.includes("opay") && cc === "NG" && (
            <TabsContent value="opay" className="pt-4">
              <OpayCheckout
                amount={amount} rentalId={rentalId} vehicleId={vehicleId} driverId={driverId}
                paymentFrequency={paymentFrequency} description={description}
                onSuccess={onSuccess} onError={() => onError?.()}
              />
            </TabsContent>
          )}
          {psps.includes("paypal") && (
            <TabsContent value="paypal" className="pt-4">
              <PayPalCheckout
                amount={Number(amount.toFixed(2))}
                rentalId={rentalId} vehicleId={vehicleId} driverId={driverId}
                paymentFrequency={paymentFrequency} description={description}
                onSuccess={onSuccess} onError={() => onError?.()}
              />
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}
