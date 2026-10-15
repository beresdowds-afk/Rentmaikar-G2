import { getRegionById, type Region } from './regions';
import {
  type PaymentBreakdown,
  calculatePaymentBreakdown,
  formatCurrency,
} from './payment-config';
import { marketingEngine } from '@/services/marketingEngine';
import { backendBridge } from './backend-bridge';

// PayPal types
export interface PayPalConfig {
  clientId: string;
  mode: 'sandbox' | 'live';
}

export interface PayPalOrder {
  id: string;
  status:
    | 'CREATED'
    | 'SAVED'
    | 'APPROVED'
    | 'VOIDED'
    | 'COMPLETED'
    | 'PAYER_ACTION_REQUIRED';
  links: {
    href: string;
    rel: string;
    method: string;
  }[];
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
 * Payment Gateway Manager.
 *
 * Uses the gateway configured for the selected region.
 * Sensitive payment and payout operations must be performed
 * by the authoritative backend or the provider client.
 */
export class PaymentGateway {
  private readonly region: Region;

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
   * Initialize a driver rental payment.
   */
  async initializePayment(
    baseAmount: number,
    driverId: string,
    vehicleId: string,
    rentalId: string,
    metadata?: Record<string, unknown>,
  ): Promise<PaymentResult> {
    if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
      return {
        success: false,
        error: 'Payment amount must be greater than zero.',
      };
    }

    if (!driverId?.trim() || !vehicleId?.trim() || !rentalId?.trim()) {
      return {
        success: false,
        error: 'Driver, vehicle, and rental IDs are required.',
      };
    }

    const breakdown = calculatePaymentBreakdown(
      baseAmount,
      this.currency,
    );

    // Marketing analytics must not block payment initialization.
    try {
      void marketingEngine.track('PAYMENT_STARTED', {
        gateway: this.gateway,
        currency: this.currency,
        baseAmount,
        driverTotal: breakdown.driverTotal,
        driverId,
        vehicleId,
        rentalId,
      });
    } catch (error) {
      console.error(
        '[Marketing] Failed to track payment started:',
        error,
      );
    }

    switch (this.gateway) {
      case 'paypal':
        return this.initializePayPalPayment(
          breakdown,
          driverId,
          vehicleId,
          rentalId,
          metadata,
        );

      case 'paystack':
        return this.initializePaystackPayment(
          breakdown,
          driverId,
          vehicleId,
          rentalId,
          metadata,
        );

      case 'opay':
        return this.initializeOPayPayment(
          breakdown,
          driverId,
          vehicleId,
          rentalId,
          metadata,
        );

      default:
        return {
          success: false,
          error: `Unsupported payment gateway '${this.gateway}' for region '${this.region.id}'.`,
        };
    }
  }

