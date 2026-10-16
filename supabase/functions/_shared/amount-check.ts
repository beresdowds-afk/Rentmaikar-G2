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
