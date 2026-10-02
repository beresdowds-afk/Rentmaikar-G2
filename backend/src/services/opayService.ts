import crypto from "crypto";
import { getDbPool } from "./dbPool";
import { paymentService } from "./paymentService";

export type OpayStatus =
  | "SUCCESS"
  | "FAIL"
  | "CLOSE"
  | "CANCEL"
  | "PENDING"
  | "INITIAL";

export type OpayPaymentStatus =
  | "completed"
  | "failed"
  | "pending"
  | "refunded";

interface OpayConfig {
  merchantId: string;
  publicKey: string;
  secretKey: string;
  environment: "sandbox" | "live";
  baseUrl: string;
}

const TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;

const RETRYABLE_CODES = new Set([
  "10000",
  "11004",
  "11005",
]);

function getOpayConfig(): OpayConfig {
  const merchantId = (process.env.OPAY_MERCHANT_ID || "").trim();
  const publicKey = (process.env.OPAY_PUBLIC_KEY || "").trim();
  const secretKey = (process.env.OPAY_SECRET_KEY || "").trim();

  if (!merchantId || !publicKey || !secretKey) {
    throw new Error(
      "OPay credentials are not configured: OPAY_MERCHANT_ID, OPAY_PUBLIC_KEY, OPAY_SECRET_KEY"
    );
  }

  const rawEnvironment = (
    process.env.OPAY_ENVIRONMENT ||
    process.env.OPAY_ENV ||
    "sandbox"
  )
    .trim()
    .toLowerCase();

  const environment =
    rawEnvironment === "live" ||
    rawEnvironment === "production" ||
    rawEnvironment === "prod"
      ? "live"
      : "sandbox";

  return {
    merchantId,
    publicKey,
    secretKey,
    environment,
    baseUrl:
      environment === "live"
        ? "https://liveapi.opaycheckout.com"
        : "https://sandboxapi.opaycheckout.com",
  };
}
