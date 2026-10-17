
/**
 * Authoritative RentMaikar Payment, Ledger, and Settlement Service
 *
 * Provides unified payment execution for:
 * - USA: PayPal REST API
 * - Nigeria: Paystack and OPay
 * - Platform wallet ledger and owner earnings settlement
 * - Owner payouts and transfers
 */

import { getDbPool } from "./dbPool";
import { providerAmountMatches } from "./paymentAuthority";
import {
  PayoutError,
  PayoutProvider,
  assertTwoDecimalAmount,
  claimProviderAttempt,
  claimWeeklyPayout,
  classifyProviderFailure,
  createSelfWithdrawal,
  finalizePayout,
  isUuid,
  mapPayPalItemStatus,
  mapPaystackTransferStatus,
  markReconciliationRequired,
  reconcileProviderOutcome,
  recordSubmitted,
  resolveIdempotencyKey,
} from "./ownerPayoutWorkflow";

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

function normalizePaymentPurpose(
  value?: string | null,
): PaymentPurpose {
  const purpose = (value || "rental").trim();

  if (
    (PAYMENT_PURPOSES as readonly string[]).includes(purpose)
  ) {
    return purpose as PaymentPurpose;
  }

  throw new Error(
    `Invalid payment purpose "${purpose}". Allowed purposes: ${PAYMENT_PURPOSES.join(", ")}`,
  );
}

export interface CreateOrderParams {
  amount: number;
  currency?: string;
  rental_id?: string;
  vehicle_id?: string;
  driver_id?: string;
  owner_id?: string;
  payment_frequency?: string;
  description?: string;
  purpose?: string;
  iot_device_order_id?: string;
  return_url?: string;
  cancel_url?: string;
}

export interface CaptureOrderParams {
  order_id: string;
  user_id?: string;
}

export interface PaystackInitParams {
  amount: number;
  email: string;
  currency?: string;
  rental_id?: string;
  vehicle_id?: string;
  driver_id?: string;
  owner_id?: string;
  purpose?: PaymentPurpose;
  callback_url?: string;
  metadata?: Record<string, unknown>;
}

export interface OPayInitParams {
  amount: number;
  currency?: string;
  reference?: string;
  driver_id?: string;
  rental_id?: string;
  vehicle_id?: string;
  user_phone?: string;
  return_url?: string;
}

/** Error raised before any payout request reached PayPal (no transfer can exist). */
function notSentError(message: string): Error & { notSent: true } {
  return Object.assign(new Error(message), { notSent: true as const });
}

class PaymentService {
  private paypalTokenCache: {
    token: string;
    expiresAt: number;
  } | null = null;

  private resolvedPayPalBase: string | null = null;

  // ---------------------------------------------------------------------------
  // PayPal REST Helpers & Authentication
  // ---------------------------------------------------------------------------

  private getPayPalConfig(): {
    clientId: string;
    clientSecret: string;
    mode: "live" | "sandbox";
    baseUrl: string;
    isConfigured: boolean;
  } {
    // Keep PayPal credentials server-side.
    const clientId = (
      process.env.PAYPAL_CLIENT_ID || ""
    ).trim();

    const clientSecret = (
      process.env.PAYPAL_CLIENT_SECRET || ""
    ).trim();

    const configuredMode = (
      process.env.PAYPAL_MODE ||
      process.env.PAYPAL_ENVIRONMENT ||
      ""
    ).trim().toLowerCase();

    if (
      configuredMode !== "live" &&
      configuredMode !== "production" &&
      configuredMode !== "sandbox"
    ) {
      throw new Error(
        "PayPal environment must be explicitly configured using PAYPAL_MODE=live or PAYPAL_MODE=sandbox.",
      );
    }

    const isLive =
      configuredMode === "live" ||
      configuredMode === "production";

    const defaultBase = isLive
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com";

    return {
      clientId,
      clientSecret,
      mode: isLive ? "live" : "sandbox",
      baseUrl: this.resolvedPayPalBase || defaultBase,
      isConfigured: Boolean(clientId && clientSecret),
    };
  }

  private async getPayPalAccessToken(): Promise<string> {
    const config = this.getPayPalConfig();

    if (!config.isConfigured) {
      throw new Error(
        "PayPal API credentials are not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.",
      );
    }

    // Reuse the token only while it has sufficient remaining validity.
    if (
      this.paypalTokenCache &&
      this.paypalTokenCache.expiresAt > Date.now() + 60_000
    ) {
      return this.paypalTokenCache.token;
    }

    const auth = Buffer.from(
      `${config.clientId}:${config.clientSecret}`,
    ).toString("base64");

    const response = await fetch(
      `${config.baseUrl}/v1/oauth2/token`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: "grant_type=client_credentials",
      },
    );

    const responseText = await response.text();

    let payload: {
      access_token?: string;
      expires_in?: number;
      error_description?: string;
    } = {};

    try {
      payload = responseText
        ? JSON.parse(responseText)
        : {};
    } catch {
      throw new Error(
        `PayPal authentication returned an invalid response (HTTP ${response.status}).`,
      );
    }

    if (!response.ok) {
      throw new Error(
        `PayPal authentication failed (HTTP ${response.status}): ${payload.error_description || "Provider rejected the request."}`,
      );
    }

    const token = payload.access_token;

    if (typeof token !== "string" || !token.trim()) {
      throw new Error(
        "PayPal authentication response did not contain a valid access token.",
      );
    }

    const expiresIn = Number(payload.expires_in);

