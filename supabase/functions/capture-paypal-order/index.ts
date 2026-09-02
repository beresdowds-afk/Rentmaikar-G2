import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";
import { requireAuthenticatedUser } from "../_shared/auth-guards.ts";
import { syncPaymentStatus } from "../_shared/payment-status-sync.ts";
import { describeError, getPayPalConfig, PayPalError, payPalRequest,
  ensurePayPalConfig,
} from "../_shared/paypal-client.ts";

const Body = z.object({
  order_id: z.string().min(1).max(128),
});

interface CaptureResponse {
  status?: string;
  payer?: { email_address?: string; payer_id?: string };
  purchase_units?: Array<{
    payments?: { captures?: Array<{ id?: string; status?: string }> };
  }>;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authRes = await requireAuthenticatedUser(req);
  if (authRes instanceof Response) return authRes;
  const userId = authRes.userId;

  try {
    await ensurePayPalConfig();
    const cfg = getPayPalConfig();
    if (!cfg) return json({ error: "PayPal not configured" }, 503);

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);

    const { order_id } = parsed.data;
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Authorization: the caller must own the order. Without this, any signed-in
    // user could capture (and be credited for) somebody else's PayPal order.
    const { data: existingTx, error: txLookupError } = await supa
      .from("paypal_transactions")
      .select("payment_id, driver_id, status, capture_id")
      .eq("order_id", order_id)
      .maybeSingle();

    if (txLookupError) {
      console.error("[capture-paypal-order] lookup error:", txLookupError);
      return json({ error: "Could not verify the order" }, 500);
    }
    if (!existingTx) return json({ error: "Unknown order" }, 404);
    if (existingTx.driver_id && existingTx.driver_id !== userId) {
      return json({ error: "This order does not belong to you" }, 403);
    }

    const paymentId = existingTx.payment_id;

    // Already captured — return the recorded result rather than asking PayPal
    // to capture a second time (PayPal would reject with ORDER_ALREADY_CAPTURED).
    if (existingTx.status === "captured" || existingTx.status === "completed") {
      return json({
        order_id,
        capture_id: existingTx.capture_id ?? null,
        status: "COMPLETED",
        payment_id: paymentId ?? null,
        already_captured: true,
      });
    }

    let capture: CaptureResponse;
    try {
      capture = await payPalRequest<CaptureResponse>(
        cfg,
        `/v2/checkout/orders/${encodeURIComponent(order_id)}/capture`,
        {
          method: "POST",
          representation: true,
          // PayPal-side idempotency: a retried capture returns the original
          // capture instead of taking the money twice.
          requestId: `capture:${order_id}`,
          body: {},
        },
      );
    } catch (e) {
      console.error("[capture-paypal-order] paypal error:", e);
      if (e instanceof PayPalError) {
        const issue = describeError(e.body) ?? e.message;
        // 422 ORDER_ALREADY_CAPTURED is a benign duplicate, not a failure.
        if (e.status === 422 && /ALREADY_CAPTURED/i.test(JSON.stringify(e.body ?? ""))) {
          return json({ order_id, status: "COMPLETED", payment_id: paymentId ?? null, already_captured: true });
        }
        return json({ error: issue, debug_id: e.debugId }, e.status >= 500 ? 502 : 400);
      }
      return json({ error: "Could not reach PayPal. Please try again." }, 502);
    }

    const captureRecord = capture.purchase_units?.[0]?.payments?.captures?.[0];
    const captureId = captureRecord?.id ?? null;
    const captureStatus = captureRecord?.status ?? capture.status ?? "UNKNOWN";
    const payer = capture.payer;

    if (paymentId) {
      // Keep the provider reference on the row, then let the shared writer
      // handle the status transition (never downgrades a completed payment)
      // and issue the receipt when this capture is what completed it.
      await supa.from("payments")
        .update({ transaction_id: order_id }).eq("id", paymentId);
      await syncPaymentStatus(supa, {
        paymentId,
        status: captureStatus === "COMPLETED" ? "completed" : "processing",
      });
    }

    const { error: txError } = await supa
      .from("paypal_transactions")
      .update({
        capture_id: captureId,
        status: captureStatus === "COMPLETED" ? "captured" : "capture_pending",
        payer_email: payer?.email_address ?? null,
        payer_id: payer?.payer_id ?? null,
        raw_capture_response: capture,
      })
      .eq("order_id", order_id);

    if (txError) {
      console.error("[capture-paypal-order] transaction update error:", txError);
    }

    return json({
      order_id,
      capture_id: captureId,
      status: captureStatus,
      payment_id: paymentId ?? null,
    });
  } catch (e) {
    console.error("[capture-paypal-order] error:", e);
    return json({ error: "Capture failed" }, 500);
  }
});
