import type { Pool } from "pg";

export class ProxyPaymentError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface ProxyAccount {
  id: string;
  proxy_email: string;
  uses_count: number;
}

/**
 * Validates that the proxy belongs to the driver and is currently usable, then
 * reserves one use with an optimistic lock so max_uses cannot be exceeded.
 */
export async function reserveProxyUse(
  pool: Pick<Pool, "query">,
  driverId: string,
  proxyAccountId: string,
): Promise<ProxyAccount> {
  const res = await pool.query(
    `SELECT id, driver_id, proxy_email, status, consent_status, identity_status,
            admin_review_status, validity_starts_at, validity_expires_at,
            max_uses, uses_count
       FROM public.driver_proxy_billing_accounts WHERE id = $1`,
    [proxyAccountId],
  );
  const px = res.rows[0];
  if (!px || px.driver_id !== driverId) throw new ProxyPaymentError(404, "Proxy account not found");
  if (
    px.status !== "active" || px.consent_status !== "signed" ||
    px.identity_status !== "verified" || px.admin_review_status !== "approved"
  ) throw new ProxyPaymentError(409, "Proxy account is not active");
  const now = Date.now();
  if (px.validity_starts_at && new Date(px.validity_starts_at).getTime() > now) {
    throw new ProxyPaymentError(409, "Proxy account not yet valid");
  }
  if (px.validity_expires_at && new Date(px.validity_expires_at).getTime() <= now) {
    throw new ProxyPaymentError(409, "Proxy account expired");
  }
  const uses = Number(px.uses_count ?? 0);
  if (px.max_uses != null && uses >= Number(px.max_uses)) {
    throw new ProxyPaymentError(409, "Proxy account use limit reached");
  }
  const lock = await pool.query(
    `UPDATE public.driver_proxy_billing_accounts
        SET uses_count = uses_count + 1
      WHERE id = $1 AND uses_count = $2 RETURNING id`,
    [proxyAccountId, uses],
  );
  if (!lock.rows.length) throw new ProxyPaymentError(409, "Proxy account is busy, please retry");
  return { id: px.id, proxy_email: px.proxy_email, uses_count: uses };
}

export async function releaseProxyUse(pool: Pick<Pool, "query">, proxyAccountId: string): Promise<void> {
  await pool.query(
    `UPDATE public.driver_proxy_billing_accounts
        SET uses_count = GREATEST(uses_count - 1, 0) WHERE id = $1`,
    [proxyAccountId],
  );
}

/** Marks a payment row created by a provider service as proxy-funded. */
export async function markPaymentProxyFunded(
  pool: Pick<Pool, "query">,
  paymentId: string,
  proxyAccountId: string,
): Promise<void> {
  await pool.query(
    `UPDATE public.payments SET payer_type = 'proxy', proxy_account_id = $2 WHERE id = $1`,
    [paymentId, proxyAccountId],
  );
}
