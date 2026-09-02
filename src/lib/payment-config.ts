// Payment Fee Structure Configuration
// Based on 40% platform fee model:
// - Drivers pay: base + 20% (admin fee)
// - Owners receive: base - 20% (management fee)
// - Platform earns: 40% total

export const PAYMENT_CONFIG = {
  // Fee percentages
  ADMIN_FEE_PERCENT: 20, // Driver pays base + 20%
  MANAGEMENT_FEE_PERCENT: 20, // Owner receives base - 20%
  PLATFORM_FEE_PERCENT: 40, // Total platform earnings
  DAILY_PAYMENT_FINE_PERCENT: 10, // 10% extra admin fee for daily payment option
  
  // Payment frequency settings
  MINIMUM_DOWN_PAYMENT_DAYS: 2, // Minimum 2 days down payment required
  
  // Payment schedule
  DAILY_DEBIT_TIME: '00:01', // 12:01 AM
  WEEKLY_PAYOUT_DAY: 5, // Friday (0 = Sunday)
  
  // Default sequence for WEEKLY payments (72 hours / 3 days)
  WEEKLY_DEFAULT: {
    GRACE_PERIOD_HOURS: 72,
    NOTIFICATION_HOURS: [24, 48, 72], // 3 notifications at 24-hour intervals
    LOCKDOWN_AFTER_HOURS: 72,
  },
  
  // Default sequence for DAILY payments (36 hours)
  DAILY_DEFAULT: {
    GRACE_PERIOD_HOURS: 36,
    NOTIFICATION_HOURS: [12, 24, 36], // 3 notifications at 12-hour intervals
    LOCKDOWN_AFTER_HOURS: 36,
  },
  
  // Currency settings
  CURRENCIES: {
    USD: { symbol: '$', decimals: 2, minAmount: 1 },
    NGN: { symbol: '₦', decimals: 2, minAmount: 100 },
  },
  
  // Payment methods
  PAYMENT_METHODS: {
    USA: ['paypal', 'bank_transfer'] as const,
    NIGERIA: ['paystack', 'bank_transfer'] as const,
  },
  
  // Bank details for manual transfers
  BANK_ACCOUNTS: {
    USA: {
      bankName: 'Chase Bank',
      accountName: 'RideShare Platform LLC',
      accountNumber: 'XXXX-XXXX-1234',
      routingNumber: '021000021',
      accountType: 'Business Checking',
    },
    NIGERIA: {
      bankName: 'GTBank',
      accountName: 'RideShare Nigeria Ltd',
      accountNumber: '0123456789',
      bankCode: '058',
    },
  },
} as const;

/**
 * Currency codes are open-ended: 'USD' and 'NGN' are the built-in launch
 * currencies, every other code comes from a Region Builder region.
 */
export type CurrencyCode = 'USD' | 'NGN' | (string & {});

export type PaymentMethod = 'paypal' | 'paystack' | 'bank_transfer';
export type PaymentFrequency = 'daily' | 'weekly';

export interface PaymentBreakdown {
  baseAmount: number;
  adminFee: number;
  driverTotal: number;
  managementFee: number;
  ownerPayout: number;
  platformEarnings: number;
  currency: CurrencyCode;
  // Extended breakdown for daily payments
  dailyRate?: number;
  dailyFine?: number;
  effectiveDailyRate?: number;
  frequency?: PaymentFrequency;
  downPaymentAmount?: number;
  downPaymentDays?: number;
}

