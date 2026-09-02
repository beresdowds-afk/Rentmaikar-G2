import { supabase } from "@/integrations/supabase/client";
import { idempotencyHeaders } from "@/lib/idempotency";

export interface CreatePayPalOrderInput {
  amount: number;
  currency: "USD";
  driverId?: string;
  vehicleId?: string;
  rentalId?: string;
  ownerId?: string;
  paymentFrequency?: "daily" | "weekly";
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface CreatePayPalOrderResult {
  orderId: string;
  paymentId?: string;
  approveUrl?: string;
}

export async function createPayPalOrder(input: CreatePayPalOrderInput): Promise<CreatePayPalOrderResult> {
  const { data, error } = await supabase.functions.invoke("create-paypal-order", {
    body: {
      amount: input.amount,
      currency: input.currency,
      rental_id: input.rentalId,
      vehicle_id: input.vehicleId,
      owner_id: input.ownerId,
      driver_id: input.driverId,
      payment_frequency: input.paymentFrequency ?? "weekly",
      description: input.description,
      ...input.metadata,
    },
    headers: idempotencyHeaders("charge.paypal", {
      amount: input.amount, currency: input.currency, rentalId: input.rentalId, vehicleId: input.vehicleId,
    }),
  });

  if (error || !data?.order_id) {
    throw new Error(error?.message ?? data?.error ?? "Failed to create PayPal order");
  }

  return {
    orderId: data.order_id,
    paymentId: data.payment_id,
    approveUrl: data.approve_url,
  };
}

export interface CapturePayPalOrderInput {
  orderId: string;
}

export interface CapturePayPalOrderResult {
  orderId: string;
  captureId?: string;
  status: string;
  paymentId?: string;
}

export async function capturePayPalOrder(input: CapturePayPalOrderInput): Promise<CapturePayPalOrderResult> {
  const { data, error } = await supabase.functions.invoke("capture-paypal-order", {
    body: { order_id: input.orderId },
  });

  if (error || !data?.order_id) {
    throw new Error(error?.message ?? data?.error ?? "Failed to capture PayPal order");
  }

  return {
    orderId: data.order_id,
    captureId: data.capture_id,
    status: data.status,
    paymentId: data.payment_id,
  };
}
