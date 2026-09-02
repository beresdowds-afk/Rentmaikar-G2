// deno-lint-ignore-file no-explicit-any
import { notifyWithdrawalEvent } from "../_shared/withdrawal-notify.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createHmac } from "node:crypto";
import { timingSafeEqualHex } from "../_shared/timing-safe.ts";
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

async function notifyPush(paymentId: string, rentalId: string | null, status: string, amount?: number, currency?: string, reference?: string) {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret) return;
  try {
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-payment-notification`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": secret },
      body: JSON.stringify({ paymentId, rentalId, status, provider: "paystack", amount, currency, reference }),
    });
  } catch { /* best-effort */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!secret) return new Response("not configured", { status: 503 });

  const raw = await req.text();
  const signature = req.headers.get("x-paystack-signature") ?? "";
  const expected = createHmac("sha512", secret).update(raw).digest("hex");
  const signatureValid = timingSafeEqualHex(signature, expected);
  if (!signatureValid) return new Response("invalid signature", { status: 401 });

  let evt: any = {};
  try { evt = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const reference: string | undefined = evt?.data?.reference;
  // Paystack event objects carry a stable id per delivery (data.id or evt.id).
  const externalEventId: string | undefined =
    evt?.id ? String(evt.id) : (evt?.data?.id ? String(evt.data.id) : (reference ? `${evt?.event}:${reference}` : undefined));

  // One trace key for this delivery, its retries, and every state hop it causes.
  const logger = createWebhookLogger({
    provider: "paystack",
    correlationId: deriveCorrelationId(req, "paystack", externalEventId),
    eventType: evt?.event ?? null,
    externalEventId: externalEventId ?? null,
    reference: reference ?? null,
  });
  logger.info("received", { signature_valid: true });

  // Idempotent event log — duplicate delivery returns 200 without side effects.
  const idem = await recordWebhookEvent(supabase, {
    logger,
    correlationId: logger.ctx.correlationId,
    provider: "paystack",
    eventType: evt.event,
    externalEventId,
    reference: reference ?? null,
    signatureValid: true,
    payload: evt,
  });
  if (idem.duplicate) {
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      headers: { ...corsHeaders, ...correlationHeaders(logger), "Content-Type": "application/json" },
    });
  }

  if (evt.event === "charge.success" && reference) {
    await supabase.from("paystack_transactions").update({
      status: "completed",
      channel: evt.data.channel,
      gateway_response: evt.data.gateway_response,
      failure_reason: null,
      raw_payload: evt.data,
    }).eq("reference", reference);

    const { data: tx } = await supabase.from("paystack_transactions")
      .select("payment_id, amount, currency, rental_id").eq("reference", reference).maybeSingle();
    if (tx?.payment_id) {
      // Drive the state machine to captured → settled before flipping the
      // legacy status column, so the audit trail records every hop.
      await transitionState(supabase, "payment", tx.payment_id, "captured", "paystack charge.success", {}, logger);
      await transitionState(supabase, "payment", tx.payment_id, "settled", "paystack settlement", {}, logger);
      const { alreadyCompleted } = await markPaymentCompletedIdempotent(supabase, tx.payment_id);
      await settlePaymentFinancials(supabase, tx.payment_id, "paystack", reference);
      // Verify the whole downstream chain (subscription, ledger, invoice,
      // receipt, audit row) and repair/alert on anything missing.
      try {
        await supabase.functions.invoke("reconcile-settlements", {
          headers: { "x-internal-secret": Deno.env.get("CRON_SECRET") ?? "" },
          body: { payment_id: tx.payment_id },
        });
      } catch (e) {
        console.error("[paystack-webhook] settlement reconciliation failed", tx.payment_id, e);
      }
      await notifyPush(tx.payment_id, tx.rental_id ?? null, "completed", tx.amount ? Number(tx.amount) / 100 : undefined, tx.currency ?? undefined, reference);
      if (!alreadyCompleted) {
        await withRetry("paystack.receipt.email", async () => {
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

  } else if (evt.event === "charge.failed" && reference) {
    await supabase.from("paystack_transactions").update({
      status: "failed",
      failure_reason: evt.data.gateway_response ?? "failed",
      raw_payload: evt.data,
    }).eq("reference", reference);
    const { data: tx } = await supabase.from("paystack_transactions")
      .select("payment_id, amount, currency, rental_id").eq("reference", reference).maybeSingle();
    if (tx?.payment_id) {
      await transitionState(supabase, "payment", tx.payment_id, "failed", evt.data.gateway_response ?? "failed", {}, logger);
      await supabase.from("payments").update({
        status: "failed", failure_reason: evt.data.gateway_response ?? "failed",
      }).eq("id", tx.payment_id).neq("status", "completed");
      await notifyPush(tx.payment_id, tx.rental_id ?? null, "failed", tx.amount ? Number(tx.amount) / 100 : undefined, tx.currency ?? undefined, reference);
    }
  } else if (evt.event === "refund.processed" || evt.event === "refund.failed") {
    // Paystack refunds carry the original transaction reference.
    const refundRef: string | undefined =
      evt?.data?.transaction_reference ?? evt?.data?.transaction?.reference ?? reference;
    if (refundRef && evt.event === "refund.processed") {
      const { data: tx } = await supabase.from("paystack_transactions")
        .select("payment_id, rental_id, currency").eq("reference", refundRef).maybeSingle();
      if (tx?.payment_id) {
        await applyRefund(supabase, {
          logger,
          paymentId: tx.payment_id,
          provider: "paystack",
          providerReference: refundRef,
          amount: evt?.data?.amount ? Number(evt.data.amount) / 100 : null,
          reason: evt?.data?.merchant_note ?? "refund processed",
        });
        await notifyPush(tx.payment_id, tx.rental_id ?? null, "refunded", undefined, tx.currency ?? undefined, refundRef);
      }
    }
  } else if (evt.event === "charge.dispute.create" || evt.event === "charge.dispute.remind") {
    const disputeRef: string | undefined =
      evt?.data?.transaction?.reference ?? evt?.data?.transaction_reference;
    if (disputeRef) {
      const { data: tx } = await supabase.from("paystack_transactions")
        .select("payment_id, rental_id, currency").eq("reference", disputeRef).maybeSingle();
      if (tx?.payment_id) {
        await applyDispute(supabase, {
          logger,
          paymentId: tx.payment_id,
          provider: "paystack",
          providerReference: disputeRef,
          reason: evt?.data?.category ?? "chargeback opened",
        });
        await notifyPush(tx.payment_id, tx.rental_id ?? null, "disputed", undefined, tx.currency ?? undefined, disputeRef);
      }
    }

  } else if (evt.event === "transfer.success" || evt.event === "transfer.failed") {
    const ref = evt?.data?.reference ?? evt?.data?.transfer_code;
    if (ref) {
      const success = evt.event === "transfer.success";
      const { data: payoutRow } = await supabase.from("owner_payouts")
        .update({
          status: success ? "completed" : "failed",
          processed_at: new Date().toISOString(),
          failure_reason: success ? null : evt.data.reason ?? "transfer failed",
          raw_payload: evt.data,
        }).eq("transfer_reference", ref).select("id, owner_id, amount, currency").maybeSingle();

      if (payoutRow?.id) {
        await transitionState(
          supabase, "payout", payoutRow.id,
          success ? "completed" : "failed",
          success ? "paystack transfer.success" : (evt.data.reason ?? "transfer failed"),
          {},
          logger,
        );
      }

      if (payoutRow?.owner_id) {

        const res = await postLedgerEntry(supabase, {
          userId: payoutRow.owner_id,
          accountType: "owner",
          currency: payoutRow.currency,
          direction: success ? "debit" : "credit",
          amount: Number(payoutRow.amount),
          entryType: success ? "payout" : "payout_reversal",
          idempotencyKey: `payout:${payoutRow.id}:${success ? "settled" : "reversed"}`,
          referenceTable: "owner_payouts",
          referenceId: payoutRow.id,
          provider: "paystack",
          providerReference: ref,
          description: success ? "Owner payout settled" : "Owner payout failed — funds returned",
        });
        if (!res.ok) console.error("[paystack-webhook] ledger payout error:", res.error);

        await notifyWithdrawalEvent(supabase, {
          event: success ? "completed" : "failed",
          ownerId: payoutRow.owner_id,
          amount: Number(payoutRow.amount),
          currency: payoutRow.currency,
          provider: "paystack",
          payoutId: payoutRow.id,
          reason: success ? null : (evt.data.reason ?? "transfer failed"),
        });
      }
    }
  }

  logger.info("completed", { duration_ms: logger.elapsedMs() });
  return new Response(JSON.stringify({ received: true, correlation_id: logger.ctx.correlationId }), {
    headers: { ...corsHeaders, ...correlationHeaders(logger), "Content-Type": "application/json" },
  });
});

