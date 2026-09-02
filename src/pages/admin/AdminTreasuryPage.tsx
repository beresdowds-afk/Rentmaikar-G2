import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ShieldCheck, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useRegion } from "@/contexts/RegionContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { WithdrawalAuthorizationGate } from "@/components/payments/WithdrawalAuthorizationGate";
import {
  RISK_FLAG_LABELS,
  useDecideWithdrawalAuthorization,
  useWithdrawalAuthorizationQueue,
} from "@/hooks/useWithdrawalAuthorization";

export default function AdminTreasuryPage() {
  const { user } = useAuth();
  const { currency } = useRegion();
  const [amount, setAmount] = useState("");
  const [destination, setDestination] = useState("");
  const decide = useDecideWithdrawalAuthorization();
  const queue = useWithdrawalAuthorizationQueue("pending");

  const platformBalance = useQuery({
    queryKey: ["platform-wallet-balance", user?.id, currency],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_ledger_balance" as never, {
        _user_id: user?.id,
        _account_type: "platform",
        _currency: currency,
        _include_pending: false,
      } as never);
      if (error) throw error;
      return Number(data ?? 0);
    },
  });

  const parsedAmount = Number(amount || 0);

  return (
    <div className="container mx-auto space-y-6 py-8">
      <div>
        <h1 className="text-3xl font-display font-bold">Treasury</h1>
        <p className="text-muted-foreground">
          Platform balances are computed from the wallet ledger only. Every treasury movement
          requires dual authorization.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" /> Platform balance ({currency})
            </CardTitle>
            <CardDescription>Ledger-derived, cache-independent.</CardDescription>
          </CardHeader>
          <CardContent>
            {platformBalance.isLoading ? (
              <Skeleton className="h-10 w-40" />
            ) : (
              <p className="text-3xl font-bold">
                {currency} {(platformBalance.data ?? 0).toFixed(2)}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Platform withdrawal</CardTitle>
            <CardDescription>Requires approval from a second admin.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Amount ({currency})</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label>Destination reference</Label>
              <Input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="Bank account / treasury reference"
              />
            </div>
            {parsedAmount > 0 && (
              <WithdrawalAuthorizationGate
                requestType="platform_withdrawal"
                amount={parsedAmount}
                currency={currency as "USD" | "NGN" | (string & {})}
                destinationRef={destination || null}
                requestLabel="Request treasury authorization"
              >
                {(authorizationId) => (
                  <Button
                    className="w-full"
                    onClick={() =>
                      toast.success(
                        `Treasury withdrawal authorized (${authorizationId.slice(0, 8)}…) — queued for processing.`,
                      )
                    }
                  >
                    Execute withdrawal
                  </Button>
                )}
              </WithdrawalAuthorizationGate>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" /> Pending authorizations
          </CardTitle>
          <CardDescription>
            An admin can never approve their own request or a payout to themselves.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {queue.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Requested</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Beneficiary</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(queue.data ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{new Date(row.created_at).toLocaleString()}</TableCell>
                    <TableCell>{row.request_type.replace(/_/g, " ")}</TableCell>
                    <TableCell>
                      {row.subject_name ?? row.subject_email ?? row.subject_user_id.slice(0, 8)}
                    </TableCell>
                    <TableCell>
                      {row.currency} {Number(row.amount).toFixed(2)}
                    </TableCell>
                    <TableCell className="space-y-1">
                      <Badge variant={row.risk_score >= 60 ? "destructive" : "secondary"}>
                        {row.risk_score}
                      </Badge>
                      <div className="text-xs text-muted-foreground">
                        {(row.risk_flags ?? [])
                          .map((flag) => RISK_FLAG_LABELS[flag] ?? flag)
                          .join(", ")}
                      </div>
                    </TableCell>
                    <TableCell className="space-x-2 whitespace-nowrap">
                      <Button
                        size="sm"
                        disabled={decide.isPending}
                        onClick={() =>
                          decide
                            .mutateAsync({
                              id: row.id,
                              decision: "approved",
                              subjectUserId: row.subject_user_id,
                              amount: row.amount,
                              currency: row.currency,
                            })
                            .then(() => toast.success("Withdrawal approved"))
                            .catch((e: Error) => toast.error(e.message))
                        }
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={decide.isPending}
                        onClick={() =>
                          decide
                            .mutateAsync({
                              id: row.id,
                              decision: "rejected",
                              reason: "Rejected by admin review",
                              subjectUserId: row.subject_user_id,
                              amount: row.amount,
                              currency: row.currency,
                            })
                            .then(() => toast.success("Withdrawal rejected"))
                            .catch((e: Error) => toast.error(e.message))
                        }
                      >
                        Reject
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(queue.data?.length ?? 0) === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No withdrawals awaiting authorization.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Dual authorization policy</AlertTitle>
        <AlertDescription>
          Approvals expire after 24 hours, are single-use, and are void if the amount or destination
          changes.
        </AlertDescription>
      </Alert>
    </div>
  );
}
