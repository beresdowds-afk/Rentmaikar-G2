import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { idempotencyHeaders } from "@/lib/idempotency";

interface OpayCheckoutProps {
  amount: number;
  rentalId?: string;
  vehicleId?: string;
  driverId?: string;
  paymentFrequency?: "daily" | "weekly";
  description?: string;
  onSuccess?: (r: { reference: string; paymentId?: string }) => void;
  onError?: (msg: string) => void;
}

export function OpayCheckout({
  amount, rentalId, vehicleId, driverId, paymentFrequency, description, onSuccess, onError,
}: OpayCheckoutProps) {
  const [loading, setLoading] = useState(false);
  const [configured, setConfigured] = useState(false);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    supabase.functions.invoke("get-psp-config").then(({ data }) => {
      setConfigured(Boolean(data?.opay?.configured));
    });
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  const pay = useCallback(async () => {
    setLoading(true);
    try {
      const returnUrl = `${window.location.origin}${window.location.pathname}`;
      const { data, error } = await supabase.functions.invoke("create-opay-order", {
        body: {
          amount, rentalId, vehicleId, driverId, paymentFrequency, description,
          returnUrl,
        },
        // Collapses double-clicks and network retries onto one Opay order.
        headers: idempotencyHeaders("opay_order", {
          amount, rentalId, vehicleId, driverId, paymentFrequency,
        }),
      });
      if (error || !data?.cashier_url) throw new Error(error?.message ?? data?.error ?? "Opay init failed");

      const win = window.open(data.cashier_url, "_blank", "noopener,noreferrer");
      if (!win) toast.message("Popup blocked - complete payment in the new tab");

      // Poll verification every 4s for up to 5 min
      let attempts = 0;
      pollRef.current = window.setInterval(async () => {
        attempts += 1;
        const { data: v } = await supabase.functions.invoke("verify-opay-order", {
          body: { reference: data.reference },
        });
        if (v?.status === "completed") {
          window.clearInterval(pollRef.current!);
          toast.success("Payment successful");
          onSuccess?.({ reference: data.reference, paymentId: v.payment_id });
          setLoading(false);
        } else if (v?.status === "failed") {
          window.clearInterval(pollRef.current!);
          const reason = v?.failure_reason ?? "Payment failed";
          toast.error(reason);
          onError?.(reason);
          setLoading(false);
        } else if (attempts >= 75) {
          window.clearInterval(pollRef.current!);
          setLoading(false);
          toast.message("Still pending - we'll refresh once confirmed");
        }
      }, 4000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Opay error";
      toast.error(msg);
      onError?.(msg);
      setLoading(false);
    }
  }, [amount, rentalId, vehicleId, driverId, paymentFrequency, description, onSuccess, onError]);

  if (!configured) {
    return <Button disabled variant="outline" className="w-full">Opay not configured</Button>;
  }
  return (
    <Button onClick={pay} disabled={loading} variant="secondary" className="w-full" data-testid="opay-pay-button">
      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
      Pay with Opay
    </Button>
  );
}