export interface PaymentTransaction {
  id: string;
  type: 'rental_payment' | 'owner_payout' | 'refund';
  amount: number;
  currency: CurrencyCode;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';
  gateway: 'paypal' | 'paystack';
  gatewayTransactionId?: string;
  driverId?: string;
  ownerId?: string;
  vehicleId?: string;
  rentalId?: string;
  breakdown?: PaymentBreakdown;
  createdAt: Date;
  processedAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface PaymentDefault {
  id: string;
  driverId: string;
  vehicleId: string;
  rentalId: string;
  amountDue: number;
  currency: CurrencyCode;
  paymentFrequency: PaymentFrequency;
  hoursOverdue: number;
  notificationsSent: number;
  lastNotificationAt?: Date;
  deactivationEligible: boolean;
  status: 'active' | 'resolved' | 'deactivated';
  createdAt: Date;
}

/**
 * Calculate payment breakdown based on base rental amount
 */
export function calculatePaymentBreakdown(
  baseAmount: number,
  currency: CurrencyCode,
  frequency: PaymentFrequency = 'weekly',
  downPaymentDays: number = PAYMENT_CONFIG.MINIMUM_DOWN_PAYMENT_DAYS
): PaymentBreakdown {
  const adminFee = baseAmount * (PAYMENT_CONFIG.ADMIN_FEE_PERCENT / 100);
  const managementFee = baseAmount * (PAYMENT_CONFIG.MANAGEMENT_FEE_PERCENT / 100);
  
  // Calculate daily rates
  const dailyRate = baseAmount / 7;
  const dailyFine = frequency === 'daily' 
    ? dailyRate * (PAYMENT_CONFIG.DAILY_PAYMENT_FINE_PERCENT / 100)
    : 0;
  const effectiveDailyRate = dailyRate + dailyFine;
  
  // Calculate totals based on frequency
  const weeklyWithFine = effectiveDailyRate * 7;
  const driverBase = frequency === 'daily' ? weeklyWithFine : baseAmount;
  const driverAdminFee = driverBase * (PAYMENT_CONFIG.ADMIN_FEE_PERCENT / 100);
  
  // Down payment calculation
  const downPaymentBase = effectiveDailyRate * downPaymentDays;
  const downPaymentAmount = downPaymentBase * (1 + PAYMENT_CONFIG.ADMIN_FEE_PERCENT / 100);
  
  return {
    baseAmount,
    adminFee,
    driverTotal: driverBase + driverAdminFee,
    managementFee,
    ownerPayout: baseAmount - managementFee,
    platformEarnings: driverAdminFee + managementFee,
    currency,
    dailyRate,
    dailyFine,
    effectiveDailyRate,
    frequency,
    downPaymentAmount: frequency === 'daily' ? downPaymentAmount : undefined,
    downPaymentDays: frequency === 'daily' ? downPaymentDays : undefined,
  };
}

/**
 * Calculate payment breakdown for a specific number of days
 */
export function calculateDailyPaymentBreakdown(
  weeklyBaseAmount: number,
  currency: CurrencyCode,
  days: number
): { dailyRate: number; fine: number; total: number; withAdminFee: number } {
  const dailyRate = weeklyBaseAmount / 7;
  const fine = dailyRate * (PAYMENT_CONFIG.DAILY_PAYMENT_FINE_PERCENT / 100);
  const effectiveRate = dailyRate + fine;
  const total = effectiveRate * days;
  const withAdminFee = total * (1 + PAYMENT_CONFIG.ADMIN_FEE_PERCENT / 100);
  
  return { dailyRate, fine: fine * days, total, withAdminFee };
}

/**
 * Format currency amount for display
 */
export function formatCurrency(amount: number, currency: CurrencyCode): string {
  const config = (PAYMENT_CONFIG.CURRENCIES as Record<string, { symbol: string; decimals: number } | undefined>)[
    currency
  ];
  if (config) {
    return `${config.symbol}${amount.toLocaleString(undefined, {
      minimumFractionDigits: config.decimals,
      maximumFractionDigits: config.decimals,
    })}`;
  }
  // Region Builder currency without a hard-coded config — use Intl.
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: String(currency) }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

/**
 * Check if it's time for daily auto-debit (12:01 AM)
 */
export function isDailyDebitTime(): boolean {
  const now = new Date();
  const [hours, minutes] = PAYMENT_CONFIG.DAILY_DEBIT_TIME.split(':').map(Number);
  return now.getHours() === hours && now.getMinutes() === minutes;
}

/**
 * Check if today is weekly payout day (Friday)
 */
export function isWeeklyPayoutDay(): boolean {
  return new Date().getDay() === PAYMENT_CONFIG.WEEKLY_PAYOUT_DAY;
}

/**
 * Get default config based on payment frequency
 */
export function getDefaultConfig(frequency: PaymentFrequency) {
  return frequency === 'daily' 
    ? PAYMENT_CONFIG.DAILY_DEFAULT 
    : PAYMENT_CONFIG.WEEKLY_DEFAULT;
}

/**
 * Check if deactivation is allowed based on payment default status
 */
export function isDeactivationAllowed(paymentDefault: PaymentDefault): boolean {
  const config = getDefaultConfig(paymentDefault.paymentFrequency);
  return (
    paymentDefault.hoursOverdue >= config.LOCKDOWN_AFTER_HOURS &&
    paymentDefault.notificationsSent >= config.NOTIFICATION_HOURS.length
  );
}

/**
 * Get next notification hour for payment default
 */
export function getNextNotificationHour(
  notificationsSent: number,
  frequency: PaymentFrequency
): number | null {
  const config = getDefaultConfig(frequency);
  if (notificationsSent >= config.NOTIFICATION_HOURS.length) {
    return null;
  }
  return config.NOTIFICATION_HOURS[notificationsSent];
}

/**
 * Get hours until lockdown for a payment default
 */
export function getHoursUntilLockdown(paymentDefault: PaymentDefault): number {
  const config = getDefaultConfig(paymentDefault.paymentFrequency);
  return Math.max(0, config.LOCKDOWN_AFTER_HOURS - paymentDefault.hoursOverdue);
}
