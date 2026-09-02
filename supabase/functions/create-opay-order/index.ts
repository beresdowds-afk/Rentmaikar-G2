// deno-lint-ignore-file no-explicit-any
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { resolvePaymentContext } from "../_shared/resolve-payment-context.ts";
import { createCashierOrder, getOpayConfig, toMinorUnits,
  ensureOpayConfig,
} from "../_shared/opay-client.ts";

const BodySchema = z.object({
  amount: z.number().positive().max(50_000_000),
  rentalId: z.string().uuid().optional(),
  vehicleId: z.string().uuid().optional(),
  driverId: z.string().uuid().optional(),
  paymentFrequency: z.enum(["daily", "weekly"]).optional(),
  description: z.string().max(255).optional(),
  callbackUrl: z.string().url().optional(),
  returnUrl: z.string().url().optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    await ensureOpayConfig();
    const cfg = getOpayConfig();
    if (!cfg) return json({ error: "Opay not configured" }, 503);

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
    const b = parsed.data;

    // Driver identity ALWAYS from JWT — body value is only accepted if it matches.
    const auth = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthenticated" }, 401);
    const { data: u, error: uErr } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (uErr || !u?.user) return json({ error: "Unauthenticated" }, 401);
    const driverId = u.user.id;
    if (b.driverId && b.driverId !== driverId) {
      return json({ error: "driverId does not match authenticated user" }, 403);
    }

    const ctx = await resolvePaymentContext({
      supabase, rentalId: b.rentalId, vehicleId: b.vehicleId,
    });
    if ("error" in ctx) return json({ error: ctx.error }, 400);

    // Client-supplied Idempotency-Key collapses double clicks / retries onto a
    // single OPay order (OPay rejects a duplicate reference with code 00005).
    const idemKey = req.headers.get("Idempotency-Key");
    if (idemKey) {
      const { data: existing } = await supabase.from("opay_transactions")
        .select("reference, order_no, cashier_url, payment_id, status")
        .eq("idempotency_key", idemKey).eq("driver_id", driverId).maybeSingle();
      if (existing?.cashier_url) {
        return json({
          reference: existing.reference, order_no: existing.order_no,
          cashier_url: existing.cashier_url, payment_id: existing.payment_id, reused: true,
        });
      }
    }

    const reference = `rmk_${crypto.randomUUID().replace(/-/g, "")}`;
    const amountMinor = toMinorUnits(b.amount);

    const result = await createCashierOrder({
      country: "NG",
      reference,
      amount: { total: amountMinor, currency: "NGN" },
      returnUrl: b.returnUrl,
      callbackUrl: b.callbackUrl,
      cancelUrl: b.returnUrl,
      expireAt: 30,
      productList: [{
        productId: b.rentalId ?? "rental",
        name: b.description ?? "RentMaikar rental payment",
        description: b.description ?? "Rental payment",
        price: amountMinor, quantity: 1, currency: "NGN",
      }],
      userInfo: { userId: driverId, userEmail: u.user.email ?? undefined },
    }, cfg);

    if (!result.ok || !result.data?.cashierUrl) {
      console.error("[create-opay-order] init failed", result.code, result.message);
      return json({ error: result.message, code: result.code, retryable: result.retryable }, 502);
    }

    const { data: payment, error: paymentError } = await supabase.from("payments").insert({
      rental_id: ctx.rentalId, driver_id: driverId,
      owner_id: ctx.ownerId, vehicle_id: ctx.vehicleId,
      amount: b.amount, currency: "NGN",
      status: "pending", payment_method: "opay",
      payment_frequency: b.paymentFrequency ?? "weekly", transaction_id: reference,
    }).select("id").single();

    if (paymentError || !payment?.id) {
      console.error("[create-opay-order] payment insert failed:", paymentError);
      return json({ error: "Failed to record payment" }, 500);
    }

    await supabase.from("opay_transactions").insert({
      reference, order_no: result.data?.orderNo, cashier_url: result.data?.cashierUrl,
      currency: "NGN", amount: b.amount, status: "pending",
      rental_id: ctx.rentalId, driver_id: driverId, vehicle_id: ctx.vehicleId,
      payment_id: payment.id, raw_payload: result.data,
      idempotency_key: idemKey ?? null,
    });

    return json({
      reference, order_no: result.data?.orderNo, cashier_url: result.data?.cashierUrl,
      payment_id: payment.id,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "unknown" }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
