import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Gavel, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import PlatformRevenueCard from "@/components/admin/PlatformRevenueCard";


interface LedgerEntry {
  id: string;
  user_id: string;
  account_type: string;
  direction: "credit" | "debit";
  amount: number;
  currency: string;
  entry_type: string;
  status: string;
  provider: string | null;
  provider_reference: string | null;
  description: string | null;
  created_at: string;
}

interface ReconResult {
  found: boolean;
  balanced?: boolean;
  payment?: Record<string, unknown> & { id: string; amount: number; currency: string; status: string };
  expected?: { driver_debit: number; owner_share: number; platform_fee: number; owner_share_pct: number };
  posted?: { driver_debit: number; owner_share: number; platform_fee: number };
  entries?: LedgerEntry[];
  mismatches?: { code: string; expected: number; posted: number }[];
}

const MISMATCH_LABELS: Record<string, string> = {
  MISSING_DRIVER_DEBIT: "Driver debit never posted",
  DRIVER_DEBIT_AMOUNT_MISMATCH: "Driver debit does not match payment amount",
  MISSING_OWNER_SHARE: "Owner share never credited",
  OWNER_SHARE_MISMATCH: "Owner share differs from expected split",
  MISSING_PLATFORM_FEE: "Platform fee never posted",
  PLATFORM_FEE_MISMATCH: "Platform fee differs from expected split",
  LEDGER_ENTRIES_ON_UNCAPTURED_PAYMENT: "Ledger entries exist for an uncaptured payment",
};

function money(value: number | undefined, currency = "USD") {
  return `${currency} ${Number(value ?? 0).toFixed(2)}`;
}

export default function AdminLedgerReconciliationPage() {
  const [paymentIdInput, setPaymentIdInput] = useState("");
  const [paymentId, setPaymentId] = useState<string | null>(null);

  const recon = useQuery({
    queryKey: ["ledger-reconciliation", paymentId],
    enabled: Boolean(paymentId),
    queryFn: async (): Promise<ReconResult> => {
      const { data, error } = await supabase.rpc("admin_reconcile_payment_ledger" as never, {
        _payment_id: paymentId,
      } as never);
      if (error) throw error;
      return data as unknown as ReconResult;
    },
  });

  const sweep = useQuery({
    queryKey: ["ledger-mismatch-sweep"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_scan_ledger_mismatches" as never, {
        _limit: 100,
      } as never);
      if (error) throw error;
      return data as unknown as {
        mismatches: {
          payment: { id: string; amount: number; currency: string; status: string; created_at: string };
          expected: { owner_share: number; platform_fee: number };
          posted: { driver_debit: number; owner_share: number; platform_fee: number };
          mismatches: { code: string }[];
        }[];
      };
    },
  });

  const result = recon.data;
  const currency = (result?.payment?.currency as string) ?? "USD";

  return (
    <div className="container mx-auto space-y-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Ledger Reconciliation</h1>
          <p className="text-muted-foreground">
            Inspect wallet ledger entries by payment and highlight driver/owner/platform share
            mismatches.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/admin/disputes">
            <Gavel className="mr-2 h-4 w-4" />
            Dispute escalations
          </Link>
        </Button>
      </div>

      <PlatformRevenueCard />



      <Card>
        <CardHeader>
          <CardTitle>Look up a payment</CardTitle>
          <CardDescription>Filter ledger entries by payment ID.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setPaymentId(paymentIdInput.trim() || null);
            }}
          >
            <Input
              placeholder="Payment ID (UUID)"
              value={paymentIdInput}
              onChange={(e) => setPaymentIdInput(e.target.value)}
            />
            <Button type="submit">
              <Search className="mr-2 h-4 w-4" />
              Reconcile
            </Button>
          </form>
        </CardContent>
      </Card>

      {recon.isLoading && <Skeleton className="h-48 w-full" />}
      {recon.error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Lookup failed</AlertTitle>
          <AlertDescription>{(recon.error as Error).message}</AlertDescription>
        </Alert>
      )}

      {result && !result.found && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>No payment found</AlertTitle>
          <AlertDescription>No payment matches that ID.</AlertDescription>
        </Alert>
      )}

      {result?.found && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Expected vs posted
                {result.balanced ? (
                  <Badge variant="secondary" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Balanced
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" /> Mismatch
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Payment {money(result.payment?.amount, currency)} · status {result.payment?.status}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Component</TableHead>
                    <TableHead>Expected</TableHead>
                    <TableHead>Posted</TableHead>
                    <TableHead>Delta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(
                    [
                      ["Driver debit", result.expected?.driver_debit, result.posted?.driver_debit],
                      ["Owner share", result.expected?.owner_share, result.posted?.owner_share],
                      ["Platform fee", result.expected?.platform_fee, result.posted?.platform_fee],
                    ] as [string, number | undefined, number | undefined][]
                  ).map(([label, expected, posted]) => {
                    const delta = Number(posted ?? 0) - Number(expected ?? 0);
                    return (
                      <TableRow key={label} className={Math.abs(delta) > 0.01 ? "bg-destructive/10" : ""}>
                        <TableCell className="font-medium">{label}</TableCell>
                        <TableCell>{money(expected, currency)}</TableCell>
                        <TableCell>{money(posted, currency)}</TableCell>
                        <TableCell className={Math.abs(delta) > 0.01 ? "text-destructive font-medium" : ""}>
                          {delta >= 0 ? "+" : ""}
                          {delta.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {(result.mismatches?.length ?? 0) > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Mismatches detected</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc pl-5">
                      {result.mismatches?.map((m) => (
                        <li key={m.code}>
                          {MISMATCH_LABELS[m.code] ?? m.code} — expected {money(m.expected, currency)},
                          posted {money(m.posted, currency)}
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ledger entries</CardTitle>
              <CardDescription>{result.entries?.length ?? 0} entries for this payment</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Created</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Provider ref</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(result.entries ?? []).map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{new Date(entry.created_at).toLocaleString()}</TableCell>
                      <TableCell>{entry.account_type}</TableCell>
                      <TableCell>{entry.entry_type}</TableCell>
                      <TableCell>{entry.direction}</TableCell>
                      <TableCell>{money(entry.amount, entry.currency)}</TableCell>
                      <TableCell>
                        <Badge variant={entry.status === "posted" ? "secondary" : "outline"}>
                          {entry.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate">
                        {entry.provider_reference ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {(result.entries?.length ?? 0) === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        No ledger entries posted for this payment.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent mismatches (30 days)</CardTitle>
          <CardDescription>Payments whose ledger entries do not match the expected split.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {sweep.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Issues</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(sweep.data?.mismatches ?? []).map((row) => (
                  <TableRow key={row.payment.id}>
                    <TableCell className="font-mono text-xs">{row.payment.id}</TableCell>
                    <TableCell>{money(row.payment.amount, row.payment.currency)}</TableCell>
                    <TableCell>{row.payment.status}</TableCell>
                    <TableCell className="space-x-1">
                      {row.mismatches.map((m) => (
                        <Badge key={m.code} variant="destructive">
                          {MISMATCH_LABELS[m.code] ?? m.code}
                        </Badge>
                      ))}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setPaymentIdInput(row.payment.id);
                          setPaymentId(row.payment.id);
                        }}
                      >
                        Inspect
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(sweep.data?.mismatches?.length ?? 0) === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No mismatches found in the last 30 days.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
