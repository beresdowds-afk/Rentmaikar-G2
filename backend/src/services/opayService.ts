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
async function opaySignature(
  body: string,
  secretKey: string,
): Promise<string> {
  return crypto
    .createHmac("sha512", secretKey)
    .update(body)
    .digest("hex");
}
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
async function opayRequest<T = Record<string, unknown>>(
  path: string,
  payload: Record<string, unknown>,
  cfg: OpayConfig,
): Promise<{
  ok: boolean;
  code: string;
  message: string;
  data: T | null;
  httpStatus: number;
  retryable: boolean;
  raw: unknown;
}> {
  const body = JSON.stringify(payload);
  const signature = await opaySignature(body, cfg.secretKey);

  const url = `${cfg.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  let last = {
    ok: false,
    code: "network_error",
    message: "OPay unreachable",
    data: null as T | null,
    httpStatus: 0,
    retryable: true,
    raw: null as unknown,
  };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      TIMEOUT_MS,
    );

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${
            path.includes("/cashier/create")
              ? cfg.publicKey
              : signature
          }`,
          MerchantId: cfg.merchantId,
        },
        body,
        signal: controller.signal,
      });

      const responseText = await response.text();

      let parsed: Record<string, unknown> = {};

      try {
        parsed = responseText
          ? JSON.parse(responseText)
          : {};
      } catch {
        parsed = {};
      }

      const code = String(
        parsed.code ??
          (response.ok ? "00000" : `http_${response.status}`),
      );

      const retryable =
        RETRYABLE_CODES.has(code) ||
        response.status >= 500 ||
        response.status === 429;

      last = {
        ok: response.ok && code === "00000",
        code,
        message:
          String(parsed.message || "") ||
          `OPay request returned ${code}`,
        data: (parsed.data ?? null) as T | null,
        httpStatus: response.status,
        retryable,
        raw: parsed,
      };

      if (last.ok || !retryable) {
        return last;
      }
    } catch (error) {
      last = {
        ok: false,
        code:
          error instanceof Error &&
          error.name === "AbortError"
            ? "timeout"
            : "network_error",
        message:
          error instanceof Error
            ? error.message
            : "OPay unreachable",
        data: null,
        httpStatus: 0,
        retryable: true,
        raw: String(error),
      };
    } finally {
      clearTimeout(timer);
    }

    if (attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          300 * 2 ** (attempt - 1) +
            Math.random() * 200,
        ),
      );
    }
  }

  return last;
  }
  async function createCashierOrder(
  payload: Record<string, unknown>,
) {
  const cfg = getOpayConfig();

  return opayRequest<{
    reference?: string;
    orderNo?: string;
    cashierUrl?: string;
    status?: string;
    [key: string]: unknown;
  }>(
    "/api/v1/international/cashier/create",
    payload,
    cfg,
  );
  }
  async function queryCashierStatus(
  reference: string,
) {
  const cfg = getOpayConfig();

  return opayRequest<{
    reference?: string;
    orderNo?: string;
    status?: string;
    amount?: {
      total?: number;
      currency?: string;
    };
    [key: string]: unknown;
  }>(
    "/api/v1/international/cashier/status",
    {
      reference,
      country: "NG",
    },
    cfg,
  );
  }
  function mapOpayStatus(
  raw: string | null | undefined,
): OpayPaymentStatus {
  const status = String(raw || "")
    .trim()
    .toUpperCase();

  switch (status) {
    case "SUCCESS":
    case "SUCCESSFUL":
      return "completed";

    case "FAIL":
    case "FAILED":
    case "CLOSE":
    case "CLOSED":
    case "CANCEL":
    case "CANCELLED":
    case "CANCELED":
      return "failed";

    case "REFUND":
    case "REFUNDED":
      return "refunded";

    default:
      return "pending";
  }
}

