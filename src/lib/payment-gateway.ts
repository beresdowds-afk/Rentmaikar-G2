import { getRegionById, type Region } from './regions';
import {
  type PaymentBreakdown,
  type PaymentTransaction,
  calculatePaymentBreakdown,
  formatCurrency
} from './payment-config';
import { supabase } from '@/integrations/supabase/client';
import { idempotencyHeaders } from './idempotency';
import { marketingEngine } from '@/services/marketingEngine';
import { backendBridge } from './backend-bridge';
// PayPal types
export interface PayPalConfig {
  clientId: string;
  mode: 'sandbox' | 'live';
}

export interface PayPalOrder {
  id: string;
  status: 'CREATED' | 'SAVED' | 'APPROVED' | 'VOIDED' | 'COMPLETED' | 'PAYER_ACTION_REQUIRED';
  links: { href: string; rel: string; method: string }[];
}

// Paystack types
export interface PaystackConfig {
  publicKey: string;
  mode: 'test' | 'live';
}

export interface PaystackTransaction {
  reference: string;
  access_code: string;
  authorization_url: string;
}

export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  gatewayResponse?: unknown;
  error?: string;
  redirectUrl?: string;
}

/**
 * Payment Gateway Manager
 * Handles PayPal (USA) and Paystack (Nigeria) integrations
 */
export class PaymentGateway {
  private region: Region;

  constructor(regionId: string) {
    const region = getRegionById(regionId);
    if (!region) {
      throw new Error(`Invalid region: ${regionId}`);
    }
    this.region = region;
  }

  get gateway(): 'paypal' | 'paystack' | 'opay' {
    return this.region.paymentGateway;
  }

  get currency(): 'USD' | 'NGN' | (string & {}) {
    return this.region.currency;
  }

