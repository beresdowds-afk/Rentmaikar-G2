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
import { postLedgerEntry, settlePaymentFinancials } from "../_shared/wallet-ledger.ts";
import {
  getPayPalConfig,
  verifyWebhookSignature,
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
  } else if (
    eventType === "PAYMENT.PAYOUTSBATCH.PROCESSING" ||
    eventType === "PAYMENT.PAYOUTSBATCH.SUCCESS" ||
    eventType === "PAYMENT.PAYOUTSBATCH.DENIED" ||
    eventType === "PAYMENT.PAYOUTS-ITEM.SUCCEEDED" ||
    eventType === "PAYMENT.PAYOUTS-ITEM.FAILED" ||
    eventType === "PAYMENT.PAYOUTS-ITEM.BLOCKED" ||
    eventType === "PAYMENT.PAYOUTS-ITEM.CANCELED" ||
    eventType === "PAYMENT.PAYOUTS-ITEM.RETURNED" ||
    eventType === "PAYMENT.PAYOUTS-ITEM.REFUNDED" ||
    eventType === "PAYMENT.PAYOUTS-ITEM.UNCLAIMED"
  ) {
    const batchId =
      resource?.payout_batch_id ??
      resource?.payout_batch_header?.payout_batch_id ??
      resource?.batch_header?.payout_batch_id;

    const senderItemId =
      resource?.payout_item?.sender_item_id ??
      resource?.sender_item_id ??
      resource?.payout_item?.sender_item_id;

    const providerReference = senderItemId || batchId;

    if (!providerReference && !batchId) {
      logger.warn("payout.webhook.missing_reference");
    } else {
      let payoutQuery = supabase
        .from("owner_payouts")
        .select("id, owner_id, amount, currency, status, transfer_reference, transfer_code")
        .eq("provider", "paypal")
        .limit(1);

      if (senderItemId) {
        payoutQuery = payoutQuery.eq("transfer_reference", senderItemId);
      } else {
        payoutQuery = payoutQuery.eq("transfer_code", batchId);
      }

      const { data: payout } = await payoutQuery.maybeSingle();

      if (!payout) {
        logger.warn("payout.webhook.unmatched", {
          batch_id: batchId ?? null,
          sender_item_id: senderItemId ?? null,
          event_type: eventType,
        });
      } else {
        // Batch-level events carry no per-item amount; only item events and
        // batch DENIED can settle or release funds. Everything else is
        // informational (submission is not settlement).
        const outcome =
          eventType === "PAYMENT.PAYOUTS-ITEM.SUCCEEDED" ? "settled"
          : (eventType === "PAYMENT.PAYOUTSBATCH.DENIED" ||
             eventType === "PAYMENT.PAYOUTS-ITEM.FAILED" ||
             eventType === "PAYMENT.PAYOUTS-ITEM.BLOCKED" ||
             eventType === "PAYMENT.PAYOUTS-ITEM.CANCELED") ? "failed"
          : (eventType === "PAYMENT.PAYOUTS-ITEM.RETURNED" ||
             eventType === "PAYMENT.PAYOUTS-ITEM.REFUNDED") ? "reversed"
          : null;

        if (eventType === "PAYMENT.PAYOUTS-ITEM.UNCLAIMED") {
          // Funds are held by PayPal and may be returned later: not a failure.
          await supabase.rpc("mark_owner_payout_reconciliation_required", {
            _payout_id: payout.id,
            _reason: "PayPal reported the payout item as UNCLAIMED",
            _payload: evt,
          });
        } else if (outcome) {
          const itemAmount = resource?.payout_item?.amount;
          const { data: fin, error: finErr } = await supabase.rpc("finalize_owner_payout", {
            _payout_id: payout.id,
            _outcome: outcome,
            _provider: "paypal",
            _evidence: { event: eventType, batch_id: batchId ?? null, sender_item_id: senderItemId ?? null },
            _expected_amount: itemAmount?.value != null ? Number(itemAmount.value) : null,
            _expected_currency: itemAmount?.currency ?? null,
          });
          if (finErr) {
            logger.error("payout.finalize.failed", { payout_id: payout.id, error: finErr.message });
            if (idem.eventRowId) {
              await supabase.from("payment_webhook_events").delete().eq("id", idem.eventRowId);
            }
            return new Response("payout reconciliation failed", { status: 500 });
          }
          if (!fin?.ok) {
            // Mismatch / invalid transition: never settle, keep reserved.
            await supabase.rpc("mark_owner_payout_reconciliation_required", {
              _payout_id: payout.id,
              _reason: `PayPal ${eventType} could not be applied: ${fin?.error ?? "unknown"}`,
              _payload: evt,
            });
          }
        }
      }
    }
  }
  logger.info("completed", { duration_ms: logger.elapsedMs() });
  return new Response(
    JSON.stringify({ received: true, event: eventType, amount: amountValue, correlation_id: logger.ctx.correlationId }),
    { headers: { ...corsHeaders, ...correlationHeaders(logger), "Content-Type": "application/json" } },
  );
});
