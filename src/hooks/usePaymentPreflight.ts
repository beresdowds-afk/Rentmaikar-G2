import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PreflightOperation = "driver_payment" | "owner_payout" | "admin_withdrawal";

export interface PreflightIssue {
  code: string;
  message: string | null;
  remediation: string | null;
  retryable?: boolean;
  category: string | null;
}

export interface PreflightResult {
  ok: boolean;
  operation: PreflightOperation;
  currency: string;
  amount: number | null;
  available_balance: number | null;
  blockers: PreflightIssue[];
  warnings: PreflightIssue[];
}

interface Options {
  operation: PreflightOperation;
  amount?: number | null;
  currency?: string;
  /** Extra context forwarded to the backend checker. */
  context?: Record<string, unknown>;
  /** Skip the automatic run (e.g. dialog not open yet). */
  enabled?: boolean;
}

const FALLBACK_MESSAGE =
  "We could not verify that this transaction can go through. Please try again.";

/** Human-readable text for an issue, even if the code is not in the catalogue yet. */
export function describeIssue(issue: PreflightIssue): string {
  return issue.message ?? `${issue.code}: ${FALLBACK_MESSAGE}`;
}

/**
 * Runs the server-side payment pre-flight checks (account status, verification,
 * suspension, payout bank details, available balance, currency and amount)
 * before a payment, payout or withdrawal is attempted, so users get an
 * actionable reason instead of a generic "Transaction failed".
 */
export function usePaymentPreflight({
  operation,
  amount,
  currency = "USD",
  context,
  enabled = true,
}: Options) {
  const [result, setResult] = useState<PreflightResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (): Promise<PreflightResult | null> => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc("run_payment_preflight", {
        _operation: operation,
        _context: {
          ...(context ?? {}),
          amount: amount ?? null,
          currency,
        } as never,
      });
      if (rpcError) throw rpcError;
      const parsed = data as unknown as PreflightResult;
      setResult(parsed);
      return parsed;
    } catch (e) {
      const message = e instanceof Error ? e.message : FALLBACK_MESSAGE;
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [operation, amount, currency, context]);

  useEffect(() => {
    if (!enabled) return;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, operation, amount, currency]);

  return {
    result,
    blockers: result?.blockers ?? [],
    warnings: result?.warnings ?? [],
    /** true only once the server has confirmed there are no blockers. */
    canProceed: result?.ok === true,
    availableBalance: result?.available_balance ?? null,
    loading,
    error,
    run,
  };
}