  /**
   * Initialize a payment for driver rental
   */
  async initializePayment(
    baseAmount: number,
    driverId: string,
    vehicleId: string,
    rentalId: string,
    metadata?: Record<string, unknown>
  ): Promise<PaymentResult> {
    const breakdown = calculatePaymentBreakdown(baseAmount, this.currency);

    // Marketing Engine: Observe payment started event
    void marketingEngine.track('PAYMENT_STARTED', {
      gateway: this.gateway,
      currency: this.currency,
      baseAmount,
      driverTotal: breakdown.driverTotal,
      driverId,
      vehicleId,
      rentalId,
    });
    
    if (this.gateway === "paypal") {
  return this.initializePayPalPayment(
    breakdown,
    driverId,
    vehicleId,
    rentalId,
    metadata
  );
}

if (this.gateway === "opay") {
  return this.initializeOPayPayment(
    breakdown,
    driverId,
    vehicleId,
    rentalId,
    metadata
  );
}

if (this.gateway === "paystack") {
  return this.initializePaystackPayment(
    breakdown,
    driverId,
    vehicleId,
    rentalId,
    metadata
  );

return {
  success: false,
  error: `Unsupported payment gateway '${this.gateway}' for region '${this.region.id}'`,
};
  }

  /**
   * Initialize PayPal payment (USA)
   */
  private async initializePayPalPayment(
    breakdown: PaymentBreakdown,
    driverId: string,
    vehicleId: string,
    rentalId: string,
    metadata?: Record<string, unknown>
  ): Promise<PaymentResult> {
    try {
      const { createPayPalOrder } = await import('./paypal-client');
      const result = await createPayPalOrder({
        amount: breakdown.driverTotal,
        currency: 'USD',
        driverId,
        vehicleId,
        rentalId,
        paymentFrequency: breakdown.frequency,
        description: `Vehicle Rental - ${formatCurrency(breakdown.baseAmount, 'USD')} + ${formatCurrency(breakdown.adminFee, 'USD')} admin fee`,
        metadata,
      });

      return {
        success: true,
        transactionId: result.orderId,
        redirectUrl: result.approveUrl ?? null,
        gatewayResponse: result,
      };
    } catch (error) {
      console.error('[PayPal] Payment initialization failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'PayPal payment initialization failed',
      };
    }
  }

  /**
   * Initialize Paystack payment (Nigeria) via edge function.
   */
  private async initializePaystackPayment(
    breakdown: PaymentBreakdown,
    driverId: string,
    vehicleId: string,
    rentalId: string,
    metadata?: Record<string, unknown>
  ): Promise<PaymentResult> {
    try {
      const result =
  await backendBridge.invokeEdgeFunction(
    'create-paystack-transaction',
    {
      amount: breakdown.driverTotal,
      currency: 'NGN',
      rental_id:
        rentalId &&
        /^[0-9a-f-]{36}$/i.test(rentalId)
          ? rentalId
          : undefined,
      vehicle_id:
        vehicleId &&
        /^[0-9a-f-]{36}$/i.test(vehicleId)
          ? vehicleId
          : undefined,
      payment_frequency:
        breakdown.frequency,
      description:
        `Rentmaikar payment — ${formatCurrency(
          breakdown.baseAmount,
          'NGN'
        )}`,
      driver_id: driverId,
      metadata,
    },
    {
      method: 'POST',
      idempotencyKey:
        `charge.paystack:${driverId}:${vehicleId}:${rentalId}:${breakdown.driverTotal}`,
    },
  );

if (result.error || !result.data) {
  throw result.error ||
    new Error(
      'Paystack payment initialization failed',
    );
}

const data = result.data; {
        body: {
          amount: breakdown.driverTotal,
          currency: 'NGN',
          rentalId: rentalId && /^[0-9a-f-]{36}$/i.test(rentalId) ? rentalId : undefined,
          vehicleId: vehicleId && /^[0-9a-f-]{36}$/i.test(vehicleId) ? vehicleId : undefined,
          paymentFrequency: breakdown.frequency,
          description: `Rentmaikar payment — ${formatCurrency(breakdown.baseAmount, 'NGN')}`,
          metadata,
        },
        headers: idempotencyHeaders('charge.paystack', {
          amount: breakdown.driverTotal, driverId, vehicleId, rentalId,
        }),
      });
      if (error) throw error;
      return {
        success: true,
        transactionId: data?.reference,
        redirectUrl: data?.authorization_url ?? null,
        gatewayResponse: data,
      };
    } catch (error) {
      console.error('[Paystack] Payment initialization failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Paystack payment initialization failed',
      };
    }
  }

  /**
   * Initialize OPay payment (Nigeria) via Cashier API.
   */
  private async initializeOPayPayment(
    breakdown: PaymentBreakdown,
    driverId: string,
    vehicleId: string,
    rentalId: string,
    metadata?: Record<string, unknown>
  ): Promise<PaymentResult> {
    try {
      const { createOPayOrder } = await import('./opay-client');
      const result = await createOPayOrder({
        amount: breakdown.driverTotal,
        currency: 'NGN',
        driverId,
        vehicleId,
        rentalId,
        paymentFrequency: breakdown.frequency,
        productName: `Rentmaikar Vehicle Rental`,
        productDesc: `Rental payment — ${formatCurrency(breakdown.baseAmount, 'NGN')}`,
        metadata,
      });

      return {
        success: true,
        transactionId: result.reference,
        redirectUrl: result.cashierUrl ?? null,
        gatewayResponse: result,
      };
    } catch (error) {
      console.error('[OPay] Payment initialization failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'OPay payment initialization failed',
      };
    }
  }

  /**
   * Verify payment completion
   */
  async verifyPayment(transactionId: string): Promise<PaymentResult> {
    let res: PaymentResult;
    if (this.gateway === 'paypal') {
      res = await this.verifyPayPalPayment(transactionId);
    } else if (this.gateway === 'opay') {
      res = await this.verifyOPayPayment(transactionId);
    } else {
      res = await this.verifyPaystackPayment(transactionId);
    }

    if (res.success) {
      void marketingEngine.track('PAYMENT_COMPLETED', {
        transactionId,
        gateway: this.gateway,
        currency: this.currency,
      });
    }

    return res;
  }

