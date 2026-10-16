/**
 * Server-side authority for checkout creation.
 *
 * Identity, counterparties, region and currency are derived from the verified
 * session and database rows. Browser-supplied driver/owner/vehicle/provider/
 * country/currency values are never trusted; mismatches are rejected.
 *
 * Provider policy (region-specific choices, NOT a fallback chain):
 *   - USA:     paypal (primary); paystack is the approved secondary
 *   - Nigeria: opay (primary); paystack is the approved secondary
 *   - other:   paystack
 * The secondary entries mirror src/lib/psp-support.ts (existing approved
 * exceptions). An unresolved region is rejected; it never defaults.
 */
import type { Pool } from "pg";

export type PaymentProvider = "paypal" | "paystack" | "opay";
export type PolicyRegion = "USA" | "NIGERIA" | "OTHER";

export class PaymentAuthorityError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "PaymentAuthorityError";
  }
}

export interface CheckoutCaller {
  userId: string;
  isAdmin?: boolean;
}

export function normalizeRegion(raw: unknown): PolicyRegion | null {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return null;
  if (v === "usa" || v === "us" || v === "united states" || v === "united states of america") return "USA";
  if (v === "nigeria" || v === "ng") return "NIGERIA";
  // Any other explicit region value is "OTHER" (Paystack per regional policy).
  return "OTHER";
}

export function allowedProviders(region: PolicyRegion): PaymentProvider[] {
  switch (region) {
    case "USA":
      return ["paypal", "paystack"];
    case "NIGERIA":
      return ["opay", "paystack"];
    default:
      return ["paystack"];
  }
}

export function regionCurrency(region: PolicyRegion): string | null {
  if (region === "USA") return "USD";
  if (region === "NIGERIA") return "NGN";
  return null;
}

export function assertProviderAllowed(region: PolicyRegion, provider: PaymentProvider) {
  if (!allowedProviders(region).includes(provider)) {
    throw new PaymentAuthorityError(
      422,
      `Payment provider '${provider}' is not available for this region`
    );
  }
}

export interface CheckoutAuthority {
  driverId: string;
  ownerId: string | null;
  vehicleId: string | null;
  rentalId: string | null;
  region: PolicyRegion;
  currency: string;
}

export async function resolveCheckoutAuthority(
  pool: Pick<Pool, "query">,
  params: {
    caller: CheckoutCaller;
    provider: PaymentProvider;
    body: {
      driver_id?: string | null;
      owner_id?: string | null;
      vehicle_id?: string | null;
      rental_id?: string | null;
      currency?: string | null;
    };
  }
): Promise<CheckoutAuthority> {
  const { caller, provider, body } = params;
  if (!caller?.userId) throw new PaymentAuthorityError(401, "Authentication required");

  const driverId = caller.isAdmin && body.driver_id ? String(body.driver_id) : caller.userId;
  if (body.driver_id && !caller.isAdmin && body.driver_id !== caller.userId) {
    throw new PaymentAuthorityError(403, "Forbidden");
  }

  let ownerId: string | null = null;
  let vehicleId: string | null = null;
  let rentalId: string | null = null;
  let rawRegion: unknown = null;
  let rentalCurrency: string | null = null;

  if (body.rental_id) {
    const r = await pool.query(
      `SELECT id, driver_id, owner_id, vehicle_id, region, currency
         FROM public.rentals WHERE id = $1 LIMIT 1`,
      [body.rental_id]
    );
    const rental = r.rows[0];
    if (!rental) throw new PaymentAuthorityError(404, "Rental not found");
    if (rental.driver_id !== driverId) throw new PaymentAuthorityError(403, "Forbidden");
    if (body.owner_id && body.owner_id !== rental.owner_id) {
      throw new PaymentAuthorityError(403, "Forbidden");
    }
    if (body.vehicle_id && body.vehicle_id !== rental.vehicle_id) {
      throw new PaymentAuthorityError(403, "Forbidden");
    }
    rentalId = rental.id;
    ownerId = rental.owner_id;
    vehicleId = rental.vehicle_id;
    rawRegion = rental.region;
    rentalCurrency = rental.currency ?? null;
  } else {
    if (!caller.isAdmin && (body.owner_id || body.vehicle_id)) {
      // Counterparties may only be asserted through a verified rental.
      throw new PaymentAuthorityError(403, "Forbidden");
    }
    ownerId = body.owner_id ?? null;
    vehicleId = body.vehicle_id ?? null;
    const p = await pool.query(
      `SELECT preferred_country FROM public.profiles WHERE user_id = $1 LIMIT 1`,
      [driverId]
    );
    rawRegion = p.rows[0]?.preferred_country ?? null;
  }

  const region = normalizeRegion(rawRegion);
  if (!region) {
    throw new PaymentAuthorityError(422, "Payment region could not be resolved");
  }
  assertProviderAllowed(region, provider);

  const expectedCurrency = rentalCurrency ? rentalCurrency.toUpperCase() : regionCurrency(region);
  const requested = body.currency ? String(body.currency).toUpperCase() : null;
  if (!expectedCurrency && !requested) {
    throw new PaymentAuthorityError(422, "Currency could not be resolved");
  }
  if (expectedCurrency && requested && requested !== expectedCurrency) {
    throw new PaymentAuthorityError(422, "Currency does not match the authoritative regional policy");
  }

  return {
    driverId,
    ownerId,
    vehicleId,
    rentalId,
    region,
    currency: (expectedCurrency || requested) as string,
  };
}

