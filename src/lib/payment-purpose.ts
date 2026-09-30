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

export type PaymentPurpose = (typeof PAYMENT_PURPOSES)[number];

export function isPaymentPurpose(
  value: unknown
): value is PaymentPurpose {
  return (
    typeof value === "string" &&
    (PAYMENT_PURPOSES as readonly string[]).includes(value)
  );
}

export function assertPaymentPurpose(
  value: unknown
): PaymentPurpose {
  if (!isPaymentPurpose(value)) {
    throw new Error(
      `Unsupported payment purpose: ${String(value)}`
    );
  }

  return value;
}