  /**
   * Verify OPay transaction status via Cashier Status API
   */
  private async verifyOPayPayment(reference: string): Promise<PaymentResult> {
    try {
      const { queryOPayStatus } = await import('./opay-client');
      const result = await queryOPayStatus({ reference });

      return {
        success: result.status === 'SUCCESSFUL',
        transactionId: result.reference,
        gatewayResponse: result,
      };
    } catch (error) {
      console.error('[OPay] Payment verification failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'OPay payment verification failed',
      };
    }
  }

  /**
   * Verify / capture PayPal payment
   */
  private async verifyPayPalPayment(orderId: string): Promise<PaymentResult> {
    try {
      const { capturePayPalOrder } = await import('./paypal-client');
      const result = await capturePayPalOrder({ orderId });

      return {
        success: result.status === 'COMPLETED',
        transactionId: result.orderId,
        gatewayResponse: result,
      };
    } catch (error) {
      console.error('[PayPal] Payment verification failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'PayPal payment verification failed',
      };
    }
  }

  /**
   * Verify Paystack payment via edge function.
   */
  private async verifyPaystackPayment(reference: string): Promise<PaymentResult> {
    try {
      const result =
  await backendBridge.invokeEdgeFunction(
    "verify-paystack-transaction",
    {
      reference,
    },
    {
      method: "POST",
      idempotencyKey:
        `verify.paystack:${reference}`,
    }
  );

if (result.error || !result.data) {
  throw (
    result.error ||
    new Error(
      "Paystack payment verification failed"
    )
  );
}

const data = result.data;

return {
  success: data?.status === "completed",
  transactionId: reference,
  gatewayResponse: data,
};
      if (error) throw error;
      return {
        success: data?.status === 'completed',
        transactionId: reference,
        gatewayResponse: data,
      };
    } catch (error) {
      console.error('[Paystack] Payment verification failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Paystack payment verification failed',
      };
    }
  }

  /**
   * Process owner payout (weekly on Fridays). Requires an existing
   * owner_payout_accounts row; `payoutAccountId` is the row ID.
   */
  async processOwnerPayout(
    ownerId: string,
    amount: number,
    payoutDetails: { accountNumber?: string; email?: string; payoutAccountId?: string; note?: string; authorizationId?: string }
  ): Promise<PaymentResult> {
    if (this.gateway === 'paypal') {
      return this.processPayPalPayout(ownerId, amount, payoutDetails);
    } else {
      return this.processPaystackTransfer(ownerId, amount, payoutDetails);
    }
  }

  /**
   * Process PayPal payout to owner via edge function.
   */
  private async processPayPalPayout(
    _ownerId: string,
    amount: number,
    payoutDetails: { payoutAccountId?: string; note?: string; authorizationId?: string }
  ): Promise<PaymentResult> {
    try {
      if (!payoutDetails.payoutAccountId) {
        return { success: false, error: 'Missing payoutAccountId' };
      }
      if (!payoutDetails.authorizationId) {
        return { success: false, error: 'Withdrawal authorization required before payout' };
      }
      const result =
  await backendBridge.invokeEdgeFunction(
    'initiate-paypal-payout',
    {
      amount,
      payout_account_id:
        payoutDetails.payoutAccountId,
      note: payoutDetails.note,
      authorization_id:
        payoutDetails.authorizationId,
    },
    {
      method: 'POST',
      idempotencyKey:
        `payout.paypal:${payoutDetails.payoutAccountId}:${amount}`,
    },
  );

if (result.error || !result.data) {
  throw result.error ||
    new Error(
      'PayPal payout failed',
    );
}

return {
  success: true,
  transactionId:
    result.data?.payout?.transfer_reference ||
    result.data?.payout?.transfer_code,
  gatewayResponse:
    result.data,
}; 
      {
        body: {
          amount,
          payoutAccountId: payoutDetails.payoutAccountId,
          note: payoutDetails.note,
          authorizationId: payoutDetails.authorizationId,
        },
        headers: idempotencyHeaders('payout.paypal', { amount, payoutAccountId: payoutDetails.payoutAccountId }),
      });
      if (error) throw error;
      return { success: true, transactionId: data?.reference ?? data?.payout_batch_id, gatewayResponse: data };
    } catch (error) {
      console.error('[PayPal] Payout failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'PayPal payout failed' };
    }
  }

