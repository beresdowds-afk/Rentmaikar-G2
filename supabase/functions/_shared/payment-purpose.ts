export const PAYMENT_PURPOSES = [
  "rental",
  "security_deposit",
  "late_fee",
  "subscription_training",
  "subscription_insurance",
  "subscription_roadside",
  "iot_device",
  "other",
] as const;

export type PaymentPurpose =
  (typeof PAYMENT_PURPOSES)[number];

export function isPaymentPurpose(
  value: unknown
): value is PaymentPurpose {
  return (
    typeof value === "string" &&
    (PAYMENT_PURPOSES as readonly string[]).includes(value)
  );
}
purpose: z.enum([
  "rental",
  "security_deposit",
  "late_fee",
  "subscription_training",
  "subscription_insurance",
  "subscription_roadside",
  "iot_device",
  "other",
]).default("rental"),