  /**
   * Initialize PayPal payment.
   */
  private async initializePayPalPayment(
    breakdown: PaymentBreakdown,
    driverId: string,
    vehicleId: string,
    rentalId: string,
    metadata?: Record<string, unknown>,
  ): Promise<PaymentResult> {
    try {
      if (this.currency !== 'USD') {
        return {
          success: false,
          error: 'PayPal payment requires USD currency.',
        };
      }

      const { createPayPalOrder } = await import('./paypal-client');

      const result = await createPayPalOrder({
        amount: breakdown.driverTotal,
        currency: 'USD',
        driverId,
        vehicleId,
        rentalId,
        paymentFrequency: breakdown.frequency,
        description:
          `Vehicle Rental - ${formatCurrency(
            breakdown.baseAmount,
            'USD',
          )} + ${formatCurrency(
            breakdown.adminFee,
            'USD',
          )} admin fee`,
        metadata,
      });

      if (!result.orderId) {
        throw new Error('PayPal did not return an order ID.');
      }

      return {
        success: true,
        transactionId: result.orderId,
        redirectUrl: result.approveUrl ?? undefined,
        gatewayResponse: result,
      };
    } catch (error) {
      console.error(
        '[PayPal] Payment initialization failed:',
        error,
      );

      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'PayPal payment initialization failed.',
      };
    }
  }

  /**
   * Initialize Paystack payment through the backend bridge.
   *
   * Request field names match create-paystack-transaction.
   */
  private async initializePaystackPayment(
    breakdown: PaymentBreakdown,
    driverId: string,
    vehicleId: string,
    rentalId: string,
    metadata?: Record<string, unknown>,
  ): Promise<PaymentResult> {
    try {
      if (this.currency !== 'NGN') {
        return {
          success: false,
          error: 'Paystack payment requires NGN currency.',
        };
      }

      const isValidUuid = (value: string): boolean =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          value,
        );

      const result = await backendBridge.invokeEdgeFunction(
        'create-paystack-transaction',
        {
          amount: breakdown.driverTotal,
          currency: 'NGN',
          rentalId: isValidUuid(rentalId)
            ? rentalId
            : undefined,
          vehicleId: isValidUuid(vehicleId)
            ? vehicleId
            : undefined,
          paymentFrequency: breakdown.frequency,
          description:
            `Rentmaikar payment — ${formatCurrency(
              breakdown.baseAmount,
              'NGN',
            )}`,
          metadata,
        },
        {
          method: 'POST',
          idempotencyKey:
            `charge.paystack:${driverId}:${vehicleId}:${rentalId}:${breakdown.driverTotal}`,
        },
      );

      if (result.error || !result.data) {
        throw (
          result.error ??
          new Error('Paystack payment initialization failed.')
        );
      }

      const data = result.data;

      if (!data.reference || !data.authorization_url) {
        throw new Error(
          'Paystack response is missing the transaction reference or authorization URL.',
        );
      }

      return {
        success: true,
        transactionId: data.reference,
        redirectUrl: data.authorization_url,
        gatewayResponse: data,
      };
    } catch (error) {
      console.error(
        '[Paystack] Payment initialization failed:',
        error,
      );

      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Paystack payment initialization failed.',
      };
    }
  }

  /**
   * Initialize OPay payment through the existing OPay client.
   */
  private async initializeOPayPayment(
    breakdown: PaymentBreakdown,
    driverId: string,
    vehicleId: string,
    rentalId: string,
    metadata?: Record<string, unknown>,
  ): Promise<PaymentResult> {
    try {
      if (this.currency !== 'NGN') {
        return {
          success: false,
          error: 'OPay payment requires NGN currency.',
        };
      }

      const { createOPayOrder } = await import('./opay-client');

      const result = await createOPayOrder({
        amount: breakdown.driverTotal,
        currency: 'NGN',
        driverId,
        vehicleId,
        rentalId,
        paymentFrequency: breakdown.frequency,
        productName: 'Rentmaikar Vehicle Rental',
        productDesc:
          `Rental payment — ${formatCurrency(
            breakdown.baseAmount,
            'NGN',
          )}`,
        metadata,
      });

      if (!result.reference) {
        throw new Error(
          'OPay did not return a transaction reference.',
        );
      }

      return {
        success: true,
        transactionId: result.reference,
        redirectUrl: result.cashierUrl ?? undefined,
        gatewayResponse: result,
      };
    } catch (error) {
      console.error(
        '[OPay] Payment initialization failed:',
        error,
      );

      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'OPay payment initialization failed.',
      };
    }
  }

  /**
   * Verify a transaction with the configured payment provider.
   */
  async verifyPayment(
    transactionId: string,
  ): Promise<PaymentResult> {
    if (!transactionId?.trim()) {
      return {
        success: false,
        error: 'Transaction ID is required.',
      };
    }

    let result: PaymentResult;

    switch (this.gateway) {
      case 'paypal':
        result = await this.verifyPayPalPayment(transactionId);
        break;

      case 'paystack':
        result = await this.verifyPaystackPayment(transactionId);
        break;

      case 'opay':
        result = await this.verifyOPayPayment(transactionId);
        break;

      default:
        return {
          success: false,
          error: `Unsupported payment gateway '${this.gateway}'.`,
        };
    }

    if (result.success) {
      try {
        void marketingEngine.track('PAYMENT_COMPLETED', {
          transactionId,
          gateway: this.gateway,
          currency: this.currency,
        });
      } catch (error) {
        console.error(
          '[Marketing] Failed to track payment completion:',
          error,
        );
      }
    }

    return result;
  }

  /**
   * Verify OPay transaction status.
   */
  private async verifyOPayPayment(
    reference: string,
  ): Promise<PaymentResult> {
    try {
      const { queryOPayStatus } = await import('./opay-client');
      const result = await queryOPayStatus({ reference });

      const success = result.status === 'SUCCESSFUL';

      return {
        success,
        transactionId: result.reference,
        gatewayResponse: result,
        error: success
          ? undefined
          : `OPay payment is not confirmed successful. Status: ${result.status}`,
      };
    } catch (error) {
      console.error(
        '[OPay] Payment verification failed:',
        error,
      );

      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'OPay payment verification failed.',
      };
    }
  }

  /**
   * Capture and verify a PayPal order.
   */
  private async verifyPayPalPayment(
    orderId: string,
  ): Promise<PaymentResult> {
    try {
      const { capturePayPalOrder } = await import('./paypal-client');
      const result = await capturePayPalOrder({ orderId });

      const success = result.status === 'COMPLETED';

      return {
        success,
        transactionId: result.orderId,
        gatewayResponse: result,
        error: success
          ? undefined
          : `PayPal payment is not confirmed completed. Status: ${result.status}`,
      };
    } catch (error) {
      console.error(
        '[PayPal] Payment verification failed:',
        error,
      );

      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'PayPal payment verification failed.',
      };
    }
  }

  /**
   * Verify Paystack payment through the backend bridge.
   */
  private async verifyPaystackPayment(
    reference: string,
  ): Promise<PaymentResult> {
    try {
      const result = await backendBridge.invokeEdgeFunction(
        'verify-paystack-transaction',
        { reference },
        {
          method: 'POST',
          idempotencyKey: `verify.paystack:${reference}`,
        },
      );

      if (result.error || !result.data) {
        throw (
          result.error ??
          new Error('Paystack payment verification failed.')
        );
      }

      const data = result.data;

      // The Edge Function returns the provider transaction status.
      const success = data.status === 'success';

      return {
        success,
        transactionId: data.reference ?? reference,
        gatewayResponse: data,
        error: success
          ? undefined
          : `Paystack payment is not confirmed successful. Status: ${data.status}`,
      };
    } catch (error) {
      console.error(
        '[Paystack] Payment verification failed:',
        error,
      );

      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Paystack payment verification failed.',
      };
    }
  }

  /**
   * Process an owner payout.
   *
   * The backend validates the authenticated owner, payout account,
   * available balance, verified phone, and withdrawal authorization.
   */
  async processOwnerPayout(
    ownerId: string,
    amount: number,
    payoutDetails: {
      accountNumber?: string;
      email?: string;
      payoutAccountId?: string;
      note?: string;
      authorizationId?: string;
    },
  ): Promise<PaymentResult> {
    if (!ownerId?.trim()) {
      return {
        success: false,
        error: 'Owner ID is required.',
      };
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return {
        success: false,
        error: 'Payout amount must be greater than zero.',
      };
    }

    switch (this.gateway) {
      case 'paypal':
        return this.processPayPalPayout(
          ownerId,
          amount,
          payoutDetails,
        );

      case 'paystack':
        return this.processPaystackTransfer(
          ownerId,
          amount,
          payoutDetails,
        );

      case 'opay':
        // Never route an OPay payout through Paystack.
        // A dedicated, verified OPay payout implementation is required.
        return {
          success: false,
          error:
            'OPay owner payouts are not implemented by this payment gateway.',
        };

      default:
        return {
          success: false,
          error: `Unsupported payout gateway '${this.gateway}'.`,
        };
    }
  }

  /**
   * Initiate a PayPal payout through the authoritative backend.
   */
  private async processPayPalPayout(
    _ownerId: string,
    amount: number,
    payoutDetails: {
      payoutAccountId?: string;
      note?: string;
      authorizationId?: string;
    },
  ): Promise<PaymentResult> {
    try {
      if (!payoutDetails.payoutAccountId) {
        return {
          success: false,
          error: 'Missing payoutAccountId.',
        };
      }

      if (!payoutDetails.authorizationId) {
        return {
          success: false,
          error:
            'Withdrawal authorization required before payout.',
        };
      }

      const result = await backendBridge.invokeEdgeFunction(
        'initiate-paypal-payout',
        {
          amount,
          payoutAccountId: payoutDetails.payoutAccountId,
          note: payoutDetails.note,
          authorizationId: payoutDetails.authorizationId,
        },
        {
          method: 'POST',
          idempotencyKey:
            `payout.paypal:${payoutDetails.payoutAccountId}:${amount}`,
        },
      );

      if (result.error || !result.data) {
        throw (
          result.error ??
          new Error('PayPal payout request failed.')
        );
      }

      const data = result.data;
      const payout = data.payout;

      if (!payout) {
        return {
          success: false,
          error:
            data.error ??
            'PayPal payout response did not contain a payout record.',
          gatewayResponse: data,
        };
      }

      const transactionId =
        payout.transfer_reference ??
        payout.transfer_code ??
        payout.reference ??
        payout.id;

      if (!transactionId) {
        return {
          success: false,
          error:
            'PayPal payout record is missing its transaction reference.',
          gatewayResponse: data,
        };
      }

      // A submitted payout is not necessarily a completed payout.
      const status = String(payout.status ?? '').toLowerCase();

      return {
        success: !['failed', 'cancelled', 'canceled'].includes(status),
        transactionId,
        gatewayResponse: data,
        error: ['failed', 'cancelled', 'canceled'].includes(status)
          ? `PayPal payout has status '${status}'.`
          : undefined,
      };
    } catch (error) {
      console.error('[PayPal] Payout failed:', error);

      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'PayPal payout failed.',
      };
    }
  }

  /**
   * Initiate a Paystack transfer through the authoritative backend.
   */
  private async processPaystackTransfer(
    _ownerId: string,
    amount: number,
    payoutDetails: {
      payoutAccountId?: string;
      note?: string;
      authorizationId?: string;
    },
  ): Promise<PaymentResult> {
    try {
      if (!payoutDetails.payoutAccountId) {
        return {
          success: false,
          error: 'Missing payoutAccountId.',
        };
      }

      if (!payoutDetails.authorizationId) {
        return {
          success: false,
          error:
            'Withdrawal authorization required before payout.',
        };
      }

      const result = await backendBridge.invokeEdgeFunction(
        'initiate-paystack-transfer',
        {
          amount,
          payoutAccountId: payoutDetails.payoutAccountId,
          reason: payoutDetails.note,
          authorizationId: payoutDetails.authorizationId,
        },
        {
          method: 'POST',
          idempotencyKey:
            `payout.paystack:${payoutDetails.payoutAccountId}:${amount}`,
        },
      );

      if (result.error || !result.data) {
        throw (
          result.error ??
          new Error('Paystack transfer request failed.')
        );
      }

      const data = result.data;
      const payout = data.payout;

      if (!payout) {
        return {
          success: false,
          error:
            data.error ??
            'Paystack transfer response did not contain a payout record.',
          gatewayResponse: data,
        };
      }

      const transactionId =
        payout.transfer_reference ??
        payout.transfer_code ??
        payout.reference ??
        payout.id;

      if (!transactionId) {
        return {
          success: false,
          error:
            'Paystack payout record is missing its transaction reference.',
          gatewayResponse: data,
        };
      }

      // The transfer may still be pending provider confirmation.
      const status = String(payout.status ?? '').toLowerCase();

      return {
        success: !['failed', 'cancelled', 'canceled'].includes(status),
        transactionId,
        gatewayResponse: data,
        error: ['failed', 'cancelled', 'canceled'].includes(status)
          ? `Paystack payout has status '${status}'.`
          : undefined,
      };
    } catch (error) {
      console.error('[Paystack] Transfer failed:', error);

      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Paystack transfer failed.',
      };
    }
  }

  /**
   * Process a refund through the authoritative backend.
   */
  async processRefund(
    originalTransactionId: string,
    amount: number,
    reason: string,
  ): Promise<PaymentResult> {
    if (!originalTransactionId?.trim()) {
      return {
        success: false,
        error: 'Original transaction ID is required.',
      };
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return {
        success: false,
        error: 'Refund amount must be greater than zero.',
      };
    }

    if (!reason?.trim()) {
      return {
        success: false,
        error: 'A refund reason is required.',
      };
    }

    try {
      const result = await backendBridge.invokeEdgeFunction(
        'process-refund',
        {
          provider: this.gateway,
          originalTransactionId,
          amount,
          reason,
        },
        {
          method: 'POST',
          idempotencyKey:
            `refund:${this.gateway}:${originalTransactionId}:${amount}`,
        },
      );

      if (result.error || !result.data) {
        return {
          success: false,
          error:
            result.error?.message ??
            'Refund execution failed.',
        };
      }

      const data = result.data;
      const success = data.success === true;

      return {
        success,
        transactionId:
          data.transactionId ?? data.refund_id,
        gatewayResponse: data,
        error: success
          ? undefined
          : data.error ??
            'Refund was not confirmed by the provider.',
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
            : 'Refund failed.',
      };
    }
  }
}

/**
 * Factory function to create a payment gateway for a region.
 */
export function createPaymentGateway(
  regionId: string,
): PaymentGateway {
  return new PaymentGateway(regionId);
}
