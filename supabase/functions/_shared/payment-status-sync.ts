// deno-lint-ignore-file no-explicit-any
/**
 * Shared, safe payment status writer for the non-webhook settlement paths
 * (browser return/verify calls, PayPal capture, and the reconciliation cron).
 *
 * Two guarantees the ad-hoc `.update({status})` calls did not provide:
 *  1. A payment that already reached `completed` can never be downgraded to
 *     `pending`/`failed` by a late or stale provider read.
 *  2. When a payment transitions to `completed` outside a webhook, the
 *     receipt email is still issued (webhooks were the only path doing this,
 *     so callback-only providers silently skipped receipts).
 *
 * Settlement itself (ledger, tax, owner share, invoice, subscription
 * activation) is handled by the `trg_payments_settle` database trigger and is
 * idempotent via `payments.settled_at`.
 */
export async function syncPaymentStatus(
  supabase: any,
  args: {
    paymentId: string;
    status: "completed" | "failed" | "pending" | "processing";
    failureReason?: string | null;
    /** Send the receipt email when this call is what completed the payment. */
    sendReceipt?: boolean;
  },
): Promise<{ newlyCompleted: boolean }> {
  const { data: before } = await supabase
    .from("payments").select("status").eq("id", args.paymentId).maybeSingle();
  const wasCompleted = before?.status === "completed";

  // `.neq` keeps a completed payment immutable against stale provider reads.
  const patch: Record<string, unknown> = {
    status: args.status,
    failure_reason: args.failureReason ?? null,
    processed_at: args.status === "completed" ? new Date().toISOString() : null,
  };
  await supabase.from("payments").update(patch)
    .eq("id", args.paymentId).neq("status", "completed");

  const newlyCompleted = !wasCompleted && args.status === "completed";
  if (newlyCompleted && args.sendReceipt !== false) {
    try {
      await supabase.functions.invoke("billing-portal", {
        headers: { "x-internal-secret": Deno.env.get("CRON_SECRET") ?? "" },
        body: { action: "auto_send_receipt_for_payment", payment_id: args.paymentId },
      });
    } catch (e) {
      console.error("[payment-status-sync] receipt email failed:", args.paymentId, e);
    }
    // Verify subscription/ledger/invoice/receipt/audit consistency for this
    // settlement and repair or alert on whatever is missing.
    try {
      await supabase.functions.invoke("reconcile-settlements", {
        headers: { "x-internal-secret": Deno.env.get("CRON_SECRET") ?? "" },
        body: { payment_id: args.paymentId },
      });
    } catch (e) {
      console.error("[payment-status-sync] reconciliation failed:", args.paymentId, e);
    }
  }
  return { newlyCompleted };
}
