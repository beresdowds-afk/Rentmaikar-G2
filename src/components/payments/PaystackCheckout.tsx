import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { idempotencyHeaders } from "@/lib/idempotency";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { readEdgeError } from "@/lib/edge-invoke";
import { toast } from "sonner";

interface PaystackCheckoutProps {
  amount: number;
  currency: "NGN" | "GHS" | "ZAR" | "KES" | "XOF" | "EGP";
  rentalId?: string;
  vehicleId?: string;
  driverId?: string;
  paymentFrequency?: "daily" | "weekly";
  description?: string;
  channels?: Array<"card" | "bank" | "ussd" | "bank_transfer" | "mobile_money" | "qr">;
  onSuccess?: (r: { reference: string; paymentId?: string }) => void;
  onError?: (msg: string) => void;
}

// Load Paystack inline JS on demand.
async function loadPaystack(): Promise<any> {
  if ((window as any).PaystackPop) return (window as any).PaystackPop;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://js.paystack.co/v2/inline.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Paystack"));
    document.body.appendChild(s);
  });
  return (window as any).PaystackPop;
}

export function PaystackCheckout({
  amount, currency, rentalId, vehicleId, driverId,
  paymentFrequency, description, channels, onSuccess, onError,
}: PaystackCheckoutProps) {
  const [loading, setLoading] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");

  useEffect(() => {
    supabase.functions.invoke("get-psp-config").then(({ data }) => {
      if (data?.paystack?.configured) setPublicKey(data.paystack.publicKey);
    });
  }, []);

  const pay = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-paystack-transaction", {
        body: { amount, currency, rentalId, vehicleId, driverId, paymentFrequency, description, channels },
        headers: idempotencyHeaders("charge.paystack", { amount, currency, rentalId, vehicleId, driverId }),
      });
      if (error) throw new Error(await readEdgeError(error, "Could not start the payment"));
      if (!data?.reference) throw new Error(data?.error ?? "Could not start the payment");

      const PaystackPop = await loadPaystack();
      const popup = new PaystackPop();
      popup.resumeTransaction(data.access_code, {
        onSuccess: async (tx: any) => {
          const { data: v } = await supabase.functions.invoke("verify-paystack-transaction", {
            body: { reference: tx.reference ?? data.reference },
          });
          if (v?.status === "completed") {
            toast.success("Payment successful");
            onSuccess?.({ reference: data.reference, paymentId: v.payment_id });
          } else {
            const msg = v?.status === "failed" ? "Payment failed" : "Payment pending";
            toast.message(msg);
            onError?.(msg);
          }
        },
        onCancel: () => {
          toast.message("Payment cancelled");
          onError?.("cancelled");
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Paystack error";
      toast.error(msg);
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  }, [amount, currency, rentalId, vehicleId, driverId, paymentFrequency, description, channels, onSuccess, onError]);

  if (!publicKey) {
    return (
      <Button disabled variant="outline" className="w-full">
        Paystack not configured
      </Button>
    );
  }

  return (
    <Button onClick={pay} disabled={loading} className="w-full" data-testid="paystack-pay-button">
      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
      Pay with Paystack
    </Button>
  );
}
