import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";
import { useCredentialVerification, type CredentialResult } from "@/hooks/useCredentialVerification";

/**
 * Live health board for every third-party credential. Auto-runs on mount and
 * after any secret is saved, so admins never need to refresh to know whether a
 * newly-saved key actually works.
 */

function StatusBadge({ status }: { status: CredentialResult["status"] }) {
  if (status === "ok") {
    return (
      <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
        <ShieldCheck className="h-3 w-3" aria-hidden="true" /> Verified
      </Badge>
    );
  }
  if (status === "not_configured") {
    return (
      <Badge variant="outline" className="gap-1">
        <ShieldQuestion className="h-3 w-3" aria-hidden="true" /> Not configured
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="gap-1">
      <ShieldAlert className="h-3 w-3" aria-hidden="true" /> Failed
    </Badge>
  );
}

export default function CredentialVerificationPanel() {
  const { results, isRunning, running, lastRunAt, error, verify } = useCredentialVerification({ autoRun: true });

  const sorted = [...results].sort((a, b) => {
    const rank = { failed: 0, not_configured: 1, ok: 2 } as const;
    return rank[a.status] - rank[b.status] || a.label.localeCompare(b.label);
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Credential health
          </CardTitle>
          <CardDescription>
            Every provider is tested with a real, read-only API call using the stored secrets.
            {lastRunAt ? ` Last checked ${new Date(lastRunAt).toLocaleTimeString()}.` : ""}
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => verify(undefined, { toastOutcome: true })} disabled={isRunning}>
          {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Re-verify all</span>
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">{error}</p>
        )}
        {!sorted.length && isRunning && (
          <p className="text-sm text-muted-foreground">Running live credential checks…</p>
        )}
        {sorted.map((r) => (
          <div key={r.provider} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{r.label}</p>
              <p className="text-xs text-muted-foreground">
                {r.message}
                {r.detail ? ` ${r.detail}` : ""}
              </p>
              <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground/70">
                {r.secrets.join(" · ")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {r.status === "ok" && <span className="text-xs text-muted-foreground">{r.latency_ms}ms</span>}
              <StatusBadge status={r.status} />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => verify([r.provider], { toastOutcome: true })}
                disabled={running.includes(r.provider) || isRunning}
              >
                {running.includes(r.provider) ? <Loader2 className="h-4 w-4 animate-spin" /> : "Re-test"}
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