/**
 * Compare a provider-reported amount/currency with the stored expectation.
 * `providerAmount` must already be in major units. Tolerance: half a minor unit.
 */
export function providerAmountMatches(
  expectedAmount: number,
  expectedCurrency: string,
  providerAmount: unknown,
  providerCurrency: unknown
): boolean {
  const amt = Number(providerAmount);
  if (!Number.isFinite(amt) || !Number.isFinite(Number(expectedAmount))) return false;
  if (String(providerCurrency ?? "").toUpperCase() !== String(expectedCurrency ?? "").toUpperCase()) {
    return false;
  }
  return Math.abs(amt - Number(expectedAmount)) < 0.005;
}

const OBLIGATION_REASON_STATUS: Record<string, number> = {
  amount_mismatch: 422,
  currency_mismatch: 422,
  payment_already_in_progress: 409,
  already_paid: 409,
  rental_not_found_for_driver: 403,
  invoice_not_found_for_driver: 403,
};

/**
 * Resolve the amount the server permits for this payment via the database
 * rule (public.resolve_payment_obligation), create the provider order with
 * THAT amount, then atomically reserve the invoice (if any) for the created
 * payment. Missing/ambiguous rules fail closed. A client amount is only
 * compared, never used.
 */
export async function createWithAuthoritativeAmount<T extends { payment_id?: string | null }>(
  pool: Pick<Pool, "query">,
  args: {
    driverId: string;
    purpose?: string | null;
    rentalId?: string | null;
    invoiceId?: string | null;
    clientAmount?: unknown;
    clientCurrency?: string | null;
  },
  create: (authoritative: { amount: number; currency: string }) => Promise<T>
): Promise<T> {
  const purpose = String(args.purpose || "rental").trim();
  const clientAmount =
    args.clientAmount === undefined || args.clientAmount === null || args.clientAmount === ""
      ? null
      : Number(args.clientAmount);
  if (clientAmount !== null && !Number.isFinite(clientAmount)) {
    throw new PaymentAuthorityError(422, "Invalid amount");
  }

  const r = await pool.query(
    `SELECT public.resolve_payment_obligation($1, $2, $3, $4, $5, $6) AS result`,
    [args.driverId, purpose, args.rentalId ?? null, args.invoiceId ?? null, clientAmount, args.clientCurrency ?? null]
  );
  const rule = r.rows[0]?.result;
  if (!rule?.ok) {
    const reason = String(rule?.reason || "no_authoritative_rule");
    throw new PaymentAuthorityError(
      OBLIGATION_REASON_STATUS[reason] ?? 422,
      `Payment not permitted: ${reason}`
    );
  }

  const result = await create({ amount: Number(rule.amount), currency: String(rule.currency) });

  if (rule.invoice_id) {
    const paymentId = result?.payment_id;
    const claimed = paymentId
      ? (await pool.query(`SELECT public.claim_invoice_for_payment($1, $2) AS ok`, [rule.invoice_id, paymentId])).rows[0]?.ok
      : false;
    if (!claimed) {
      if (paymentId) {
        await pool
          .query(`UPDATE public.payments SET status = 'failed', updated_at = now() WHERE id = $1 AND status = 'pending'`, [paymentId])
          .catch(() => undefined);
      }
      throw new PaymentAuthorityError(409, "Payment not permitted: payment_already_in_progress");
    }
  }
  return result;
}