    // Avoid caching tokens with an invalid or missing lifetime.
    if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
      throw new Error(
        "PayPal authentication response contained an invalid token lifetime.",
      );
    }

    this.paypalTokenCache = {
      token,
      expiresAt: Date.now() + expiresIn * 1000,
    };

    return token;
  }

  // ---------------------------------------------------------------------------
  // PayPal Order Creation
  // ---------------------------------------------------------------------------

  async createPayPalOrder(params: CreateOrderParams) {
    const amountVal = Number(params.amount);
    const purpose = normalizePaymentPurpose(params.purpose);

    if (!Number.isFinite(amountVal) || amountVal <= 0) {
      throw new Error("Payment amount must be greater than 0");
    }

    const token = await this.getPayPalAccessToken();
    const config = this.getPayPalConfig();
    const pool = getDbPool();

    const orderPayload = {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: params.rental_id || params.vehicle_id || `rm_${Date.now()}`,
          description: params.description || `RentMaikar Payment (${params.payment_frequency || "rental"})`,
          amount: {
            currency_code: "USD",
            value: amountVal.toFixed(2),
          },
          custom_id: params.driver_id || undefined,
        },
      ],
      application_context: {
        brand_name: "RentMaikar",
        user_action: "PAY_NOW",
        return_url: params.return_url || "https://rentmaikar.com/payment-success",
        cancel_url: params.cancel_url || "https://rentmaikar.com/payment-cancelled",
      },
    };

    const res = await fetch(`${config.baseUrl}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      },
      body: JSON.stringify(orderPayload),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[PayPal Service] Create order failed:", res.status, errText);
      throw new Error(`PayPal order creation failed [${res.status}]: ${errText}`);
    }

    const paypalOrder = await res.json();
    const orderId = paypalOrder.id;

    // 1. Insert into public.payments using pool
    let paymentId: string | null = null;
    try {
      const pRes = await pool.query(
        `INSERT INTO public.payments (
          amount, currency, payment_method, status, driver_id, owner_id, rental_id, vehicle_id, purpose, payment_frequency, transaction_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id`,
        [
          amountVal,
          "USD",
          "paypal",
          "pending",
          params.driver_id || null,
          params.owner_id || null,
          params.rental_id || null,
          params.vehicle_id || null,
          purpose,
          params.payment_frequency || "weekly",
          orderId,
        ]
      );
      paymentId = pRes.rows[0]?.id || null;
    } catch (e: any) {
      console.error("[PayPal Service] Error recording payments row:", e.message);
    }

    // 2. Insert into public.paypal_transactions
    try {
      await pool.query(
        `INSERT INTO public.paypal_transactions (
          payment_id, order_id, driver_id, owner_id, rental_id, vehicle_id, amount, currency, status, raw_order_response
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          paymentId,
          orderId,
          params.driver_id || null,
          params.owner_id || null,
          params.rental_id || null,
          params.vehicle_id || null,
          amountVal,
          "USD",
          "created",
          JSON.stringify(paypalOrder),
        ]
      );
    } catch (e: any) {
      console.error("[PayPal Service] Error recording paypal_transactions row:", e.message);
      throw new Error(`Failed to create paypal transaction record: ${e.message}`);
    }

    return {
      order_id: orderId,
      payment_id: paymentId,
      status: paypalOrder.status,
      links: paypalOrder.links,
    };
  }

  // ---------------------------------------------------------------------------
  // PayPal Order Capture & Financial Settlement
  // ---------------------------------------------------------------------------

  async capturePayPalOrder(params: CaptureOrderParams, opts?: { isAdmin?: boolean }) {
    const { order_id, user_id } = params;
    if (!order_id) {
      throw new Error("Missing required order_id for capture");
    }

    const pool = getDbPool();

    // 1. The order must be one we created, and the caller must own it.
    const txRes = await pool.query(
      `SELECT * FROM public.paypal_transactions WHERE order_id = $1`,
      [order_id]
    );
    const existingTx = txRes.rows[0];
    if (!existingTx) {
      throw new Error("PayPal order not found");
    }
    if (!opts?.isAdmin && (!user_id || existingTx.driver_id !== user_id)) {
      throw new Error("Forbidden");
    }

    if (existingTx.status === "completed" || existingTx.status === "captured") {
      return {
        order_id,
        capture_id: existingTx.capture_id,
        status: "COMPLETED",
        payment_id: existingTx.payment_id,
        already_captured: true,
      };
    }

    // 2. Execute capture against PayPal REST API
    const token = await this.getPayPalAccessToken();
    const config = this.getPayPalConfig();
    const res = await fetch(`${config.baseUrl}/v2/checkout/orders/${encodeURIComponent(order_id)}/capture`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": `capture_${order_id}`,
      },
      body: JSON.stringify({}),
    });

    const captureData = await res.json().catch(() => null);

    // Only an authentic 2xx capture response may complete a payment. A 422
    // (e.g. ORDER_NOT_APPROVED / already captured) is NOT evidence of payment.
    if (!res.ok || !captureData) {
      console.error("[PayPal Service] Capture error:", res.status);
      throw new Error(captureData?.message || `PayPal capture failed [${res.status}]`);
    }

    const captureUnit = captureData.purchase_units?.[0]?.payments?.captures?.[0];
    if (captureData.status !== "COMPLETED" || !captureUnit?.id || captureUnit.status !== "COMPLETED") {
      return {
        order_id,
        status: String(captureData.status || "PENDING"),
        payment_id: existingTx.payment_id,
        captured: false,
      };
    }

    const captureId = String(captureUnit.id);
    const payerEmail = captureData.payer?.email_address || null;
    const payerId = captureData.payer?.payer_id || null;
    const paymentId = existingTx.payment_id;

    if (!paymentId) {
      throw new Error("PayPal order is not linked to a payment");
    }

    // 3. Amount/currency must match what was ordered, then complete + settle
    //    atomically (row lock; settlement is idempotent via settled_at).
    const settled = await this.completeVerifiedPaymentAndSettle({
      paymentId,
      provider: "paypal",
      providerReference: captureId,
      providerAmount: Number(captureUnit.amount?.value),
      providerCurrency: String(captureUnit.amount?.currency_code || ""),
    });
    if (!settled.ok) {
      return {
        order_id,
        capture_id: captureId,
        status: settled.reason || "settlement_rejected",
        payment_id: paymentId,
        captured: false,
      };
    }

    await pool.query(
      `UPDATE public.paypal_transactions
       SET status = 'completed',
           capture_id = $1,
           payer_email = $2,
           payer_id = $3,
           raw_capture_response = $4,
           updated_at = now()
       WHERE order_id = $5`,
      [captureId, payerEmail, payerId, JSON.stringify(captureData), order_id]
    );
    await pool.query(
      `UPDATE public.payments SET transaction_id = $1, updated_at = now() WHERE id = $2`,
      [captureId, paymentId]
    );

    return {
      order_id,
      capture_id: captureId,
      status: "COMPLETED",
      payment_id: paymentId,
      payer_email: payerEmail,
    };
  }

  // ---------------------------------------------------------------------------
  // Paystack Integration (Nigeria)
  // ---------------------------------------------------------------------------

  private getPaystackConfig() {
    const secretKey = (process.env.PAYSTACK_SECRET_KEY || "").trim();
    const publicKey = (process.env.PAYSTACK_PUBLIC_KEY || process.env.VITE_PAYSTACK_PUBLIC_KEY || "").trim();
    return {
      secretKey,
      publicKey,
      isConfigured: Boolean(secretKey),
    };
  }

  async createPaystackTransaction(params: PaystackInitParams) {
  const config = this.getPaystackConfig();

  if (!config.secretKey) {
    throw new Error(
      "Paystack is not configured: PAYSTACK_SECRET_KEY is required"
    );
  }

  const amountVal = Number(params.amount);
  const purpose = normalizePaymentPurpose(params.purpose);

  if (!Number.isFinite(amountVal) || amountVal <= 0) {
    throw new Error("Payment amount must be greater than 0");
  }

  const email = (params.email || "").trim();

  if (!email) {
    throw new Error(
      "Customer email is required for Paystack transaction"
    );
  }

  const currency =
    (params.currency || "NGN").toUpperCase();

  const reference =
    `rm_pstk_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 8)}`;

  const res = await fetch(
    "https://api.paystack.co/transaction/initialize",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        amount: Math.round(amountVal * 100),
        currency,
        reference,
        callback_url:
          params.callback_url ||
          "https://rentmaikar.com/payment-success",
        metadata: {
          rental_id: params.rental_id,
          vehicle_id: params.vehicle_id,
          driver_id: params.driver_id,
          owner_id: params.owner_id,
          ...params.metadata,
        },
      }),
    }
  );

  const payload = await res
    .json()
    .catch(() => null);

  if (!res.ok) {
    throw new Error(
      `Paystack transaction initialization failed [${res.status}]: ${
        payload?.message ||
        "Paystack rejected the request"
      }`
    );
  }

  if (
    payload?.status !== true ||
    !payload?.data?.authorization_url ||
    !payload?.data?.access_code
  ) {
    throw new Error(
      "Paystack transaction initialization returned invalid checkout credentials"
    );
  }

  const pool = getDbPool();

  let paymentId: string | null = null;

  try {
    const pRes = await pool.query(
      `INSERT INTO public.payments (
        amount,
        currency,
        payment_method,
        status,
        driver_id,
        owner_id,
        rental_id,
        vehicle_id,
        purpose,
        transaction_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id`,
      [
        amountVal,
        currency,
        "paystack",
        "pending",
        params.driver_id || null,
        params.owner_id || null,
        params.rental_id || null,
        params.vehicle_id || null,
        purpose,
        reference,
      ]
    );

    paymentId =
      pRes.rows[0]?.id || null;
  } catch (e: any) {
    console.error(
      "[Paystack Service] Error recording payment row:",
      e.message
    );

    throw new Error(
      `Failed to create payment record: ${e.message}`
    );
  }

  try {
    await pool.query(
      `INSERT INTO public.paystack_transactions (
        reference,
        access_code,
        authorization_url,
        amount,
        currency,
        status,
        payment_id,
        driver_id,
        rental_id,
        vehicle_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        reference,
        payload.data.access_code,
        payload.data.authorization_url,
        amountVal,
        currency,
        "pending",
        paymentId,
        params.driver_id || null,
        params.rental_id || null,
        params.vehicle_id || null,
      ]
    );
  } catch (e: any) {
    console.error(
      "[Paystack Service] Error recording paystack transaction:",
      e.message
    );

    
throw new Error(
  `Failed to record Paystack transaction: ${e.message}`
);
}
  async verifyPaystackTransaction(reference: string) {
  if (!reference) {
    throw new Error(
      "Missing required reference for verification"
    );
  }

  const config = this.getPaystackConfig();

  if (!config.secretKey) {
    throw new Error(
      "Paystack is not configured: PAYSTACK_SECRET_KEY is required"
    );
  }

  const pool = getDbPool();

  const storedRes = await pool.query(
    `SELECT * FROM public.paystack_transactions WHERE reference = $1 LIMIT 1`,
    [reference]
  );
  const stored = storedRes.rows[0];
  if (!stored) {
    throw new Error(`Paystack transaction record not found for reference ${reference}`);
  }
  // User-initiated verification: caller must own the transaction (or be admin).
  // Internal (webhook) callers omit opts after cryptographic signature checks.
  if (opts && !opts.isAdmin && (!opts.callerId || stored.driver_id !== opts.callerId)) {
    throw new Error("Forbidden");
  }

  const res = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(
      reference
    )}`,
    {
      method: "GET",
      headers: {
        Authorization:
          `Bearer ${config.secretKey}`,
      },
    }
  );

  const payload = await res
    .json()
    .catch(() => null);

  if (!res.ok) {
    throw new Error(
      `Paystack transaction verification failed [${res.status}]: ${
        payload?.message ||
        "Paystack rejected the verification request"
      }`
    );
  }

  if (payload?.status !== true || !payload?.data) {
    throw new Error(
      "Paystack returned an invalid verification response"
    );
  }

  const providerStatus =
    String(payload.data.status || "").toLowerCase();

  const isSuccess =
    providerStatus === "success";

  const gatewayResponse =
    payload.data.gateway_response ||
    (isSuccess
      ? "Successful"
      : providerStatus || "Verification incomplete");

  if (!isSuccess) {
    return {
      success: false,
      status: providerStatus || "failed",
      reference,
      gateway_response: gatewayResponse,
    };
  }

  if (String(payload.data.reference ?? "") !== reference) {
    return {
      success: false,
      status: "reference_mismatch",
      reference,
      gateway_response: "Provider reference does not match",
    };
  }

  const payerRes = await pool.query(
    `SELECT p.payer_type, px.proxy_email
       FROM public.payments p
       LEFT JOIN public.driver_proxy_billing_accounts px ON px.id = p.proxy_account_id
      WHERE p.id = $1`,
    [stored.payment_id],
  );
  const payerRow = payerRes.rows[0];
  if (
    payerRow?.payer_type === "proxy" &&
    (!payerRow.proxy_email ||
      String(payload.data.customer?.email ?? "").toLowerCase() !==
        String(payerRow.proxy_email).toLowerCase())
  ) {
    console.error("[Paystack] proxy payer mismatch; refusing settlement", { reference });
    return {
      success: false,
      status: "payer_mismatch",
      reference,
      gateway_response: "Payer does not match the approved proxy",
    };
  }

  const providerAmount = Number(payload.data.amount) / 100;
  if (
    !providerAmountMatches(
      Number(stored.amount),
      String(stored.currency || ""),
      providerAmount,
      payload.data.currency
    )
  ) {
    console.error("[Paystack] amount/currency mismatch; refusing settlement", { reference });
    return {
      success: false,
      status: "amount_mismatch",
      reference,
      gateway_response: "Provider amount or currency does not match the expected payment",
    };
  }

  if (!stored.payment_id) {
    return {
      success: false,
      status: "unassociated_payment",
      reference,
      gateway_response: "Transaction is not linked to a payment",
    };
  }

  const settled = await this.completeVerifiedPaymentAndSettle({
    paymentId: stored.payment_id,
    provider: "paystack",
    providerReference: reference,
    providerAmount,
    providerCurrency: String(payload.data.currency || ""),
  });

  if (!settled.ok) {
    return {
      success: false,
      status: settled.reason || "settlement_rejected",
      reference,
      gateway_response: gatewayResponse,
    };
  }

  await pool.query(
    `UPDATE public.paystack_transactions
     SET status = 'success',
         gateway_response = $1,
         updated_at = now()
     WHERE reference = $2`,
    [gatewayResponse, reference]
  );

  return {
    success: true,
    status: "success",
    reference,
    gateway_response: gatewayResponse,
  };
}
  // ---------------------------------------------------------------------------
  // Financial Settlement, Ledger, and Owner Earnings
  // ---------------------------------------------------------------------------

  async settlePaymentFinancials(opts: {
    paymentId?: string | null;
    provider: string;
    providerReference: string;
    driverId?: string | null;
    ownerId?: string | null;
    rentalId?: string | null;
    vehicleId?: string | null;
    amount: number;
    currency: string;
  }) {
    if (!opts.paymentId) {
      throw new Error("paymentId is required for authoritative settlement");
    }

    const pool = getDbPool();
    const client = await pool.connect();
    let settlement: any;
    try {
      await client.query("BEGIN");
      // Serialise concurrent settlement attempts (webhook + verify + capture)
      // on the payment row; the SQL function is idempotent via settled_at.
      await client.query(`SELECT id FROM public.payments WHERE id = $1 FOR UPDATE`, [opts.paymentId]);
      const result = await client.query(
        `SELECT public.settle_payment_financials($1, $2, $3) AS result`,
        [opts.paymentId, opts.provider, opts.providerReference]
      );
      settlement = result.rows[0]?.result;
      if (!settlement?.ok) {
        throw new Error(settlement?.reason || "Authoritative payment settlement failed");
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    return settlement;
  }

  /**
   * Mark a payment completed and settle it atomically after the provider has
   * been authoritatively queried. Validates provider amount/currency against
   * the stored payment row inside the lock. Never settles refunded payments.
   */
  async completeVerifiedPaymentAndSettle(opts: {
    paymentId: string;
    provider: string;
    providerReference: string;
    providerAmount: number;
    providerCurrency: string;
  }): Promise<{ ok: boolean; reason?: string; duplicate?: boolean }> {
    const pool = getDbPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const pRes = await client.query(
        `SELECT id, status, amount, currency FROM public.payments WHERE id = $1 FOR UPDATE`,
        [opts.paymentId]
      );
      const payment = pRes.rows[0];
      if (!payment) {
        await client.query("ROLLBACK");
        return { ok: false, reason: "payment_not_found" };
      }
      if (
        !providerAmountMatches(
          Number(payment.amount),
          String(payment.currency || ""),
          opts.providerAmount,
          opts.providerCurrency
        )
      ) {
        await client.query("ROLLBACK");
        return { ok: false, reason: "amount_or_currency_mismatch" };
      }
      if (payment.status === "refunded") {
        await client.query("ROLLBACK");
        return { ok: false, reason: "payment_refunded" };
      }
      if (payment.status !== "completed") {
        await client.query(
          `UPDATE public.payments
              SET status = 'completed', processed_at = now(), updated_at = now()
            WHERE id = $1`,
          [opts.paymentId]
        );
      }
      const result = await client.query(
        `SELECT public.settle_payment_financials($1, $2, $3) AS result`,
        [opts.paymentId, opts.provider, opts.providerReference]
      );
      const settlement = result.rows[0]?.result;
      if (!settlement?.ok) {
        throw new Error(settlement?.reason || "Authoritative payment settlement failed");
      }
      await client.query("COMMIT");
      return { ok: true, duplicate: Boolean(settlement.duplicate) };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // Owner Payout Initiation & Withdrawal Query
  // ---------------------------------------------------------------------------

  async getOwnerWithdrawalData(ownerId: string, currency: string = "USD") {
    const pool = getDbPool();
    const curr = (currency || "USD").toUpperCase();
    const [balRes, accsRes, payoutsRes, profileRes] = await Promise.all([
      pool.query(
        `SELECT COALESCE(available_balance, 0) as balance
         FROM public.wallet_accounts
         WHERE user_id = $1 AND account_type = 'owner' AND currency = $2`,
        [ownerId, curr]
      ),
      pool.query(
        `SELECT id, provider, currency, bank_name, account_number, account_name, paypal_email, recipient_code, is_default
         FROM public.owner_payout_accounts
         WHERE owner_id = $1
         ORDER BY is_default DESC, created_at DESC`,
        [ownerId]
      ),
      pool.query(
        `SELECT id, amount, currency, status, provider, transfer_reference, failure_reason, created_at, processed_at
         FROM public.owner_payouts
         WHERE owner_id = $1
         ORDER BY created_at DESC
         LIMIT 25`,
        [ownerId]
      ),
      pool.query(
        `SELECT phone_verified FROM public.profiles WHERE user_id = $1`,
        [ownerId]
      ),
    ]);

    return {
      balance: Number(balRes.rows[0]?.balance || 0),
      accounts: accsRes.rows,
      payouts: payoutsRes.rows,
      phoneVerified: Boolean(profileRes.rows[0]?.phone_verified),
    };
  }
async processPayPalOwnerPayout(opts: {
  owner_id: string;
  amount: number;
  currency: string;
  payout_account_id: string;
  authorization_id: string;
  note?: string;
  idempotency_key?: string;
}) {
  const pool = getDbPool();
  const currency = String(opts.currency || "USD").toUpperCase();
  const amount = Number(opts.amount);

  if (!opts.owner_id) {
    throw new Error("owner_id is required");
  }

  if (!Number.isFinite(amount) || amount < 1) {
    throw new Error("PayPal payout amount must be at least 1.00");
  }

  if (Math.round(amount * 100) !== amount * 100) {
    throw new Error("PayPal payout amount must have at most 2 decimals");
  }

  if (currency !== "USD") {
    throw new Error("PayPal owner payouts currently support USD only");
  }

  const mode = (
    process.env.PAYPAL_MODE ||
    process.env.PAYPAL_ENVIRONMENT ||
    ""
  ).trim().toLowerCase();

  if (!clientId || !clientSecret) {
    throw notSentError("PayPal payout credentials are not configured");
  }
  /*
   * 1. Idempotency.
   *
   * The same idempotency key must resolve to the same payout record.
   */
  if (opts.idempotency_key) {
    const existing = await pool.query(
      `SELECT *
       FROM public.owner_payouts
       WHERE owner_id = $1
         AND transfer_reference = $2
       LIMIT 1`,
      [opts.owner_id, opts.idempotency_key],
    );
  }

  const baseUrl =
    mode === "live" || mode === "production"
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com";

  if (
    !Number.isFinite(opts.amount) ||
    opts.amount < 1 ||
    Math.round(opts.amount * 100) !== opts.amount * 100
  ) {
    throw notSentError(
      "PayPal payout amount must be at least 1.00 and have at most two decimal places",
    );
  }

  const receiver = opts.receiver?.trim();
  const reference = opts.reference?.trim();

  if (!receiver) {
    throw notSentError("PayPal payout receiver is required");
  }

  if (
    !reference ||
    reference.length > 50 ||
    !/^[A-Za-z0-9._-]+$/.test(reference)
  ) {
    throw notSentError("PayPal payout reference is invalid");
  }

  const basic = Buffer.from(
    `${clientId}:${clientSecret}`,
  ).toString("base64");

  let tokenResponse: Response;
  try {
    tokenResponse = await fetch(
      `${baseUrl}/v1/oauth2/token`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: "grant_type=client_credentials",
      },
    );
  } catch (e) {
    throw notSentError(
      `PayPal authentication request failed: ${e instanceof Error ? e.message : "network error"}`,
    );
  }

  const tokenText = await tokenResponse.text();

  let tokenPayload: any;

  try {
    tokenPayload = tokenText ? JSON.parse(tokenText) : {};
  } catch {
    tokenPayload = {};
  }

  if (!tokenResponse.ok) {
    throw notSentError(
      `PayPal authentication failed (HTTP ${tokenResponse.status})`,
    );
  }

  const accessToken = tokenPayload?.access_token;

  if (
    typeof accessToken !== "string" ||
    !accessToken.trim()
  ) {
    throw notSentError("PayPal access token missing from response");
  }

  const response = await fetch(
    `${baseUrl}/v1/payments/payouts`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "PayPal-Request-Id": reference,
      },
      body: JSON.stringify({
        sender_batch_header: {
          sender_batch_id: reference,
          email_subject: "RentMaikar payout",
          email_message: opts.note,
        },
        items: [
          {
            recipient_type: "EMAIL",
            receiver,
            amount: {
              value: opts.amount.toFixed(2),
              currency: "USD",
            },
            sender_item_id: reference,
            note: opts.note,
          },
        ],
      }),
    },
  );

  const responseText = await response.text();

  let payload: any;

  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch {
    payload = {
      unparsed_response: responseText.slice(0, 2000),
    };
  }

  if (!response.ok) {
    const error = new Error(
      `PayPal payout request failed (HTTP ${response.status})`,
    ) as Error & {
      status?: number;
      body?: unknown;
    };

    error.status = response.status;
    error.body = payload;

    throw error;
  }

  const batchId = payload?.batch_header?.payout_batch_id;
  const batchStatus = String(
    payload?.batch_header?.batch_status || "PENDING",
  ).toUpperCase();

  if (typeof batchId !== "string" || !batchId.trim()) {
    /*
     * PayPal may have accepted the request even if its response
     * does not contain the expected batch ID.
     * Reconcile this reference before attempting another payout.
     */
    const error = new Error(
      "PayPal returned no payout batch ID; reconcile before retrying",
    ) as Error & {
      status?: number;
      body?: unknown;
      ambiguous?: boolean;
    };

    error.status = response.status;
    error.body = payload;
    error.ambiguous = true;

    throw error;
  }

  return {
    batchId,
    batchStatus,
    raw: payload,
  };
  }
  /**
   * Creates a weekly bulk payout row and reserves funds in one transaction.
   * The row is NOT executable until an administrator approves it
   * (approve_weekly_owner_payout) and its scheduled_for time has passed.
   */
  async createWeeklyBulkPayout(opts: {
    owner_id: string;
    amount: number;
    currency?: string;
    provider: PayoutProvider;
    payout_account_id: string;
    scheduled_for: Date;
    initiated_by?: "cron" | "admin";
  }) {
    const ownerId = String(opts.owner_id || "").trim();
    const currency = String(opts.currency || "USD").toUpperCase();
    const amount = assertTwoDecimalAmount(opts.amount);
    const initiatedBy = opts.initiated_by === "admin" ? "admin" : "cron";
    if (!isUuid(ownerId) || !isUuid(opts.payout_account_id)) {
      throw new PayoutError("invalid_request", "owner and payout account identifiers are required");
    }

    const pool = getDbPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`owner_payout:${ownerId}`]);

      const acct = await client.query(
        `SELECT 1 FROM public.owner_payout_accounts
         WHERE id = $1 AND owner_id = $2 AND provider = $3 AND upper(currency) = $4`,
        [opts.payout_account_id, ownerId, opts.provider, currency],
      );
      if (!acct.rows[0]) throw new PayoutError("invalid_account", "Payout account does not match owner/provider/currency");

      await client.query(`SELECT public.ensure_wallet_account($1, 'owner', $2)`, [ownerId, currency]);
      await client.query(
        `SELECT 1 FROM public.wallet_accounts WHERE user_id = $1 AND account_type = 'owner' AND currency = $2 FOR UPDATE`,
        [ownerId, currency],
      );
      const bal = await client.query(`SELECT public.get_owner_available_balance($1, $2) AS balance`, [ownerId, currency]);
      if (!(Number(bal.rows[0]?.balance) >= amount)) {
        throw new PayoutError("insufficient_balance", "Insufficient available balance");
      }

      const ins = await client.query(
        `INSERT INTO public.owner_payouts (
           owner_id, payout_account_id, provider, amount, currency, status,
           transfer_reference, initiated_by, scheduled_for, workflow_type, reserved_at
         ) VALUES ($1, $2, $3, $4, $5, 'pending', 'pyt_' || replace(gen_random_uuid()::text, '-', ''),
                   $6, $7, 'weekly_bulk', now())
         RETURNING id, transfer_reference`,
        [ownerId, opts.payout_account_id, opts.provider, amount, currency, initiatedBy, opts.scheduled_for],
      );
      const payout = ins.rows[0];

      const ledger = await client.query(
        `SELECT public.post_wallet_entry($1, 'owner', $2, 'debit', $3, 'payout', $4,
           'owner_payouts', $5, $6, $7, 'Weekly owner payout reserved') AS result`,
        [ownerId, currency, amount, `payout:${payout.id}:reserved`, payout.id, opts.provider, payout.transfer_reference],
      );
      if (!ledger.rows[0]?.result?.entry_id) throw new Error("Wallet reservation failed");

      await client.query("COMMIT");
      return { success: true, payout_id: payout.id, status: "pending", workflow_type: "weekly_bulk" };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // Webhook Signature Verifiers & Processors
  // ---------------------------------------------------------------------------

  async handlePayPalWebhook(
headers: Record<string, any>,
rawBody: string | any,
) {
const raw =
typeof rawBody === "string"
? rawBody
: JSON.stringify(rawBody);

if (!raw) {
  throw new Error("PayPal webhook body is required");
}

const signatureValid =
  await this.verifyPayPalWebhookSignature(headers, raw);

if (!signatureValid) {
  throw new Error("Invalid PayPal webhook signature");
}

const event =
      typeof rawBody === "string"
        ? JSON.parse(rawBody)
        : rawBody;

    if (!event || typeof event !== "object") {
      throw new Error("Invalid Paystack webhook event");
    }

    const eventType = event.event || "";
    const reference = event.data?.reference || "";

    if (!eventType || !reference) {
      throw new Error(
        "Paystack webhook event type and transaction reference are required",
      );
    }
    const pool = getDbPool();
    const eventType = event.event_type || "";
    const eventId = event.id || "";
    const resource = event.resource || {};
    const orderId = resource.supplementary_data?.related_ids?.order_id || resource.id;

    const existingRes = await pool.query(
      `SELECT id FROM public.payment_webhook_events WHERE external_event_id = $1`,
      [eventId]
    );

if (!event || typeof event !== "object") {
  throw new Error("Invalid PayPal webhook event");
}

const pool = getDbPool();
const eventType = event.event_type || "";
const eventId = event.id || "";
const resource = event.resource || {};
const orderId =
  resource.supplementary_data?.related_ids?.order_id ||
  resource.id ||
  "";

if (!eventId || !eventType) {
  throw new Error("PayPal webhook event ID and type are required");
}

const existingRes = await pool.query(
  `SELECT id
   FROM public.payment_webhook_events
   WHERE external_event_id = $1`,
  [eventId],
);

if (existingRes.rows.length > 0) {
  return { received: true, duplicate: true };
}

  async handlePaystackWebhook(headers: Record<string, any>, rawBody: string | any) {
    const pool = getDbPool();
    const eventType = event.event || "";
    const reference = event.data?.reference || "";

    const externalId = `${eventType}:${reference}`;
    const existingRes = await pool.query(
      `SELECT id FROM public.payment_webhook_events WHERE external_event_id = $1`,
      [externalId]
    );
    await reconcileProviderOutcome({
      provider: "paypal",
      references: [
        item.sender_item_id,
        resource.sender_batch_id,
        resource.payout_batch_id,
      ],
      outcome,
      reportedAmount:
        item.amount?.value != null ? Number(item.amount.value) : null,
      reportedCurrency: item.amount?.currency ?? null,
      evidence: {
        source: "paypal_webhook",
        event_id: eventId,
        event_type: eventType,
        transaction_status: resource.transaction_status ?? null,
        payout_item_id: resource.payout_item_id ?? null,
        payout_batch_id: resource.payout_batch_id ?? null,
      },
    });
  } catch (error) {
    // Let PayPal redeliver: forget the dedupe row so the retry is processed.
    await pool
      .query(
        `DELETE FROM public.payment_webhook_events WHERE external_event_id = $1`,
        [eventId],
      )
      .catch(() => undefined);
    throw error;
  }
  return { received: true };
}

