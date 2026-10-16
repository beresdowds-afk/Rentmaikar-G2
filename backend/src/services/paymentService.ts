/**
 * Authoritative RentMaikar Payment, Ledger, and Settlement Service
 * 
 * Provides unified, production-grade payment execution for:
 * - USA: PayPal REST API (Order Creation, Capture, Webhook, Settlement)
 * - Nigeria: Paystack & OPay (Initialization, Verification, Webhook, Settlement)
 * - Platform Wallet Ledger & Owner Earnings Settlement
 * - Owner Payouts & Transfers
 */

import { getDbPool } from "./dbPool";
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

function normalizePaymentPurpose(value?: string | null): PaymentPurpose {
  const purpose = (value || "rental").trim();

  if ((PAYMENT_PURPOSES as readonly string[]).includes(purpose)) {
    return purpose as PaymentPurpose;
  }

  throw new Error(
    `Invalid payment purpose "${purpose}". Allowed purposes: ${PAYMENT_PURPOSES.join(", ")}`
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

class PaymentService {
  private paypalTokenCache: { token: string; expiresAt: number } | null = null;
  private resolvedPayPalBase: string | null = null;

  // ---------------------------------------------------------------------------
  // PayPal REST Helpers & Authentication
  // ---------------------------------------------------------------------------

  private getPayPalConfig() {
    const clientId = (process.env.PAYPAL_CLIENT_ID || process.env.VITE_PAYPAL_CLIENT_ID || "").trim();
    const clientSecret = (process.env.PAYPAL_CLIENT_SECRET || "").trim();
    const mode = (process.env.PAYPAL_MODE || process.env.PAYPAL_ENVIRONMENT || "sandbox").toLowerCase();
    const isLive = mode === "live" || mode === "production";
    const defaultBase = isLive ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

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
      throw new Error("PayPal API credentials are not configured (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET).");
    }

    if (this.paypalTokenCache && this.paypalTokenCache.expiresAt > Date.now() + 60000) {
      return this.paypalTokenCache.token;
    }

    const auth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");

    // Attempt request against current configured baseUrl
    let res = await fetch(`${config.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    // If live endpoint returned 401 invalid_client, fallback to sandbox
    if (!res.ok && res.status === 401 && config.baseUrl.includes("api-m.paypal.com")) {
      console.warn("[PayPal Service] Live endpoint returned 401 with provided credentials, falling back to Sandbox...");
      const sandboxBase = "https://api-m.sandbox.paypal.com";
      const sandboxRes = await fetch(`${sandboxBase}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      });

      if (sandboxRes.ok) {
        this.resolvedPayPalBase = sandboxBase;
        res = sandboxRes;
      }
    }

    if (!res.ok) {
      const errText = await res.text();
      console.error("[PayPal Service] Failed to retrieve OAuth token:", res.status, errText);
      throw new Error(`PayPal OAuth failure [${res.status}]: ${errText}`);
    }

    const data = await res.json();
    const expiresIn = Number(data.expires_in) || 32400; // default 9h
    this.paypalTokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + expiresIn * 1000,
    };

    return data.access_token;
  }

  // ---------------------------------------------------------------------------
  // PayPal Order Creation
  // ---------------------------------------------------------------------------

  async createPayPalOrder(params: CreateOrderParams) {
    const amountVal = Number(params.amount);
    const purpose = normalizePaymentPurpose(params.purpose);

    if (!amountVal || amountVal <= 0) {
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

  async capturePayPalOrder(params: CaptureOrderParams) {
    const { order_id, user_id } = params;
    if (!order_id) {
      throw new Error("Missing required order_id for capture");
    }

    const pool = getDbPool();

    // 1. Check existing transaction in DB
    const txRes = await pool.query(
      `SELECT * FROM public.paypal_transactions WHERE order_id = $1`,
      [order_id]
    );
    const existingTx = txRes.rows[0];

    if (existingTx && (existingTx.status === "completed" || existingTx.status === "captured")) {
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

    const captureData = await res.json();

    if (!res.ok && res.status !== 422) {
      console.error("[PayPal Service] Capture error:", res.status, captureData);
      throw new Error(captureData.message || `PayPal capture failed [${res.status}]`);
    }

    const captureUnit = captureData.purchase_units?.[0]?.payments?.captures?.[0];
    const captureId = captureUnit?.id || (existingTx?.capture_id ?? `cap_${order_id}`);
    const payerEmail = captureData.payer?.email_address || null;
    const payerId = captureData.payer?.payer_id || null;

    // 3. Update paypal_transactions
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

    const paymentId = existingTx?.payment_id;

    // 4. Update payments record
    if (paymentId) {
      await pool.query(
        `UPDATE public.payments
         SET status = 'completed',
             processed_at = now(),
             transaction_id = $1,
             updated_at = now()
         WHERE id = $2`,
        [captureId, paymentId]
      );
    }

    // 5. Settle financials into wallet ledger & owner earnings
    const driverId = existingTx?.driver_id || user_id;
    const ownerId = existingTx?.owner_id;
    const rentalId = existingTx?.rental_id;
    const vehicleId = existingTx?.vehicle_id;
    const amount = Number(existingTx?.amount || captureUnit?.amount?.value || 0);

    if (amount > 0) {
      await this.settlePaymentFinancials({
        paymentId,
        provider: "paypal",
        providerReference: captureId,
        driverId,
        ownerId,
        rentalId,
        vehicleId,
        amount,
        currency: "USD",
      });
    }

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

return {
  authorization_url: payload.data.authorization_url,
  access_code: payload.data.access_code,
  reference,
  payment_id: paymentId,
};
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

  await pool.query(
    `UPDATE public.paystack_transactions
     SET status = 'success',
         gateway_response = $1,
         updated_at = now()
     WHERE reference = $2`,
    [
      gatewayResponse,
      reference,
    ]
  );

  const txRes = await pool.query(
    `SELECT *
     FROM public.paystack_transactions
     WHERE reference = $1`,
    [reference]
  );

  const tx = txRes.rows[0];

  if (!tx) {
    throw new Error(
      `Paystack transaction record not found for reference ${reference}`
    );
  }

  if (tx.payment_id) {
    await pool.query(
      `UPDATE public.payments
       SET status = 'completed',
           processed_at = now(),
           updated_at = now()
       WHERE id = $1`,
      [tx.payment_id]
    );
  }

  if (
    tx.payment_id &&
    Number(tx.amount) > 0
  ) {
    await this.settlePaymentFinancials({
      paymentId: tx.payment_id,
      provider: "paystack",
      providerReference: reference,
      driverId: tx.driver_id,
      rentalId: tx.rental_id,
      vehicleId: tx.vehicle_id,
      amount: Number(tx.amount),
      currency: tx.currency || "NGN",
    });
  }

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

    const result = await pool.query(
      `SELECT public.settle_payment_financials($1, $2, $3) AS result`,
      [
        opts.paymentId,
        opts.provider,
        opts.providerReference,
      ]
    );

    const settlement = result.rows[0]?.result;

    if (!settlement?.ok) {
      throw new Error(
        settlement?.reason || "Authoritative payment settlement failed"
      );
    }

    return settlement;
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
  const amount = Number(opts.amount);
  const currency = String(opts.currency || "USD").toUpperCase();

  if (!opts.owner_id) {
    throw new Error("owner_id is required");
  }

  if (!Number.isFinite(amount) || amount < 1) {
    throw new Error("PayPal payout amount must be at least 1.00");
  }

  if (Math.round(amount * 100) !== amount * 100) {
    throw new Error(
      "PayPal payout amount must have at most 2 decimals",
    );
  }

  if (currency !== "USD") {
    throw new Error(
      "PayPal owner payouts currently support USD only",
    );
  }

  if (!opts.payout_account_id) {
    throw new Error("PayPal payout account is required");
  }

  if (!opts.authorization_id) {
    throw new Error(
      "withdrawal authorization required",
    );
  }

  const pool = getDbPool();

  /*
   * 1. Verify the payout destination belongs to the owner.
   */
  const accountResult = await pool.query(
    `SELECT
       id,
       owner_id,
       provider,
       currency,
       paypal_email,
       is_default
     FROM public.owner_payout_accounts
     WHERE id = $1
       AND owner_id = $2
     LIMIT 1`,
    [
      opts.payout_account_id,
      opts.owner_id,
    ],
  );

  const account = accountResult.rows[0];

  if (
    !account ||
    account.provider !== "paypal" ||
    !account.paypal_email
  ) {
    throw new Error(
      "Invalid PayPal payout account",
    );
  }

  /*
   * 2. Verify the withdrawal authorization.
   */
  const authorizationResult = await pool.query(
    `SELECT *
     FROM public.withdrawal_authorizations
     WHERE id = $1
     LIMIT 1`,
    [opts.authorization_id],
  );

  const authorization =
    authorizationResult.rows[0];

  if (!authorization) {
    throw new Error(
      "withdrawal authorization not found",
    );
  }

  if (
    authorization.subject_user_id !==
    opts.owner_id
  ) {
    throw new Error(
      "withdrawal authorization belongs to another user",
    );
  }

  if (
    authorization.request_type !==
    "owner_payout"
  ) {
    throw new Error(
      "withdrawal authorization type mismatch",
    );
  }

  if (
    Math.abs(
      Number(authorization.amount) - amount,
    ) > 0.009
  ) {
    throw new Error(
      "withdrawal authorization amount mismatch",
    );
  }

  if (
    String(authorization.currency).toUpperCase() !==
    currency
  ) {
    throw new Error(
      "withdrawal authorization currency mismatch",
    );
  }

  if (authorization.status !== "approved") {
    throw new Error(
      `withdrawal authorization is ${authorization.status}`,
    );
  }

  if (
    new Date(
      authorization.expires_at,
    ).getTime() < Date.now()
  ) {
    throw new Error(
      "withdrawal authorization expired",
    );
  }

  /*
   * 3. Prevent concurrent owner payouts.
   */
  const activePayoutResult = await pool.query(
    `SELECT id
     FROM public.owner_payouts
     WHERE owner_id = $1
       AND status IN (
         'pending',
         'authorized',
         'captured',
         'processing'
       )
     LIMIT 1`,
    [opts.owner_id],
  );

  if (activePayoutResult.rows.length > 0) {
    throw new Error(
      "A payout is already in progress",
    );
  }

  /*
   * 4. Verify available owner balance.
   */
  const balanceResult = await pool.query(
    `SELECT public.get_owner_available_balance(
       $1,
       $2
     ) AS balance`,
    [
      opts.owner_id,
      currency,
    ],
  );

  const available = Number(
    balanceResult.rows[0]?.balance || 0,
  );

  if (amount > available) {
    throw new Error(
      `Amount exceeds available balance (${available.toFixed(2)} available)`,
    );
  }

  /*
   * 5. Idempotency.
   *
   * Do not create a second payout if the same request
   * is retried.
   */
  if (opts.idempotency_key) {
    const existing = await pool.query(
      `SELECT *
       FROM public.owner_payouts
       WHERE owner_id = $1
         AND transfer_reference = $2
       LIMIT 1`,
      [
        opts.owner_id,
        opts.idempotency_key,
      ],
    );

    if (existing.rows[0]) {
      return {
        success: true,
        duplicate: true,
        payout: existing.rows[0],
      };
    }
  }

  const reference =
    `pyt_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 10)}`;

  /*
   * 6. Create canonical payout record.
   */
  const payoutResult = await pool.query(
    `INSERT INTO public.owner_payouts (
       owner_id,
       payout_account_id,
       provider,
       amount,
       currency,
       status,
       transfer_reference,
       initiated_by,
       scheduled_for
     )
     VALUES (
       $1, $2, 'paypal', $3, 'USD',
       'pending', $4, 'owner', now()
     )
     RETURNING *`,
    [
      opts.owner_id,
      opts.payout_account_id,
      amount,
      reference,
    ],
  );

  const payout =
    payoutResult.rows[0];

  if (!payout?.id) {
    throw new Error(
      "Could not create PayPal payout record",
    );
  }

  /*
   * 7. Move payout into authorized state.
   */
  await pool.query(
    `SELECT public.transition_payment_state(
       'payout',
       $1,
       'authorized',
       'withdrawal authorization approved',
       $2::jsonb
     )`,
    [
      payout.id,
      JSON.stringify({
        authorization_id:
          opts.authorization_id,
      }),
    ],
  );

  /*
   * 8. Execute actual PayPal Payouts API call.
   */
  const paypalResult =
    await this.executePayPalPayout({
      amount,
      receiver: account.paypal_email,
      reference,
      note:
        opts.note ||
        "Your Rentmaikar owner earnings",
    });
  
  /*
   * 9. RESERVE OWNER WALLET BEFORE PAYPAL.
   *
   * This is the authoritative financial reservation.
   *
   * A posted debit is used intentionally: available balance is ledger-derived
   * and therefore the reservation must immediately reduce available funds.
   */
  const reservation = await pool.query(
    `SELECT public.post_wallet_entry(
       $1,
       'owner',
       $2,
       'debit',
       $3,
       'payout',
       $4,
       'owner_payouts',
       $5,
       'paypal',
       $6,
       $7
     ) AS result`,
    [
      opts.owner_id,
      currency,
      amount,
      `payout:${payout.id}:reserved`,
      payout.id,
      reference,
      "Owner payout reserved before PayPal disbursement",
    ],
  );

  const reservationResult = reservation.rows[0]?.result;

  if (!reservationResult?.ok) {
    await pool.query(
      `SELECT public.transition_payment_state(
         'payout',
         $1,
         'failed',
         'Wallet reservation failed',
         $2::jsonb
       )`,
      [
        payout.id,
        JSON.stringify({
          error: reservationResult?.error || "ledger reservation failed",
        }),
      ],
    );

    throw new Error(
      reservationResult?.error || "Wallet reservation failed",
    );
  }

  /*
   * 10. Consume the withdrawal authorization only after the reservation
   * succeeds. This prevents an authorization from being consumed when
   * the wallet could not actually reserve the money.
   */
  await pool.query(
    `UPDATE public.withdrawal_authorizations
     SET status = 'consumed',
         consumed_at = now(),
         consumed_reference = $1,
         updated_at = now()
     WHERE id = $2
       AND status = 'approved'`,
    [payout.id, opts.authorization_id],
  );

  /*
   * 11. Execute PayPal.
   *
   * IMPORTANT:
   * PENDING / PROCESSING is NOT success.
   */
  let paypalResult: any;

  try {
    paypalResult = await this.executePayPalPayout({
      amount,
      receiver: account.paypal_email,
      reference,
      note: opts.note || "Your RentMaikar owner earnings",
    });
  } catch (err: any) {
    /*
     * We only reverse the reservation for an explicit provider rejection.
     *
     * A transport/network ambiguity must NOT automatically reverse the
     * reservation because PayPal may already have accepted the payout.
     */
  const pool = getDbPool();

  const amount = Number(opts.amount);
  const currency = String(opts.currency || "USD").toUpperCase();
  const ownerId = opts.owner_id?.trim();
  const accountId = opts.payout_account_id?.trim();
  const authorizationId = opts.authorization_id?.trim();
  const note = opts.note?.trim() || "Your RentMaikar owner earnings";

  if (!ownerId) {
    throw new Error("owner_id is required");
  }

  if (!Number.isFinite(amount) || amount < 1) {
    throw new Error("PayPal payout amount must be at least 1.00");
  }

  if (Math.round(amount * 100) !== amount * 100) {
    throw new Error(
      "PayPal payout amount must have at most 2 decimal places",
    );
  }

  if (currency !== "USD") {
    throw new Error("PayPal owner payouts currently support USD only");
  }

  if (!accountId) {
    throw new Error("PayPal payout account is required");
  }

  if (!authorizationId) {
    throw new Error("Withdrawal authorization is required");
  }

  /*
   * Use one stable reference for the database record and provider request.
   * An idempotency key must be reused for retries of the same request.
   */
  const suppliedKey = opts.idempotency_key?.trim();

  if (
    suppliedKey &&
    (
      suppliedKey.length > 50 ||
      !/^[A-Za-z0-9._-]+$/.test(suppliedKey)
    )
  ) {
    throw new Error(
      "Invalid idempotency key: use 1–50 letters, numbers, dots, underscores, or hyphens",
    );
  }

  const reference =
    suppliedKey ||
    `pyt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  /*
   * 1. Idempotency check.
   * Perform this before the active-payout check so a legitimate retry
   * returns its existing payout instead of creating another one.
   */
  if (suppliedKey) {
    const existingResult = await pool.query(
      `SELECT *
       FROM public.owner_payouts
       WHERE owner_id = $1
         AND transfer_reference = $2
       LIMIT 1`,
      [ownerId, reference],
    );

    const existing = existingResult.rows[0];

    if (existing) {
      if (
        Number(existing.amount) !== amount ||
        String(existing.currency).toUpperCase() !== currency ||
        String(existing.provider).toLowerCase() !== "paypal" ||
        String(existing.payout_account_id) !== accountId
      ) {
        throw new Error(
          "Idempotency key already belongs to a different payout request",
        );
      }

      return {
        success: true,
        duplicate: true,
        payout: existing,
      };
    }
  }

  /*
   * 2. Verify the payout account belongs to this owner.
   */
  const accountResult = await pool.query(
    `SELECT
       id,
       owner_id,
       provider,
       currency,
       paypal_email,
       is_default
     FROM public.owner_payout_accounts
     WHERE id = $1
       AND owner_id = $2
     LIMIT 1`,
    [accountId, ownerId],
  );

  const account = accountResult.rows[0];

  if (
    !account ||
    String(account.provider).toLowerCase() !== "paypal" ||
    !account.paypal_email ||
    String(account.currency).toUpperCase() !== currency
  ) {
    throw new Error("Invalid PayPal payout account or currency");
  }

  /*
   * 3. Verify the approved withdrawal authorization.
   */
  const authorizationResult = await pool.query(
    `SELECT *
     FROM public.withdrawal_authorizations
     WHERE id = $1
     LIMIT 1`,
    [authorizationId],
  );

  const authorization = authorizationResult.rows[0];

  if (!authorization) {
    throw new Error("Withdrawal authorization not found");
  }

  if (String(authorization.subject_user_id) !== ownerId) {
    throw new Error(
      "Withdrawal authorization belongs to another user",
    );
  }

  if (authorization.request_type !== "owner_payout") {
    throw new Error("Withdrawal authorization type mismatch");
  }

  if (Math.abs(Number(authorization.amount) - amount) > 0.001) {
    throw new Error("Withdrawal authorization amount mismatch");
  }

  if (
    String(authorization.currency).toUpperCase() !== currency
  ) {
    throw new Error("Withdrawal authorization currency mismatch");
  }

  if (authorization.status !== "approved") {
    throw new Error(
      `Withdrawal authorization is ${authorization.status}`,
    );
  }

  if (
    !authorization.expires_at ||
    !Number.isFinite(new Date(authorization.expires_at).getTime()) ||
    new Date(authorization.expires_at).getTime() <= Date.now()
  ) {
    throw new Error("Withdrawal authorization expired or invalid");
  }

  /*
   * 4. Refuse to initiate another payout while one is active.
   * A database-level lock/constraint is still required to make this
   * check safe against concurrent requests.
   */
  const activePayoutResult = await pool.query(
    `SELECT id
     FROM public.owner_payouts
     WHERE owner_id = $1
       AND status IN (
         'pending',
         'authorized',
         'captured',
         'processing'
       )
     LIMIT 1`,
    [ownerId],
  );

  if (activePayoutResult.rows.length > 0) {
    throw new Error("A payout is already in progress");
  }

  /*
   * 5. Check the authoritative available balance.
   */
  const balanceResult = await pool.query(
    `SELECT public.get_owner_available_balance($1, $2) AS balance`,
    [ownerId, currency],
  );

  const available = Number(balanceResult.rows[0]?.balance);

  if (!Number.isFinite(available) || available < amount) {
    throw new Error(
      `Insufficient available balance (${Number.isFinite(available) ? available.toFixed(2) : "unavailable"})`,
    );
  }

  /*
   * 6. Create the canonical payout record.
   */
  const payoutResult = await pool.query(
    `INSERT INTO public.owner_payouts (
       owner_id,
       payout_account_id,
       provider,
       amount,
       currency,
       status,
       transfer_reference,
       initiated_by,
       scheduled_for
     )
     VALUES (
       $1, $2, 'paypal', $3, $4,
       'pending', $5, 'owner', now()
     )
     RETURNING *`,
    [ownerId, accountId, amount, currency, reference],
  );

  const payout = payoutResult.rows[0];

  if (!payout?.id) {
    throw new Error("Could not create PayPal payout record");
  }

  /*
   * Helper: transition the payout and preserve the diagnostic details.
   */
  const transitionPayout = async (
    status: string,
    reason: string,
    metadata: Record<string, unknown> = {},
  ) => {
    await pool.query(
      `SELECT public.transition_payment_state(
         'payout',
         $1,
         $2,
         $3,
         $4::jsonb
       )`,
      [
        payout.id,
        status,
        reason,
        JSON.stringify(metadata),
      ],
    );
  };

  /*
   * Helper: reverse the reservation exactly once.
   * The ledger function/database must enforce idempotency on this reference.
   */
  const reverseReservation = async (reason: string) => {
    const reversalResult = await pool.query(
      `SELECT public.post_wallet_entry(
         $1,
         'owner',
         $2,
         'credit',
         $3,
         'payout_reversal',
         $4,
         'owner_payouts',
         $5,
         'paypal',
         $6,
         $7
       ) AS result`,
      [
        ownerId,
        currency,
        amount,
        `payout:${payout.id}:reversal`,
        payout.id,
        reference,
        reason,
      ],
    );

    const result = reversalResult.rows[0]?.result;

    if (result && result.ok === false) {
      throw new Error(
        result.error || "Wallet reservation reversal failed",
      );
    }
  };

  /*
   * 7. Move to authorized state.
   */
  await transitionPayout(
    "authorized",
    "Withdrawal authorization approved",
    { authorization_id: authorizationId },
  );

  /*
   * 8. Reserve the owner's funds BEFORE calling PayPal.
   */
  const reservationResult = await pool.query(
    `SELECT public.post_wallet_entry(
       $1,
       'owner',
       $2,
       'debit',
       $3,
       'payout',
       $4,
       'owner_payouts',
       $5,
       'paypal',
       $6,
       $7
     ) AS result`,
    [
      ownerId,
      currency,
      amount,
      `payout:${payout.id}:reserved`,
      payout.id,
      reference,
      "Owner payout reserved before PayPal disbursement",
    ],
  );

  const reservation = reservationResult.rows[0]?.result;

  if (!reservation?.ok) {
    const reason = reservation?.error || "Wallet reservation failed";

    await transitionPayout("failed", reason, {
      error: reason,
    });

    await pool.query(
      `UPDATE public.owner_payouts
       SET failure_reason = $1,
           updated_at = now()
       WHERE id = $2`,
      [reason, payout.id],
    );

    throw new Error(reason);
  }

  /*
   * 9. Consume the authorization only if it remains approved.
   * If another request consumed it, reverse this reservation and stop.
   */
  const consumeResult = await pool.query(
    `UPDATE public.withdrawal_authorizations
     SET status = 'consumed',
         consumed_at = now(),
         consumed_reference = $1,
         updated_at = now()
     WHERE id = $2
       AND subject_user_id = $3
       AND status = 'approved'
       AND expires_at > now()`,
    [reference, authorizationId, ownerId],
  );

  if (consumeResult.rowCount !== 1) {
    await reverseReservation(
      "Authorization could not be consumed; payout reservation reversed",
    );

    await transitionPayout(
      "failed",
      "Withdrawal authorization is no longer valid",
      { authorization_id: authorizationId },
    );

    throw new Error(
      "Withdrawal authorization is no longer approved or has expired",
    );
  }

  /*
   * 10. Submit exactly one payout request.
   * Do not automatically reverse funds on an ambiguous network error:
   * PayPal may have accepted the request even if the response was lost.
   */
  let paypalResult: {
    batchId: string;
    batchStatus: string;
    raw: unknown;
  };

  try {
    paypalResult = await this.executePayPalPayout({
      amount,
      receiver: account.paypal_email,
      reference,
      note,
    });
  } catch (err: unknown) {
    const error = err as Error & {
      status?: number;
      body?: unknown;
    };

    const message =
      error instanceof Error
        ? error.message
        : "PayPal payout request failed";

    const status = Number(error?.status || 0);

    // Treat common transient/conflict responses as ambiguous.
    const definitiveRejection =
      status >= 400 &&
      status < 500 &&
      status !== 408 &&
      status !== 409 &&
      status !== 429;

    if (definitiveRejection) {
      await reverseReservation(
        "PayPal definitively rejected the payout; reservation reversed",
      );

      await transitionPayout("failed", message, {
        provider_status: status,
      });
    } else {
      // Keep the funds reserved until the provider result is reconciled.
      await transitionPayout(
        "processing",
        "PayPal result requires reconciliation",
        {
          provider_status: status || null,
          ambiguous_provider_result: true,
        },
      );
    }

    await pool.query(
      `UPDATE public.owner_payouts
       SET failure_reason = $1,
           raw_payload = $2::jsonb,
           updated_at = now()
       WHERE id = $3`,
      [
        message,
        JSON.stringify(
          error?.body ?? {
            error: message,
            provider_status: status || null,
            ambiguous_provider_result: !definitiveRejection,
          },
        ),
        payout.id,
      ],
    );

    throw error;
  }

  /*
   * 11. Persist the provider response.
   */
  await pool.query(
    `UPDATE public.owner_payouts
     SET transfer_code = $1,
         raw_payload = $2::jsonb,
         failure_reason = NULL,
         updated_at = now()
     WHERE id = $3`,
    [
      paypalResult.batchId,
      JSON.stringify(paypalResult.raw ?? {}),
      payout.id,
    ],
  );

  const batchStatus = String(
    paypalResult.batchStatus || "PENDING",
  ).toUpperCase();

  /*
   * 12. A definitive DENIED/CANCELED result permits reversal.
   * A submitted payout is not completed merely because the HTTP request
   * succeeded. Final completion requires verified provider confirmation.
   */
  if (batchStatus === "DENIED" || batchStatus === "CANCELED") {
    await reverseReservation(
      `PayPal payout ${batchStatus}; wallet reservation reversed`,
    );

    await transitionPayout(
      "failed",
      `PayPal payout ${batchStatus}`,
      {
        provider_status: batchStatus,
        payout_batch_id: paypalResult.batchId,
      },
    );

    await pool.query(
      `UPDATE public.owner_payouts
       SET failure_reason = $1,
           updated_at = now()
       WHERE id = $2`,
      [`PayPal payout ${batchStatus}`, payout.id],
    );
  } else {
    await transitionPayout(
      "processing",
      "PayPal payout submitted; awaiting verified provider confirmation",
      {
        provider_status: batchStatus,
        payout_batch_id: paypalResult.batchId,
      },
    );
  }

  const finalResult = await pool.query(
    `SELECT *
     FROM public.owner_payouts
     WHERE id = $1
     LIMIT 1`,
    [payout.id],
  );

  return {
    success: true,
    payout: finalResult.rows[0],
  };
}

  /*
   *13. *NEVER complete a payout merely because the POST succeeded.
   *
   * PayPal documents PENDING and PROCESSING as non-terminal.
   * Only the verified PayPal webhook may settle and complete it.
   */
  
  const batchStatus = String(
    paypalResult.batchStatus || "UNKNOWN",
  ).toUpperCase();

  /*
   * The initial API response confirms submission, not final receipt
   * of funds by the owner.
   *
   * Final success or failure must be established by verified,
   * idempotent provider reconciliation.
   */
  await pool.query(
    `UPDATE public.owner_payouts
     SET transfer_code = $1,
         raw_payload = $2::jsonb,
         updated_at = now()
     WHERE id = $3`,
    [
      paypalResult.batchId || null,
      JSON.stringify({
        provider: "paypal",
        provider_batch_status: batchStatus,
        provider_response: paypalResult.raw || {},
        awaiting_reconciliation: true,
      }),
      payout.id,
    ],
  );

  /*
   * Do not infer the outcome of individual payout items from the
   * batch status alone. The reconciliation workflow must retrieve
   * the relevant item/batch details and verify the outcome.
   */
  if (
    batchStatus === "PENDING" ||
    batchStatus === "PROCESSING" ||
    batchStatus === "SUCCESS" ||
    batchStatus === "DENIED" ||
    batchStatus === "CANCELED"
  ) {
    /*
     * Keep the payout non-terminal until the authoritative
     * reconciliation workflow confirms its final outcome.
     *
     * Confirm that "processing" is a permitted transition in
     * public.transition_payment_state for your database state machine.
     */
    await pool.query(
      `SELECT public.transition_payment_state(
         'payout',
         $1,
         'processing',
         'PayPal response received; awaiting verified reconciliation',
         $2::jsonb
       )`,
      [
        payout.id,
        JSON.stringify({
          provider_status: batchStatus,
          payout_batch_id: paypalResult.batchId || null,
          reconciliation_required: true,
        }),
      ],
    );
  } else {
    /*
     * Unknown statuses must not be interpreted as success.
     * Keep the existing payout record for investigation.
     */
    await pool.query(
      `UPDATE public.owner_payouts
       SET failure_reason = $1,
           updated_at = now()
       WHERE id = $2`,
      [
        `Unrecognized PayPal payout batch status: ${batchStatus}`,
        payout.id,
      ],
    );
  }

  const finalResult = await pool.query(
    `SELECT *
     FROM public.owner_payouts
     WHERE id = $1
     LIMIT 1`,
    [payout.id],
  );

  return {
    success: true,
    submitted: true,
    payout: finalResult.rows[0],
    provider_status: batchStatus,
    awaiting_reconciliation: true,
  };
  
  private async executePayPalPayout(opts: {
  amount: number;
  receiver: string;
  reference: string;
  note: string;
}) {
  const clientId =
    (process.env.PAYPAL_CLIENT_ID || "").trim();

  const clientSecret =
    (process.env.PAYPAL_CLIENT_SECRET || "").trim();

  const mode = (
    process.env.PAYPAL_MODE ||
    process.env.PAYPAL_ENVIRONMENT ||
    "sandbox"
  ).toLowerCase();

  if (!clientId || !clientSecret) {
    throw new Error(
      "PayPal payout credentials are not configured",
    );
  }

  const baseUrl =
    mode === "live" || mode === "production"
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com";

  const basic =
    Buffer.from(
      `${clientId}:${clientSecret}`,
    ).toString("base64");

  const tokenResponse =
    await fetch(
      `${baseUrl}/v1/oauth2/token`,
      {
        method: "POST",
        headers: {
          Authorization:
            `Basic ${basic}`,
          "Content-Type":
            "application/x-www-form-urlencoded",
        },
        body:
          "grant_type=client_credentials",
      },
    );

  if (!tokenResponse.ok) {
    const errorText =
      await tokenResponse.text();

    throw new Error(
      `PayPal authentication failed: ${errorText}`,
    );
  }

  const tokenPayload =
    await tokenResponse.json();

  const accessToken =
    tokenPayload.access_token;

  if (!accessToken) {
    throw new Error(
      "PayPal access token missing",
    );
  }

  const response =
    await fetch(
      `${baseUrl}/v1/payments/payouts`,
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
          "Content-Type":
            "application/json",
          Accept:
            "application/json",
          "PayPal-Request-Id":
            `payout:${opts.reference}`,
        },
        body: JSON.stringify({
          sender_batch_header: {
            sender_batch_id:
              opts.reference,
            email_subject:
              "RentMaikar payout",
            email_message:
              opts.note,
          },
          items: [
            {
              recipient_type:
                "EMAIL",
              amount: {

private async executePayPalPayout(opts: {
  amount: number;
  receiver: string;
  reference: string;
  note: string;
}): Promise<{
  batchId: string;
  batchStatus: string;
  raw: unknown;
}> {
  const clientId = (process.env.PAYPAL_CLIENT_ID || "").trim();
  const clientSecret = (process.env.PAYPAL_CLIENT_SECRET || "").trim();

  const mode = (
    process.env.PAYPAL_MODE ||
    process.env.PAYPAL_ENVIRONMENT ||
    ""
  ).trim().toLowerCase();

  if (!clientId || !clientSecret) {
    throw new Error("PayPal payout credentials are not configured");
  }

  if (mode !== "live" && mode !== "production" && mode !== "sandbox") {
    throw new Error(
      "PAYPAL_MODE must explicitly be set to 'live' or 'sandbox'",
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
    throw new Error(
      "PayPal payout amount must be positive and have at most two decimal places",
    );
  }

  if (!opts.receiver?.trim()) {
    throw new Error("PayPal payout receiver is required");
  }

  if (
    !opts.reference ||
    opts.reference.length > 50 ||
    !/^[A-Za-z0-9._-]+$/.test(opts.reference)
  ) {
    throw new Error(
      "PayPal payout reference is invalid",
    );
  }

  const basic = Buffer.from(
    `${clientId}:${clientSecret}`,
  ).toString("base64");

  const tokenResponse = await fetch(
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

  const tokenText = await tokenResponse.text();

  let tokenPayload: any = null;

  if (tokenText) {
    try {
      tokenPayload = JSON.parse(tokenText);
    } catch {
      tokenPayload = { message: tokenText };
    }
  }

  if (!tokenResponse.ok) {
    const error = new Error(
      tokenPayload?.error_description ||
        tokenPayload?.message ||
        `PayPal authentication failed with HTTP ${tokenResponse.status}`,
    ) as Error & {
      status?: number;
      body?: unknown;
    };

    error.status = tokenResponse.status;
    error.body = tokenPayload;

    throw error;
  }

  const accessToken = tokenPayload?.access_token;

  if (
    typeof accessToken !== "string" ||
    !accessToken
  ) {
    throw new Error("PayPal access token missing");
  }

  const response = await fetch(
    `${baseUrl}/v1/payments/payouts`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "PayPal-Request-Id": `payout:${opts.reference}`,
      },
      body: JSON.stringify({
        sender_batch_header: {
          sender_batch_id: opts.reference,
          email_subject: "RentMaikar payout",
          email_message:
            opts.note || "Your RentMaikar owner earnings",
        },
        items: [
          {
            recipient_type: "EMAIL",
            amount: {
              value: opts.amount.toFixed(2),
              currency: "USD",
            },
            receiver: opts.receiver.trim(),
            note:
              opts.note || "Your RentMaikar owner earnings",
            sender_item_id: opts.reference,
          },
        ],
      }),
    },
  );

  const responseText = await response.text();

  let payload: any = null;

  if (responseText) {
    try {
      payload = JSON.parse(responseText);
    } catch {
      payload = { message: responseText };
    }
  }

  if (!response.ok) {
    const error = new Error(
      payload?.message ||
        payload?.name ||
        `PayPal payout request failed with HTTP ${response.status}`,
    ) as Error & {
      status?: number;
      body?: unknown;
    };

    error.status = response.status;
    error.body = payload;

    throw error;
  }

  const batchId = payload?.batch_header?.payout_batch_id;

  if (typeof batchId !== "string" || !batchId) {
    /*
     * The request may have been accepted even if the response is incomplete.
     * The caller must reconcile this reference before attempting another payout.
     */
    const error = new Error(
      "PayPal returned no payout batch ID; reconcile the payout before retrying",
    ) as Error & {
      status?: number;
      body?: unknown;
    };

    error.status = response.status;
    error.body = payload;

    throw error;
  }

  return {
    batchId,
    batchStatus: String(
      payload?.batch_header?.batch_status || "PENDING",
    ).toUpperCase(),
    raw: payload,
  };
}

  
async processOwnerPayout(opts: {
  owner_id: string;
  amount: number;
  currency?: string;
  provider?: string;
  payout_account_id?: string;
  initiated_by?: string;
}) {
  const pool = getDbPool();
  const ownerId = opts.owner_id?.trim();
  const currency = (opts.currency || "USD").toUpperCase();
  const amount = Number(opts.amount);
  const provider = (opts.provider || "paypal").toLowerCase();

  if (!ownerId) {
    throw new Error("owner_id is required");
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Payout amount must be a positive finite number");
  }

  if (Math.round(amount * 100) !== amount * 100) {
    throw new Error("Payout amount must have at most two decimal places");
  }

  /*
   * This method only creates and reserves a payout request.
   * It does NOT execute a provider transfer.
   *
   * Route actual disbursements through the authoritative provider-specific
   * payout workflow instead of treating this request as a completed transfer.
   */
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const walletResult = await client.query(
      `SELECT id, available_balance
       FROM public.wallet_accounts
       WHERE user_id = $1
         AND currency = $2
         AND account_type = 'owner'
       FOR UPDATE`,
      [ownerId, currency],
    );

    const wallet = walletResult.rows[0];

    if (!wallet) {
      throw new Error(
        `Owner wallet not found for currency ${currency}`,
      );
    }

    const balance = Number(wallet.available_balance);

    if (!Number.isFinite(balance) || balance < amount) {
      throw new Error(
        `Insufficient available balance (${Number.isFinite(balance) ? balance.toFixed(2) : "unavailable"} available; ${amount.toFixed(2)} requested)`,
      );
    }

    const transferReference =
      `payout_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    const initiatedBy = [
      "owner",
      "cron",
      "admin",
    ].includes(opts.initiated_by || "")
      ? opts.initiated_by!
      : "owner";

    const payoutResult = await client.query(
      `INSERT INTO public.owner_payouts (
         owner_id,
         payout_account_id,
         provider,
         amount,
         currency,
         status,
         transfer_reference,
         initiated_by,
         scheduled_for
       )
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, now())
       RETURNING id`,
      [
        ownerId,
        opts.payout_account_id || null,
        provider,
        amount,
        currency,
        transferReference,
        initiatedBy,
      ],
    );

    const payoutId = payoutResult.rows[0]?.id;

    if (!payoutId) {
      throw new Error("Failed to create payout record");
    }

    const ledgerResult = await client.query(
      `SELECT public.post_wallet_entry(
         $1,
         'owner',
         $2,
         'debit',
         $3,
         'payout',
         $4,
         'owner_payouts',
         $5,
         $6,
         $7,
         $8
       ) AS result`,
      [
        ownerId,
        currency,
        amount,
        `payout_debit_${transferReference}`,
        payoutId,
        provider,
        transferReference,
        `Withdrawal request via ${provider}`,
      ],
    );

    const ledger = ledgerResult.rows[0]?.result;

    if (ledger?.ok === false) {
      throw new Error(
        ledger.error || "Wallet debit failed",
      );
    }

    if (ledger == null) {
      throw new Error(
        "Wallet ledger did not return a result; payout was not committed",
      );
    }

    await client.query("COMMIT");

    return {
      success: true,
      payout_id: payoutId,
      transfer_reference: transferReference,
      status: "pending",
      amount,
      currency,
      provider,
      requires_provider_execution: true,
    };
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

await pool.query(
  `INSERT INTO public.payment_webhook_events (
    provider,
    event_type,
    external_event_id,
    reference,
    status,
    signature_valid,
    payload
  ) VALUES ($1, $2, $3, $4, 'received', true, $5)`,
  [
    "paypal",
    eventType,
    eventId,
    orderId || null,
    JSON.stringify(event),
  ],
);

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
const raw =
typeof rawBody === "string"
? rawBody
: JSON.stringify(rawBody);

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

const event =
  typeof rawBody === "string"
    ? JSON.parse(rawBody)
    : rawBody;

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

const existingRes = await pool.query(
  `SELECT id
   FROM public.payment_webhook_events
   WHERE external_event_id = $1`,
  [externalId],
);

if (existingRes.rows.length > 0) {
  return { received: true, duplicate: true };
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
  ) VALUES ($1, $2, $3, $4, 'received', true, $5)`,
  [
    "paystack",
    eventType,
    externalId,
    reference,
    JSON.stringify(event),
  ],
);

if (eventType === "charge.success") {
  await this.verifyPaystackTransaction(reference);
}

return { received: true };

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
}
