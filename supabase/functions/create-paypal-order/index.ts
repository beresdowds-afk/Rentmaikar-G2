import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";
import { requireAuthenticatedUser } from "../_shared/auth-guards.ts";
import { appPath } from "../_shared/app-url.ts";
import { resolvePaymentContext } from "../_shared/resolve-payment-context.ts";
import { claimIdempotencyKey, completeIdempotencyKey, duplicateResponse, resolveIdempotencyKey } from "../_shared/payment-idempotency.ts";
import { describeError, getPayPalConfig, PayPalError, payPalRequest,
  ensurePayPalConfig,
} from "../_shared/paypal-client.ts";

const Body = z.object({
  amount: z.number().positive().max(1_000_000),
  currency: z.string().length(3).default("USD"),
  rental_id: z.string().uuid().optional(),
  vehicle_id: z.string().uuid().optional(),
  owner_id: z.string().uuid().optional(),
  driver_id: z.string().uuid().optional(),
  payment_frequency: z.enum(["daily", "weekly"]).default("weekly"),
  description: z.string().max(200).optional(),
});

interface PayPalOrder {
  id: string;
  status?: string;
  links?: Array<{ rel: string; href: string }>;
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authRes = await requireAuthenticatedUser(req);
  if (authRes instanceof Response) return authRes;
  const userId = authRes.userId;

  try {
    await ensurePayPalConfig();
    const cfg = getPayPalConfig();
    if (!cfg) {
      return new Response(JSON.stringify({ error: "PayPal not configured" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawBody = await req.json();
    const parsed = Body.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = parsed.data;
    if (data.currency.toUpperCase() !== "USD") {
      return new Response(JSON.stringify({ error: "PayPal only accepts USD" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Driver identity ALWAYS from JWT — reject spoofed values. Checked BEFORE
    // touching PayPal so a rejected request never leaves an orphan order.
    if (data.driver_id && data.driver_id !== userId) {
      return new Response(JSON.stringify({ error: "driver_id does not match authenticated user" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const driverId = userId;

    // Service client used for idempotency bookkeeping and persistence.
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Rental/vehicle/owner must resolve before we create anything at PayPal.
    const ctx = await resolvePaymentContext({
      supabase: supa,
      rentalId: data.rental_id,
      vehicleId: data.vehicle_id,
      ownerId: data.owner_id,
    });
    if ("error" in ctx) {
      return new Response(JSON.stringify({ error: ctx.error }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Duplicate submissions must never create two PayPal orders.
    const idemKey = resolveIdempotencyKey(req, rawBody ?? {});
    const claim = await claimIdempotencyKey(supa, idemKey, "charge.paypal", userId, {
      amount: data.amount, currency: data.currency, rental_id: data.rental_id, vehicle_id: data.vehicle_id,
    });
    if (!claim.claimed) return duplicateResponse(claim, corsHeaders);

    let order: PayPalOrder;
    try {
      order = await payPalRequest<PayPalOrder>(cfg, "/v2/checkout/orders", {
        method: "POST",
        representation: true,
        // Same key PayPal sees => a retried create returns the original order
        // instead of opening a second one.
        requestId: `order:${idemKey}`,
        body: {
          intent: "CAPTURE",
          purchase_units: [{
            amount: {
              currency_code: data.currency.toUpperCase(),
              value: data.amount.toFixed(2),
            },
            description: data.description ?? "Rentmaikar payment",
            custom_id: data.rental_id ?? undefined,
          }],
          application_context: {
            brand_name: "Rentmaikar",
            landing_page: "NO_PREFERENCE",
            user_action: "PAY_NOW",
            return_url: appPath("payment/success"),
            cancel_url: appPath("payment/cancel"),
          },
        },
      });
    } catch (e) {
      const message = e instanceof PayPalError
        ? (describeError(e.body) ?? e.message)
        : "Could not reach PayPal. Please try again.";
      console.error("[create-paypal-order] paypal error:", e);
      await completeIdempotencyKey(supa, idemKey, "failed", { error: message });
      return new Response(JSON.stringify({ error: message }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    const paymentInsert: Record<string, unknown> = {
      driver_id: driverId,
      owner_id: ctx.ownerId,
      vehicle_id: ctx.vehicleId,
      rental_id: ctx.rentalId,
      amount: data.amount,
      currency: data.currency.toUpperCase(),
      payment_frequency: data.payment_frequency,
      payment_method: "paypal",
      transaction_id: order.id,
      status: "pending",
    };

    const { data: payment, error: paymentError } = await supa
      .from("payments")
      .insert(paymentInsert)
      .select("id")
      .single();

    if (paymentError || !payment?.id) {
      console.error("[create-paypal-order] payment insert error:", paymentError);
      await completeIdempotencyKey(supa, idemKey, "failed");
      return new Response(JSON.stringify({ error: "Failed to record payment" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const txInsert: Record<string, unknown> = {
      payment_id: payment.id,
      rental_id: ctx.rentalId,
      driver_id: driverId,
      owner_id: ctx.ownerId,
      vehicle_id: ctx.vehicleId,
      order_id: order.id,
      status: "created",
      amount: data.amount,
      currency: data.currency.toUpperCase(),
      raw_order_response: order,
    };

    const { error: txError } = await supa.from("paypal_transactions").insert(txInsert);
    if (txError) {
      console.error("[create-paypal-order] paypal transaction insert error:", txError);
    }

    const successBody = {
      order_id: order.id,
      payment_id: payment?.id ?? null,
      approve_url: order.links?.find((l) => l.rel === "approve")?.href ?? null,
    };
    await completeIdempotencyKey(supa, idemKey, "succeeded", successBody);

    return new Response(JSON.stringify(successBody), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("[create-paypal-order] error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
