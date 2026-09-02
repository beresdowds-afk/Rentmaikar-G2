import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDownLeft, ArrowUpRight, RefreshCw, Wallet } from "lucide-react";
import { LEDGER_TYPE_LABELS, useWalletLedger, useWalletSummary } from "@/hooks/useWallet";

function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(currency === "NGN" ? "en-NG" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

interface WalletLedgerPanelProps {
  /** Limit the history rows shown. */
  limit?: number;
  className?: string;
}

/**
 * Wallet balances + append-only ledger history for the signed-in user.
 * Every payment, payout, fee and refund lands here exactly once.
 */
export function WalletLedgerPanel({ limit = 15, className }: WalletLedgerPanelProps) {
  const wallets = useWalletSummary();
  const ledger = useWalletLedger(limit);

  const refresh = () => {
    wallets.refetch();
    ledger.refetch();
  };

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" /> Wallet & Ledger
          </CardTitle>
          <CardDescription>Balances and every recorded money movement on your account.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={wallets.isFetching || ledger.isFetching}>
          <RefreshCw className={`h-4 w-4 ${wallets.isFetching || ledger.isFetching ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>

      <CardContent className="space-y-6">
        {wallets.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (wallets.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No wallet activity yet. Your balance appears here after your first payment or payout.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {(wallets.data ?? []).map((w) => (
              <div key={w.wallet_id} className="rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    {w.account_type} · {w.currency}
                  </span>
                  {w.status !== "active" && <Badge variant="destructive">{w.status}</Badge>}
                </div>
                <p className="mt-1 text-2xl font-semibold">{money(w.available_balance, w.currency)}</p>
                {w.pending_balance !== 0 && (
                  <p className="text-xs text-muted-foreground">
                    {money(w.pending_balance, w.currency)} pending
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <h3 className="text-sm font-medium">Recent entries</h3>
          {ledger.isLoading ? (
            <>
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </>
          ) : (ledger.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No ledger entries yet.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {(ledger.data ?? []).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`rounded-full p-2 ${
                        e.direction === "credit" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {e.direction === "credit" ? (
                        <ArrowDownLeft className="h-4 w-4" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {LEDGER_TYPE_LABELS[e.entry_type] ?? e.entry_type}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {new Date(e.created_at).toLocaleString()}
                        {e.provider ? ` · ${e.provider}` : ""}
                        {e.description ? ` · ${e.description}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-semibold ${e.direction === "credit" ? "text-primary" : ""}`}>
                      {e.direction === "credit" ? "+" : "−"}
                      {money(e.amount, e.currency)}
                    </p>
                    {e.status !== "posted" && (
                      <Badge variant="secondary" className="mt-1 text-[10px]">
                        {e.status}
                      </Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default WalletLedgerPanel;