function opayFailureReason(
  rawStatus: string | null | undefined,
  detail?: string | null,
): string | null {
  if (detail) return detail;

  const status = String(rawStatus || "").toUpperCase();

  if (status === "CLOSE" || status === "CLOSED") {
    return "Payment window expired";
  }

  if (
    status === "CANCEL" ||
    status === "CANCELLED" ||
    status === "CANCELED"
  ) {
    return "Payment cancelled by the customer";
  }

  if (
    status === "FAIL" ||
    status === "FAILED"
  ) {
    return "Payment failed at OPay";
  }

  return null;
}
  const rawEnvironment = (
    process.env.OPAY_ENVIRONMENT ||
    process.env.OPAY_ENV ||
    "sandbox"
  )
    .trim()
    .toLowerCase();
export async function createOpayOrder(params: {
  amount: number;
  rentalId?: string;
  vehicleId?: string;
  ownerId?: string;
  driverId: string;
  paymentFrequency?: "daily" | "weekly";
  description?: string;
  callbackUrl?: string;
  returnUrl?: string;
  purpose?: string;
  iotDeviceId?: string;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string | null;
}) {
  if (!params.driverId) {
    throw new Error("Authenticated driver ID is required");
  }

  if (!Number.isFinite(params.amount) || params.amount <= 0) {
    throw new Error("Payment amount must be greater than 0");
  }

  const pool = getDbPool();

  if (params.idempotencyKey) {
    const existing = await pool.query(
      `SELECT
         reference,
         order_no,
         cashier_url,
         payment_id,
         status
       FROM public.opay_transactions
       WHERE idempotency_key = $1
         AND driver_id = $2
       LIMIT 1`,
      [
        params.idempotencyKey,
        params.driverId,
      ],
    );

    const row = existing.rows[0];

    if (row?.cashier_url) {
      return {
        reference: row.reference,
        order_no: row.order_no,
        cashier_url: row.cashier_url,
        payment_id: row.payment_id,
        reused: true,
      };
    }
  }

  const reference =
    `rmk_${crypto.randomUUID().replace(/-/g, "")}`;

  const amountMinor =
    Math.round(params.amount * 100);

  const result = await createCashierOrder({
    country: "NG",
    reference,
    amount: {
      total: amountMinor,
      currency: "NGN",
    },
    returnUrl: params.returnUrl,
    callbackUrl: params.callbackUrl,
    cancelUrl: params.returnUrl,
    expireAt: 30,
    productList: [
      {
        productId:
          params.rentalId ||
          params.iotDeviceId ||
          "payment",
        name:
          params.description ||
          "RentMaikar payment",
        description:
          params.description ||
          "Payment",
        price: amountMinor,
        quantity: 1,
        currency: "NGN",
      },
    ],
    userInfo: {
      userId: params.driverId,
    },
  });

  if (
    !result.ok ||
    !result.data?.cashierUrl
  ) {
    throw new Error(
      result.message ||
        `OPay order creation failed (${result.code})`,
    );
  }

  const paymentResult = await pool.query(
    `INSERT INTO public.payments (
       rental_id,
       driver_id,
       owner_id,
       vehicle_id,
       amount,
       currency,
       status,
       payment_method,
       payment_frequency,
       transaction_id,
       purpose
     )
     VALUES (
       $1, $2, $3, $4, $5,
       'NGN', 'pending', 'opay',
       $6, $7, $8
     )
     RETURNING id`,
    [
      params.rentalId || null,
      params.driverId,
      params.ownerId || params.driverId,
      params.vehicleId || null,
      params.amount,
      params.paymentFrequency || "weekly",
      reference,
      params.purpose || "rental",
    ],
  );

  const paymentId =
    paymentResult.rows[0]?.id;

  if (!paymentId) {
    throw new Error(
      "Failed to create authoritative payment record",
    );
  }

  await pool.query(
    `INSERT INTO public.opay_transactions (
       reference,
       order_no,
       cashier_url,
       currency,
       amount,
       status,
       rental_id,
       driver_id,
       vehicle_id,
       payment_id,
       raw_payload,
       idempotency_key
     )
     VALUES (
       $1, $2, $3, 'NGN', $4, 'pending',
       $5, $6, $7, $8, $9, $10
     )`,
    [
      reference,
      result.data.orderNo || null,
      result.data.cashierUrl,
      params.amount,
      params.rentalId || null,
      params.driverId,
      params.vehicleId || null,
      paymentId,
      JSON.stringify(result.data),
      params.idempotencyKey || null,
    ],
  );

  if (params.iotDeviceId) {
    await pool.query(
      `UPDATE public.iot_device_orders
       SET payment_reference = $1,
           payment_method = 'opay'
       WHERE id = $2`,
      [
        reference,
        params.iotDeviceId,
      ],
    );
  }

  return {
    reference,
    order_no: result.data.orderNo,
    cashier_url: result.data.cashierUrl,
    payment_id: paymentId,
  };
  }
  export async function verifyOpayOrder(
  reference: string,
  userId: string,
) {
  if (!reference) {
    throw new Error(
      "Missing required OPay reference",
    );
  }

  if (!userId) {
    throw new Error(
      "Authenticated user is required",
    );
  }

  const pool = getDbPool();

  const txResult = await pool.query(
    `SELECT *
     FROM public.opay_transactions
     WHERE reference = $1
     LIMIT 1`,
    [reference],
  );

  const tx = txResult.rows[0];

  if (
    tx?.driver_id &&
    tx.driver_id !== userId
  ) {
    throw new Error("Forbidden");
  }

  const result =
    await queryCashierStatus(reference);

  if (!result.ok) {
    throw new Error(
      result.message ||
        `OPay verification failed (${result.code})`,
    );
  }

  const opayStatus =
    String(result.data?.status || "PENDING");

  const status =
    mapOpayStatus(opayStatus);

  const failure =
    status === "failed"
      ? opayFailureReason(
          opayStatus,
          String(
            result.data?.failureReason || "",
          ) || null,
        )
      : null;

  const terminal =
    tx?.status === "completed" ||
    tx?.status === "refunded";

  if (!terminal) {
    await pool.query(
      `UPDATE public.opay_transactions
       SET status = $1,
           failure_reason = $2,
           raw_payload = $3,
           updated_at = now()
       WHERE reference = $4`,
      [
        status,
        failure,
        JSON.stringify(result.data),
        reference,
      ],
    );
  }

  const currentTxResult =
    await pool.query(
      `SELECT
         payment_id,
         amount,
         currency,
         driver_id,
         rental_id,
         vehicle_id,
         status
       FROM public.opay_transactions
       WHERE reference = $1
       LIMIT 1`,
      [reference],
    );

  const currentTx =
    currentTxResult.rows[0];

  if (
    currentTx?.payment_id &&
    !terminal &&
    status === "completed"
  ) {
    await pool.query(
      `UPDATE public.payments
       SET status = 'completed',
           processed_at = now(),
           updated_at = now()
       WHERE id = $1`,
      [currentTx.payment_id],
    );

    await paymentService.settlePaymentFinancials({
      paymentId: currentTx.payment_id,
      provider: "opay",
      providerReference: reference,
      driverId: currentTx.driver_id,
      rentalId: currentTx.rental_id,
      vehicleId: currentTx.vehicle_id,
      amount: Number(currentTx.amount),
      currency: currentTx.currency || "NGN",
    });
  }

  if (
    status === "completed" ||
    (terminal &&
      tx?.status === "completed")
  ) {
    await pool.query(
      `UPDATE public.iot_device_orders
       SET payment_status = 'confirmed',
           payment_confirmed_at = now()
       WHERE payment_reference = $1`,
      [reference],
    );
  }

  return {
    status: terminal
      ? tx.status
      : status,
    opay_status: opayStatus,
    failure_reason: failure,
    reference,
    payment_id:
      currentTx?.payment_id || null,
  };
        }
  export async function verifyOpayWebhook(
  rawBody: string,
  headers: Record<string, any>,
): Promise<boolean> {
  const cfg = getOpayConfig();

  const candidate =
    headers["signature"] ||
    headers["Signature"] ||
    headers["x-opay-signature"] ||
    headers["X-Opay-Signature"] ||
    String(
      headers["authorization"] || "",
    ).replace(/^Bearer\s+/i, "");

  if (!candidate) {
    return false;
  }

  const expected =
    await opaySignature(
      rawBody,
      cfg.secretKey,
    );

  const a =
    Buffer.from(
      String(candidate).trim().toLowerCase(),
      "utf8",
    );

  const b =
    Buffer.from(
      expected.toLowerCase(),
      "utf8",
    );

  if (a.length !== b.length) {
    return false;
  }

  return crypto.timingSafeEqual(a, b);
  }
  export async function handleOpayWebhook(
  headers: Record<string, any>,
  rawBody: string,
) {
  if (
    !(await verifyOpayWebhook(
      rawBody,
      headers,
    ))
  ) {
    throw new Error(
      "Invalid OPay webhook signature",
    );
  }

  const event =
    typeof rawBody === "string"
      ? JSON.parse(rawBody)
      : rawBody;

  const payload =
    event?.payload ||
    event?.data ||
    event ||
    {};

  const reference =
    payload?.reference ||
    payload?.outOrderNo ||
    event?.reference;

  const opayStatus =
    payload?.status || "PENDING";

  if (!reference) {
    return {
      received: true,
    };
  }

  const externalEventId =
    payload?.transactionId ||
    payload?.orderNo ||
    payload?.payNo ||
    `${reference}:${opayStatus}`;

  const pool = getDbPool();

  const existing =
    await pool.query(
      `SELECT id
       FROM public.payment_webhook_events
       WHERE external_event_id = $1
       LIMIT 1`,
      [String(externalEventId)],
    );

  if (existing.rows.length > 0) {
    return {
      received: true,
      duplicate: true,
    };
  }

  await pool.query(
    `INSERT INTO public.payment_webhook_events (
       provider,
       event_type,
       external_event_id,
       reference,
       status,
       signature_valid,
       payload
     )
     VALUES (
       'opay',
       $1,
       $2,
       $3,
       'received',
       true,
       $4
     )`,
    [
      opayStatus,
      String(externalEventId),
      reference,
      JSON.stringify(event),
    ],
  );

  const status =
    mapOpayStatus(opayStatus);

  const failure =
    status === "failed"
      ? opayFailureReason(
          opayStatus,
          payload?.failureReason ||
            payload?.errorMsg ||
            null,
        )
      : null;

  await pool.query(
    `UPDATE public.opay_transactions
     SET status = $1,
         failure_reason = $2,
         raw_payload = $3,
         updated_at = now()
     WHERE reference = $4`,
    [
      status,
      failure,
      JSON.stringify(payload),
      reference,
    ],
  );

  const txResult =
    await pool.query(
      `SELECT
         payment_id,
         amount,
         currency,
         rental_id,
         driver_id,
         vehicle_id
       FROM public.opay_transactions
       WHERE reference = $1
       LIMIT 1`,
      [reference],
    );

  const tx = txResult.rows[0];

  if (tx?.payment_id) {
    if (status === "completed") {
      await pool.query(
        `UPDATE public.payments
         SET status = 'completed',
             processed_at = now(),
             updated_at = now()
         WHERE id = $1
           AND status <> 'completed'`,
        [tx.payment_id],
      );

      await paymentService.settlePaymentFinancials({
        paymentId: tx.payment_id,
        provider: "opay",
        providerReference: reference,
        driverId: tx.driver_id,
        rentalId: tx.rental_id,
        vehicleId: tx.vehicle_id,
        amount: Number(tx.amount),
        currency: tx.currency || "NGN",
      });

      await pool.query(
        `UPDATE public.iot_device_orders
         SET payment_status = 'confirmed',
             payment_confirmed_at = now()
         WHERE payment_reference = $1`,
        [reference],
      );
    } else if (status === "failed") {
      await pool.query(
        `UPDATE public.payments
         SET status = 'failed',
             failure_reason = $1,
             updated_at = now()
         WHERE id = $2
           AND status <> 'completed'`,
        [
          failure,
          tx.payment_id,
        ],
      );
    }
  }

  return {
    received: true,
    reference,
    status,
  };
  }
  
