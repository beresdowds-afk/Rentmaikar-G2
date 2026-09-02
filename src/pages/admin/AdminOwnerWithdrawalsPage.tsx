import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Banknote, CheckCircle2, Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type Row = {
  payout_id: string;
  owner_id: string;
  owner_name: string | null;
  owner_email: string | null;
  provider: string;
  amount: number;
  currency: string;
  status: string;
  initiated_by: string | null;
  transfer_reference: string | null;
  failure_reason: string | null;
  created_at: string;
  processed_at: string | null;
  risk_score: number;
  risk_flags: string[] | null;
  authorization_status: string | null;
  requires_dual_auth: boolean;
  ledger_entries: number;
  ledger_amount: number;
  ledger_posted_amount: number;
  owner_balance: number;
  gross_earnings: number;
  reconciliation: { ok: boolean; issues: string[] } | null;
};

const STATUSES = ["all", "pending", "authorized", "captured", "completed", "failed"] as const;

const money = (v: number, c: string) =>
  `${c === "NGN" ? "₦" : c === "USD" ? "$" : `${c} `}${Number(v || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/**
 * Admin oversight of owner self-service withdrawals: risk, ledger
 * reconciliation and revenue context for every payout.
 */
const AdminOwnerWithdrawalsPage = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_list_owner_withdrawals", {
      _status: status === "all" ? null : status,
      _limit: 300,
    });
    if (error) toast.error(error.message);
    setRows((data ?? []) as unknown as Row[]);
    setLoading(false);
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.owner_name, r.owner_email, r.transfer_reference, r.payout_id].some((v) =>
        (v ?? "").toLowerCase().includes(q)
      )
    );
  }, [rows, search]);

  const unreconciled = filtered.filter((r) => r.reconciliation && !r.reconciliation.ok);

  const exportCsv = () => {
    const headers = [
      "payout_id","owner_name","owner_email","provider","amount","currency","status","initiated_by",
      "transfer_reference","created_at","risk_score","risk_flags","ledger_entries","ledger_amount",
      "ledger_posted_amount","owner_balance","gross_earnings","reconciled","issues",
    ];
    const csv = [
      headers.join(","),
      ...filtered.map((r) =>
        [
          r.payout_id, r.owner_name ?? "", r.owner_email ?? "", r.provider, r.amount, r.currency, r.status,
          r.initiated_by ?? "", r.transfer_reference ?? "", r.created_at, r.risk_score,
          (r.risk_flags ?? []).join("|"), r.ledger_entries, r.ledger_amount, r.ledger_posted_amount,
          r.owner_balance, r.gross_earnings, r.reconciliation?.ok ? "yes" : "no",
          (r.reconciliation?.issues ?? []).join("|"),
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(",")
      ),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `owner-withdrawals-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Banknote className="h-6 w-6 text-primary" /> Owner withdrawals
          </h1>
          <p className="text-sm text-muted-foreground">
            Self-service payouts with risk scoring, audit trail and wallet-ledger reconciliation.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
          <Button variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
        </div>
      </header>

      {unreconciled.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{unreconciled.length} withdrawal(s) need reconciliation</AlertTitle>
          <AlertDescription>
            These payouts do not match their wallet ledger entries. Review them before the next payout run.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={status} onValueChange={setStatus}>
          <TabsList>
            {STATUSES.map((s) => (
              <TabsTrigger key={s} value={s} className="capitalize">
                {s}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Input
          className="max-w-xs"
          placeholder="Search owner, email or reference"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No withdrawals found.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <Card key={r.payout_id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">
                      {r.owner_name ?? "Unknown owner"} · {money(Number(r.amount), r.currency)}
                    </CardTitle>
                    <CardDescription>
                      {r.owner_email} · {new Date(r.created_at).toLocaleString()} · {r.provider}
                      {r.transfer_reference ? ` · ${r.transfer_reference}` : ""}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="capitalize">{r.status}</Badge>
                    <Badge variant={r.risk_score >= 40 ? "destructive" : "secondary"}>risk {r.risk_score}</Badge>
                    {r.initiated_by === "owner" && <Badge variant="secondary">self-service</Badge>}
                    {r.requires_dual_auth && <Badge variant="destructive">dual auth</Badge>}
                    {r.reconciliation?.ok ? (
                      <Badge className="bg-green-100 text-green-700">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> reconciled
                      </Badge>
                    ) : (
                      <Badge variant="destructive">
                        <AlertTriangle className="h-3 w-3 mr-1" /> {(r.reconciliation?.issues ?? []).join(", ") || "unreconciled"}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-muted-foreground">Ledger entries</p>
                  <p className="font-medium">
                    {r.ledger_entries} · {money(Number(r.ledger_amount), r.currency)} (posted{" "}
                    {money(Number(r.ledger_posted_amount), r.currency)})
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Owner balance after</p>
                  <p className="font-medium">{money(Number(r.owner_balance), r.currency)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Lifetime owner earnings</p>
                  <p className="font-medium">{money(Number(r.gross_earnings), r.currency)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Authorization</p>
                  <p className="font-medium capitalize">
                    {r.authorization_status ?? "n/a"}
                    {(r.risk_flags ?? []).length > 0 && (
                      <span className="block text-xs text-muted-foreground">{(r.risk_flags ?? []).join(", ")}</span>
                    )}
                  </p>
                </div>
                {r.failure_reason && (
                  <p className="sm:col-span-2 lg:col-span-4 text-destructive">Failure: {r.failure_reason}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminOwnerWithdrawalsPage;
