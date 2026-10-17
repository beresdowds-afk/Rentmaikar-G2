// deno-lint-ignore-file no-explicit-any
/**
 * Authoritative payment amount for Edge create-* functions. Delegates to the
 * single database rule (public.resolve_payment_obligation) shared with the
 * backend gateway so every entry point enforces the same obligation. A
 * client supplied amount is only compared, never trusted. Missing/ambiguous
 * rules fail closed.
 */
const STATUS: Record<string, number> = {
  amount_mismatch: 422, currency_mismatch: 422,
  payment_already_in_progress: 409, already_paid: 409,
  rental_not_found_for_driver: 403, invoice_not_found_for_driver: 403,
};

export type ObligationResult =
  | { ok: true; amount: number; currency: string; invoiceId: string | null }
  | { ok: false; status: number; error: string };

export async function authorizeAmount(supabase: any, a: {
  driverId: string; purpose?: string | null; rentalId?: string | null;
  invoiceId?: string | null; amount?: number | null; currency?: string | null;
}): Promise<ObligationResult> {
  const { data, error } = await supabase.rpc("resolve_payment_obligation", {
    _driver_id: a.driverId,
    _purpose: (a.purpose ?? "rental").trim(),
    _rental_id: a.rentalId ?? null,
    _invoice_id: a.invoiceId ?? null,
    _client_amount: a.amount ?? null,
    _client_currency: a.currency ?? null,
  });
  if (error || !data) return { ok: false, status: 503, error: "Payment rule could not be evaluated" };
  if (!data.ok) {
    const reason = String(data.reason ?? "no_authoritative_rule");
    return { ok: false, status: STATUS[reason] ?? 422, error: `Payment not permitted: ${reason}` };
  }
  return { ok: true, amount: Number(data.amount), currency: String(data.currency), invoiceId: data.invoice_id ?? null };
}

/** Reserve the invoice for this payment; on loss the new payment is failed. */
export async function claimInvoice(supabase: any, invoiceId: string | null, paymentId: string): Promise<boolean> {
  if (!invoiceId) return true;
  const { data } = await supabase.rpc("claim_invoice_for_payment", { _invoice_id: invoiceId, _payment_id: paymentId });
  if (data === true) return true;
  await supabase.from("payments").update({ status: "failed" }).eq("id", paymentId).eq("status", "pending");
  return false;
}
