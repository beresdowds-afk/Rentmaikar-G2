// PayPal webhook — verifies via PayPal /v1/notifications/verify-webhook-signature,
// updates payments/paypal_transactions, marks linked invoice paid (via DB trigger),
// and asynchronously fires the receipt email via billing-portal.
// Hardened for duplicate-delivery idempotency via payment_webhook_events unique index.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  recordWebhookEvent,
  markPaymentCompletedIdempotent,
  withRetry,
  transitionState,
  applyRefund,
  applyDispute,
} from "../_shared/webhook-idempotency.ts";
import {
  createWebhookLogger,
  deriveCorrelationId,
  correlationHeaders,
} from "../_shared/webhook-logger.ts";
import { settlePaymentFinancials } from "../_shared/wallet-ledger.ts";
import { getPayPalConfig, verifyWebhookSignature,
  ensurePayPalConfig,
} from "../_shared/paypal-client.ts";

function paypalWebhookId(): string {
  return (Deno.env.get("PAYPAL_WEBHOOK_ID") ?? "").trim();
}

/**
 * Verify with PayPal. The environment resolution is shared with every other
 * PayPal function, so the verifier can no longer end up pointed at sandbox
 * while checkout runs against live (which silently failed every signature).
 *
 * Returns an explicit reason so a missing `PAYPAL_WEBHOOK_ID` (configuration
 * gap) is never mistaken for a forged payload (security event).
 */