if (
  eventType === "PAYMENT.CAPTURE.COMPLETED" ||
  eventType === "CHECKOUT.ORDER.APPROVED"
) {
  if (orderId) {
    try {
      await this.capturePayPalOrder({ order_id: orderId });
    } catch (error) {
      console.error(
        "[PayPal Webhook] Order processing failed:",
        error,
      );
      throw error;
    }
  }
}

return { received: true };

}

async handlePaystackWebhook(
headers: Record<string, any>,
rawBody: string | any,
) {
// The signature is computed over the exact bytes Paystack sent; a
// re-serialised object can never be verified, so only raw text is accepted.
const raw = typeof rawBody === "string" ? rawBody : "";

if (!raw) {
  throw new Error("Paystack webhook body is required");
}

const config = this.getPaystackConfig();

if (!config.secretKey) {
  throw new Error(
    "Paystack webhook verification is not configured",
  );
}

const crypto = await import("node:crypto");
const suppliedSignature =
  headers["x-paystack-signature"] ??
  headers["X-Paystack-Signature"];

if (
  typeof suppliedSignature !== "string" ||
  !suppliedSignature.trim()
) {
  throw new Error("Missing Paystack webhook signature");
}

const expectedSignature = crypto
  .createHmac("sha512", config.secretKey)
  .update(raw)
  .digest("hex");

const supplied = Buffer.from(suppliedSignature, "hex");
const expected = Buffer.from(expectedSignature, "hex");

if (
  supplied.length !== expected.length ||
  !crypto.timingSafeEqual(supplied, expected)
) {
  throw new Error("Invalid Paystack webhook signature");
}

let event: any;
try {
  event = JSON.parse(raw);
} catch {
  throw new Error("Invalid Paystack webhook event");
}

if (!event || typeof event !== "object") {
  throw new Error("Invalid Paystack webhook event");
}

const pool = getDbPool();
const eventType = event.event || "";
const reference = event.data?.reference || "";

if (!eventType || !reference) {
  throw new Error(
    "Paystack webhook event type and transaction reference are required",
  );
}

const externalId = `${eventType}:${reference}`;

const insertRes = await pool.query(
  `INSERT INTO public.payment_webhook_events (
    provider,
    event_type,
    external_event_id,
    reference,
    status,
    signature_valid,
    payload
  ) VALUES ($1, $2, $3, $4, 'received', true, $5)
  ON CONFLICT (provider, external_event_id)
    WHERE external_event_id IS NOT NULL DO NOTHING
  RETURNING id`,
  [
    "paystack",
    eventType,
    externalId,
    reference,
    JSON.stringify(event),
  ],
);

if (insertRes.rows.length === 0) {
  return { received: true, duplicate: true };
}

if (
  eventType === "transfer.success" ||
  eventType === "transfer.failed" ||
  eventType === "transfer.reversed"
) {
  try {
    const data = event.data || {};
    await reconcileProviderOutcome({
      provider: "paystack",
      references: [reference, data.transfer_code],
      outcome: mapPaystackTransferStatus(eventType),
      reportedAmount: data.amount != null ? Number(data.amount) / 100 : null,
      reportedCurrency: data.currency ?? null,
      evidence: {
        source: "paystack_webhook",
        event_type: eventType,
        reason: data.reason ?? null,
        transfer_code: data.transfer_code ?? null,
      },
    });
  } catch (error) {
    await pool
      .query(
        `DELETE FROM public.payment_webhook_events WHERE external_event_id = $1`,
        [externalId],
      )
      .catch(() => undefined);
    throw error;
  }
  return { received: true };
}

if (eventType === "charge.success") {
  try {
    await this.verifyPaystackTransaction(reference);
  } catch (error: any) {
    // Allow provider redelivery after a transient failure.
    await pool
      .query(
        `DELETE FROM public.payment_webhook_events WHERE provider = 'paystack' AND external_event_id = $1`,
        [externalId],
      )
      .catch(() => undefined);
    if (/record not found/i.test(String(error?.message))) {
      return { received: true, ignored: "unknown_reference" };
    }
    throw error;
  }
  private async verifyPayPalWebhookSignature(
  headers: Record<string, any>,
  rawBody: string,
): Promise<boolean> {
  const clientId = (
    process.env.PAYPAL_CLIENT_ID || ""
  ).trim();

  const clientSecret = (
    process.env.PAYPAL_CLIENT_SECRET || ""
  ).trim();

  const webhookId = (
    process.env.PAYPAL_WEBHOOK_ID || ""
  ).trim();

  if (!clientId || !clientSecret || !webhookId) {
    throw new Error(
      "PayPal webhook verification is not configured",
    );
  }

  const mode = (
    process.env.PAYPAL_MODE ||
    process.env.PAYPAL_ENVIRONMENT ||
    ""
  ).toLowerCase();

  if (mode !== "live" && mode !== "production" && mode !== "sandbox" && mode !== "test") {
    throw new Error(
      "PAYPAL_MODE must explicitly be live or sandbox",
    );
  }

  const baseUrl =
    mode === "live" || mode === "production"
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com";

  const basic = Buffer.from(
    `${clientId}:${clientSecret}`,
  ).toString("base64");

  const tokenResponse = await fetch(
    `${baseUrl}/v1/oauth2/token`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type":
          "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    },
  );

  if (!tokenResponse.ok) {
    throw new Error(
      "PayPal webhook verification OAuth failed",
    );
  }

  const tokenPayload = await tokenResponse.json();
  const accessToken = tokenPayload?.access_token;

  if (!accessToken) {
    throw new Error(
      "PayPal webhook verification access token missing",
    );
  }

  const response = await fetch(
    `${baseUrl}/v1/notifications/verify-webhook-signature`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        auth_algo:
          headers["paypal-auth-algo"] ??
          headers["PayPal-Auth-Algo"],
        cert_url:
          headers["paypal-cert-url"] ??
          headers["PayPal-Cert-Url"],
        transmission_id:
          headers["paypal-transmission-id"] ??
          headers["PayPal-Transmission-Id"],
        transmission_sig:
          headers["paypal-transmission-sig"] ??
          headers["PayPal-Transmission-Sig"],

  private async verifyPayPalWebhookSignature(
    headers: Record<string, any>,
    rawBody: string,
  ): Promise<boolean> {
    const clientId = (
      process.env.PAYPAL_CLIENT_ID || ""
    ).trim();

    const clientSecret = (
      process.env.PAYPAL_CLIENT_SECRET || ""
    ).trim();

    const webhookId = (
      process.env.PAYPAL_WEBHOOK_ID || ""
    ).trim();

    if (!clientId || !clientSecret || !webhookId) {
      throw new Error(
        "PayPal webhook verification is not configured",
      );
    }

    const mode = (
      process.env.PAYPAL_MODE ||
      process.env.PAYPAL_ENVIRONMENT ||
      ""
    ).toLowerCase();

    if (
      mode !== "live" &&
      mode !== "production" &&
      mode !== "sandbox" &&
      mode !== "test"
    ) {
      throw new Error(
        "PAYPAL_MODE must explicitly be live or sandbox",
      );
    }

    const baseUrl =
      mode === "live" || mode === "production"
        ? "https://api-m.paypal.com"
        : "https://api-m.sandbox.paypal.com";

    const basic = Buffer.from(
      `${clientId}:${clientSecret}`,
    ).toString("base64");

    const tokenResponse = await fetch(
      `${baseUrl}/v1/oauth2/token`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type":
            "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      },
    );

    if (!tokenResponse.ok) {
      throw new Error(
        "PayPal webhook verification OAuth failed",
      );
    }

    const tokenPayload = await tokenResponse.json();
    const accessToken = tokenPayload?.access_token;

    if (!accessToken) {
      throw new Error(
        "PayPal webhook verification access token missing",
      );
    }

    const response = await fetch(
      `${baseUrl}/v1/notifications/verify-webhook-signature`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          auth_algo:
            headers["paypal-auth-algo"] ??
            headers["PayPal-Auth-Algo"],
          cert_url:
            headers["paypal-cert-url"] ??
            headers["PayPal-Cert-Url"],
          transmission_id:
            headers["paypal-transmission-id"] ??
            headers["PayPal-Transmission-Id"],
          transmission_sig:
            headers["paypal-transmission-sig"] ??
            headers["PayPal-Transmission-Sig"],
          transmission_time:
            headers["paypal-transmission-time"] ??
            headers["PayPal-Transmission-Time"],
          webhook_id: webhookId,
          webhook_event: JSON.parse(rawBody),
        }),
      },
    );

    if (!response.ok) {
      throw new Error(
        `PayPal webhook verification failed [${response.status}]`,
      );
    }

    const result = await response.json();

    return result?.verification_status === "SUCCESS";
    const result = await response.json();

  return result?.verification_status === "SUCCESS";
  }
}

export const paymentService = new PaymentService();
