// deno-lint-ignore-file no-explicit-any
import { corsHeaders } from "../_shared/cors.ts";
import { settlePaymentFinancials } from "../_shared/wallet-ledger.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { mapOpayStatus, opayFailureReason, verifyOpayWebhook } from "../_shared/opay-client.ts";
import {
  recordWebhookEvent,
  markPaymentCompletedIdempotent,
  withRetry,
  transitionState,
  applyRefund,
} from "../_shared/webhook-idempotency.ts";
import {
  createWebhookLogger,
  deriveCorrelationId,
  correlationHeaders,
} from "../_shared/webhook-logger.ts";


async function notifyPush(paymentId: string, rentalId: string | null, status: string, amount?: number, currency?: string, reference?: string) {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret) return;
  try {
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-payment-notification`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": secret },
      body: JSON.stringify({ paymentId, rentalId, status, provider: "opay", amount, currency, reference }),
    });
  } catch { /* best-effort */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const secretKey = Deno.env.get("OPAY_SECRET_KEY");
  if (!secretKey) return new Response("not configured", { status: 503 });

  const raw = await req.text();
  if (!(await verifyOpayWebhook(raw, req.headers, secretKey))) {
    return new Response("invalid signature", { status: 401 });
  }

  let evt: any;
  try {
    evt = JSON.parse(raw);
  } catch {
    return new Response("invalid payload", { status: 400 });
  }
  // OPay nests the transaction under `payload` (cashier) or `data` (general
  // payment webhook); `outOrderNo` is the merchant reference in the latter.
  const p = evt?.payload ?? evt?.data ?? evt ?? {};
  const reference: string | undefined = p?.reference ?? p?.outOrderNo ?? evt?.reference;
  const opayStatus: string = p?.status ?? "PENDING";
  if (!reference) return new Response(JSON.stringify({ received: true }), { headers: corsHeaders });

  // Opay uses transactionId per delivery; fall back to reference+status if absent.
  const externalEventId =
    p?.transactionId ?? p?.orderNo ?? p?.payNo ?? `${reference}:${opayStatus}`;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const logger = createWebhookLogger({
    provider: "opay",
    correlationId: deriveCorrelationId(req, "opay", String(externalEventId)),
    eventType: opayStatus,
    externalEventId: String(externalEventId),
    reference,
  });
  logger.info("received", { signature_valid: true });

  const idem = await recordWebhookEvent(supabase, {
    logger,
    correlationId: logger.ctx.correlationId,
    provider: "opay",
    eventType: opayStatus,
    externalEventId: String(externalEventId),
    reference,
    signatureValid: true,
    payload: evt,
  });
  if (idem.duplicate) {
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      headers: { ...corsHeaders, ...correlationHeaders(logger), "Content-Type": "application/json" },
    });
  }

  const status = mapOpayStatus(opayStatus);
  const failure = status === "failed"
    ? opayFailureReason(opayStatus, p?.failureReason ?? p?.errorMsg ?? null)
    : null;

  await supabase.from("opay_transactions").update({
    status, failure_reason: failure, raw_payload: p,
  }).eq("reference", reference);

  const { data: tx } = await supabase.from("opay_transactions")
    .select("payment_id, amount, currency, rental_id").eq("reference", reference).maybeSingle();
  if (tx?.payment_id) {
    let alreadyCompleted = false;
    if (status === "completed") {
      await transitionState(supabase, "payment", tx.payment_id, "captured", "opay SUCCESS", {}, logger);
      await transitionState(supabase, "payment", tx.payment_id, "settled", "opay settlement", {}, logger);
      ({ alreadyCompleted } = await markPaymentCompletedIdempotent(supabase, tx.payment_id));
      // Full financial fan-out: tax, commission split, ledger, earnings,
      // subscription activation, invoice and audit trail.
      await settlePaymentFinancials(supabase, tx.payment_id, "opay", reference);
      // Verify the whole downstream chain (subscription, ledger, invoice,
      // receipt, audit row) and repair/alert on anything missing.
      try {
        await supabase.functions.invoke("reconcile-settlements", {
          headers: { "x-internal-secret": Deno.env.get("CRON_SECRET") ?? "" },
          body: { payment_id: tx.payment_id },
        });
      } catch (e) {
        console.error("[opay-webhook] settlement reconciliation failed", tx.payment_id, e);
      }
    } else if (status === "refunded") {
      // Shared handler: state transition + ledger reversal.
      await applyRefund(supabase, {
          logger,
        paymentId: tx.payment_id,
        provider: "opay",
        providerReference: reference,
        amount: tx.amount ? Number(tx.amount) : null,
        reason: p?.refundReason ?? "opay refund",
      });
    } else {
      if (status === "failed") {
        await transitionState(supabase, "payment", tx.payment_id, "failed", failure ?? "opay failure", {}, logger);
      }
      await supabase.from("payments").update({
        status, failure_reason: failure, processed_at: null,
      }).eq("id", tx.payment_id).neq("status", "completed");
    }
    await notifyPush(tx.payment_id, tx.rental_id ?? null, status, tx.amount ? Number(tx.amount) : undefined, tx.currency ?? undefined, reference);

    if (status === "completed" && !alreadyCompleted) {
      await withRetry("opay.receipt.email", async () => {
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

  logger.info("completed", { duration_ms: logger.elapsedMs() });
  return new Response(JSON.stringify({ received: true, correlation_id: logger.ctx.correlationId }), {
    headers: { ...corsHeaders, ...correlationHeaders(logger), "Content-Type": "application/json" },
  });
});