async function verifySignature(
  headers: Headers,
  rawBody: string,
): Promise<{ valid: boolean; reason?: "missing_webhook_id" | "missing_credentials" | "rejected" }> {
  await ensurePayPalConfig();
  const cfg = getPayPalConfig();
  if (!cfg) return { valid: false, reason: "missing_credentials" };
  const whId = paypalWebhookId();
  if (!whId) return { valid: false, reason: "missing_webhook_id" };
  const valid = await verifyWebhookSignature(cfg, whId, headers, rawBody);
  return { valid, reason: valid ? undefined : "rejected" };
}



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const raw = await req.text();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // deno-lint-ignore no-explicit-any
  let evt: any = {};
  try { evt = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }

  const verification = await verifySignature(req.headers, raw);
  const signatureValid = verification.valid;
  const eventType = evt.event_type as string | undefined;
  const externalId = evt.id as string | undefined;
  const resource = evt.resource ?? {};
  const orderId: string | undefined = resource.supplementary_data?.related_ids?.order_id ?? resource.id;

  const logger = createWebhookLogger({
    provider: "paypal",
    correlationId: deriveCorrelationId(req, "paypal", externalId),
    eventType: eventType ?? null,
    externalEventId: externalId ?? null,
    reference: orderId ?? null,
  });
  logger.info("received", { signature_valid: signatureValid, verify_reason: verification.reason ?? null });

  // Idempotent event log — duplicate deliveries with the same PayPal event id
  // short-circuit with 200 so PayPal stops retrying.
  const idem = await recordWebhookEvent(supabase, {
    logger,
    correlationId: logger.ctx.correlationId,
    provider: "paypal",
    eventType: eventType ?? null,
    externalEventId: externalId ?? null,
    reference: orderId ?? null,
    signatureValid,
    payload: evt,
  });
  if (idem.duplicate) {
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      headers: { ...corsHeaders, ...correlationHeaders(logger), "Content-Type": "application/json" },
    });
  }

  if (!signatureValid) {
    logger.warn("signature.invalid", { reason: verification.reason });
    return new Response(
      JSON.stringify({ received: true, verified: false, reason: verification.reason }),
      {
        status: 202,
        headers: { ...corsHeaders, ...correlationHeaders(logger), "Content-Type": "application/json" },
      },
    );
  }

  const amountValue = Number(resource.amount?.value ?? 0) || null;

  if (eventType === "PAYMENT.CAPTURE.COMPLETED" || eventType === "CHECKOUT.ORDER.APPROVED") {
    if (orderId) {
      await supabase.from("paypal_transactions").update({
        status: "completed", raw_payload: resource,
      }).eq("order_id", orderId);
      const { data: tx } = await supabase.from("paypal_transactions")
        .select("payment_id, rental_id, amount, currency").eq("order_id", orderId).maybeSingle();
      if (tx?.payment_id) {
        await transitionState(supabase, "payment", tx.payment_id, "captured", eventType, {}, logger);
        await transitionState(supabase, "payment", tx.payment_id, "settled", "paypal capture settled", {}, logger);
        const { alreadyCompleted } = await markPaymentCompletedIdempotent(supabase, tx.payment_id);
        await settlePaymentFinancials(supabase, tx.payment_id, "paypal", orderId);
      // Verify the whole downstream chain (subscription, ledger, invoice,
      // receipt, audit row) and repair/alert on anything missing.
      try {
        await supabase.functions.invoke("reconcile-settlements", {
          headers: { "x-internal-secret": Deno.env.get("CRON_SECRET") ?? "" },
          body: { payment_id: tx.payment_id },
        });
      } catch (e) {
        console.error("[paypal-webhook] settlement reconciliation failed", tx.payment_id, e);
      }
        if (!alreadyCompleted) {
          await withRetry("paypal.receipt.email", async () => {
            const { error } = await supabase.functions.invoke("billing-portal", {
              headers: { "x-internal-secret": Deno.env.get("CRON_SECRET") ?? "" },
              body: { action: "auto_send_receipt_for_payment", payment_id: tx.payment_id },
            });
            if (error) throw error;
          });
        }
        if (idem.eventRowId) {
          await supabase.from("payment_webhook_events").update({ payment_id: tx.payment_id }).eq("id", idem.eventRowId);
        }
      }
    }
  } else if (eventType === "PAYMENT.CAPTURE.DENIED") {
    if (orderId) {
      await supabase.from("paypal_transactions").update({
        status: "failed", raw_payload: resource,
      }).eq("order_id", orderId);
      const { data: tx } = await supabase.from("paypal_transactions")
        .select("payment_id").eq("order_id", orderId).maybeSingle();
      if (tx?.payment_id) {
        await transitionState(supabase, "payment", tx.payment_id, "failed", eventType, {}, logger);
        // Never overwrite a completed payment via a later denial event.
        await supabase.from("payments").update({
          status: "failed", failure_reason: eventType,
        }).eq("id", tx.payment_id).neq("status", "completed");
      }
    }
  } else if (eventType === "PAYMENT.CAPTURE.REFUNDED" || eventType === "PAYMENT.CAPTURE.REVERSED") {
    if (orderId) {
      await supabase.from("paypal_transactions").update({
        status: "refunded", raw_payload: resource,
      }).eq("order_id", orderId);
      const { data: tx } = await supabase.from("paypal_transactions")
        .select("payment_id").eq("order_id", orderId).maybeSingle();
      if (tx?.payment_id) {
        // Shared handler: state transition + full ledger reversal.
        await applyRefund(supabase, {
          logger,
          paymentId: tx.payment_id,
          provider: "paypal",
          providerReference: orderId,
          amount: amountValue ? Number(amountValue) : null,
          reason: eventType,
        });
      }
    }
  } else if (
    eventType === "CUSTOMER.DISPUTE.CREATED" ||
    eventType === "CUSTOMER.DISPUTE.UPDATED"
  ) {
    // Dispute resources reference the disputed capture, not the order.
    const captureId: string | undefined =
      resource?.disputed_transactions?.[0]?.seller_transaction_id ??
      resource?.disputed_transactions?.[0]?.buyer_transaction_id;
    if (captureId) {
      const { data: tx } = await supabase.from("paypal_transactions")
        .select("payment_id").or(`order_id.eq.${captureId},capture_id.eq.${captureId}`).maybeSingle();
      if (tx?.payment_id) {
        await applyDispute(supabase, {
          logger,
          paymentId: tx.payment_id,
          provider: "paypal",
          providerReference: captureId,
          reason: resource?.reason ?? "dispute opened",
        });
      }
    }
  }


  logger.info("completed", { duration_ms: logger.elapsedMs() });
  return new Response(
    JSON.stringify({ received: true, event: eventType, amount: amountValue, correlation_id: logger.ctx.correlationId }),
    { headers: { ...corsHeaders, ...correlationHeaders(logger), "Content-Type": "application/json" } },
  );
});
