import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Runs live credential checks against the `verify-credentials` edge function.
 * Used both by the credential health screen and by every panel that saves a
 * secret, so an admin sees a real pass/fail immediately after saving instead
 * of having to refresh the page.
 */

export type CredentialStatus = "ok" | "failed" | "not_configured";

export interface CredentialResult {
  provider: string;
  label: string;
  status: CredentialStatus;
  message: string;
  detail?: string;
  latency_ms: number;
  secrets: string[];
  checked_at: string;
}

interface VerifyResponse {
  results: CredentialResult[];
  summary: { ok: number; failed: number; not_configured: number };
  verified_at: string;
}

async function invokeVerify(providers?: string[]): Promise<VerifyResponse> {
  const { data, error } = await supabase.functions.invoke("verify-credentials", {
    body: providers?.length ? { providers } : {},
  });
  if (error) {
    // functions.invoke hides non-2xx bodies — surface the real reason.
    let detail = error.message;
    try {
      const ctx = (error as unknown as { context?: { text?: () => Promise<string> } }).context;
      if (ctx?.text) {
        const parsed = JSON.parse(await ctx.text());
        if (parsed?.error) detail = parsed.error;
      }
    } catch { /* keep the generic message */ }
    throw new Error(detail);
  }
  return data as VerifyResponse;
}

/** Toasts the outcome of a single provider check. */
export function toastCredentialResult(result: CredentialResult) {
  if (result.status === "ok") {
    toast.success(`${result.label}: verified`, {
      description: [result.message, result.detail].filter(Boolean).join(" "),
    });
  } else if (result.status === "not_configured") {
    toast.warning(`${result.label}: not configured`, { description: result.message, duration: 9000 });
  } else {
    toast.error(`${result.label}: verification failed`, {
      description: [result.message, result.detail].filter(Boolean).join(" "),
      duration: 12000,
    });
  }
}

export function useCredentialVerification(options?: { autoRun?: boolean; providers?: string[] }) {
  const autoRun = options?.autoRun ?? false;
  const providersKey = (options?.providers ?? []).join(",");
  const [results, setResults] = useState<CredentialResult[]>([]);
  const [running, setRunning] = useState<string[]>([]);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const verify = useCallback(
    async (providers?: string[], opts?: { toastOutcome?: boolean }): Promise<CredentialResult[]> => {
      const scope = providers?.length ? providers : ["*"];
      setRunning((r) => [...new Set([...r, ...scope])]);
      setError(null);
      try {
        const res = await invokeVerify(providers);
        if (mounted.current) {
          setResults((prev) => {
            const next = new Map(prev.map((p) => [p.provider, p]));
            res.results.forEach((r) => next.set(r.provider, r));
            return [...next.values()];
          });
          setLastRunAt(res.verified_at);
        }
        if (opts?.toastOutcome) {
          if (res.results.length === 1) {
            toastCredentialResult(res.results[0]);
          } else {
            const failed = res.results.filter((r) => r.status === "failed");
            if (failed.length === 0) toast.success(`All ${res.summary.ok} credential checks passed`);
            else toast.error(`${failed.length} credential check(s) failed`, {
              description: failed.map((f) => f.label).join(", "),
              duration: 12000,
            });
          }
        }
        return res.results;
      } catch (e) {
        const message = (e as Error).message || "Verification could not run";
        if (mounted.current) setError(message);
        if (opts?.toastOutcome) toast.error("Could not verify credentials", { description: message, duration: 10000 });
        return [];
      } finally {
        if (mounted.current) setRunning((r) => r.filter((p) => !scope.includes(p)));
      }
    },
    [],
  );

  useEffect(() => {
    if (!autoRun) return;
    void verify(providersKey ? providersKey.split(",") : undefined);
  }, [autoRun, providersKey, verify]);

  return {
    results,
    running,
    isRunning: running.length > 0,
    lastRunAt,
    error,
    verify,
    /** Verify one provider and toast the outcome — for use right after a save. */
    verifyAfterSave: (provider: string) => verify([provider], { toastOutcome: true }),
  };
}