  /**
   * Process Paystack transfer to owner via edge function.
   */
  private async processPaystackTransfer(
    _ownerId: string,
    amount: number,
    payoutDetails: { payoutAccountId?: string; note?: string; authorizationId?: string }
  ): Promise<PaymentResult> {
    try {
      if (!payoutDetails.payoutAccountId) {
        return { success: false, error: 'Missing payoutAccountId' };
      }
      if (!payoutDetails.authorizationId) {
        return { success: false, error: 'Withdrawal authorization required before payout' };
      }
      const result =
  await backendBridge.invokeEdgeFunction(
    'initiate-paystack-transfer',
    {
      amount,
      payout_account_id:
        payoutDetails.payoutAccountId,
      note: payoutDetails.note,
      authorization_id:
        payoutDetails.authorizationId,
    },
    {
      method: 'POST',
      idempotencyKey:
        `payout.paystack:${payoutDetails.payoutAccountId}:${amount}`,
    },
  );

if (result.error || !result.data) {
  throw result.error ||
    new Error(
      'Paystack transfer failed',
    );
}

return {
  success: true,
  transactionId:
    result.data?.payout?.transfer_reference ||
    result.data?.payout?.transfer_code,
  gatewayResponse:
    result.data,
};

  /**
   * Process refund
   */
  async processRefund(
    originalTransactionId: string,
    amount: number,
    reason: string
  ): Promise<PaymentResult> {
    try {
      console.log(`[${this.gateway}] Processing refund:`, {
        originalTransactionId,
        amount,
        reason,
      });

      async processRefund(
  originalTransactionId: string,
  amount: number,
  reason: string
): Promise<PaymentResult> {
  try {
    if (!originalTransactionId) {
      return {
        success: false,
        error: "Original transaction ID is required",
      };
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return {
        success: false,
        error: "Refund amount must be greater than zero",
      };
    }

    /*
     * Refund execution belongs to the authoritative backend/provider
     * implementation. The browser must never fabricate a refund success.
     */
    const { backendBridge } =
      await import("./backend-bridge");
await fetch("https://api.paystack.co/refund", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    transaction: originalTransactionId,
    amount: Math.round(amount * 100),
    currency,
    merchant_note: reason,
  }),
});
    const result =
      await backendBridge.invokeEdgeFunction(
        "process-refund",
        {
          provider: this.gateway,
          originalTransactionId,
          amount,
          reason,
        },
        {
          method: "POST",
          idempotencyKey:
            `refund:${this.gateway}:${originalTransactionId}:${amount}`,
        },
      );

    if (result.error || !result.data) {
      return {
        success: false,
        error:
          result.error?.message ||
          "Refund execution failed",
      };
    }

    return {
      success:
        result.data?.success === true,
      transactionId:
        result.data?.transactionId ||
        result.data?.refund_id,
      gatewayResponse:
        result.data,
      error:
        result.data?.success === true
          ? undefined
          : result.data?.error ||
            "Refund was not confirmed by provider",
    };
  } catch (error) {
    console.error(
      `[${this.gateway}] Refund failed:`,
      error,
    );

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Refund failed",
    };
  }
}
    } catch (error) {
      console.error(`[${this.gateway}] Refund failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Refund failed',
      };
    }
  }
}

/**
 * Factory function to create payment gateway for a region
 */
export function createPaymentGateway(regionId: string): PaymentGateway {
  return new PaymentGateway(regionId);
}
