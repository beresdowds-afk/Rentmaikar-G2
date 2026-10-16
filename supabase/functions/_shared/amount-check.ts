/** Pure helper: does a provider-reported amount/currency match the stored obligation? */
export function amountsMatch(
  expectedAmount: unknown,
  expectedCurrency: unknown,
  actualAmount: unknown,
  actualCurrency: unknown,
): boolean {
  const e = Number(expectedAmount);
  const a = Number(actualAmount);
  if (!Number.isFinite(e) || !Number.isFinite(a)) return false;
  if (String(expectedCurrency ?? "").toUpperCase() !== String(actualCurrency ?? "").toUpperCase()) return false;
  return Math.abs(e - a) < 0.005;
}

/**
 * A refund may only flip a payment to `refunded` and reverse its ledger
 * entries when it covers the whole payment. Partial or anomalous refunds are
 * left for manual review so the ledger never over-reverses.
 * A missing refund amount is treated as a full refund (legacy behaviour).
 */
export function classifyRefund(paymentAmount: unknown, refundAmount: unknown): "full" | "partial" | "excessive" {
  if (refundAmount === null || refundAmount === undefined) return "full";
  const p = Number(paymentAmount);
  const r = Number(refundAmount);
  if (!Number.isFinite(p) || !Number.isFinite(r) || r <= 0) return "excessive";
  if (Math.abs(p - r) < 0.005) return "full";
  return r < p ? "partial" : "excessive";
}
