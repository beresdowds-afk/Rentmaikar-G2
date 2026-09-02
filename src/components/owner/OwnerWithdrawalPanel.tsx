import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useRegion } from "@/contexts/RegionContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Banknote, CheckCircle2, Clock, Loader2, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { WithdrawalAuthorizationGate } from "@/components/payments/WithdrawalAuthorizationGate";
import { useRegionSamples } from '@/hooks/useRegionSamples';
import { readEdgeError } from "@/lib/edge-invoke";

type PayoutAccount = {
  id: string;
  provider: string;
  currency: string;
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
  paypal_email: string | null;
  recipient_code: string | null;
  is_default: boolean;
};

type Payout = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  provider: string;
  transfer_reference: string | null;
  failure_reason: string | null;
  created_at: string;
  processed_at: string | null;
};

const money = (v: number, c: string) =>
  `${c === "NGN" ? "₦" : c === "USD" ? "$" : `${c} `}${Number(v || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const statusTone = (status: string) => {
  if (["completed", "settled"].includes(status)) return "bg-green-100 text-green-700";
  if (["failed", "cancelled"].includes(status)) return "bg-red-100 text-red-700";
  return "bg-yellow-100 text-yellow-700";
};

const StatusIcon = ({ status }: { status: string }) =>
  ["completed", "settled"].includes(status) ? (
    <CheckCircle2 className="h-5 w-5 text-green-600" />
  ) : ["failed", "cancelled"].includes(status) ? (
    <XCircle className="h-5 w-5 text-red-600" />
  ) : (
    <Clock className="h-5 w-5 text-yellow-600" />
  );

/**
 * Owner self-service withdrawals. Owners move their own settled earnings
 * without waiting for an admin: the authorization gate auto-approves owner
 * payouts and only escalates when the ledger balance cannot cover the request.
 * Every payout is audited and reconciled server-side.
 */
export const OwnerWithdrawalPanel = () => {
  const { user } = useAuth();
  const samples = useRegionSamples();
  const { country } = useRegion();
  const currency = country === "Nigeria" ? "NGN" : "USD";

  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [accounts, setAccounts] = useState<PayoutAccount[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [accountId, setAccountId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // New account form
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [paypalEmail, setPaypalEmail] = useState("");
  const [savingAccount, setSavingAccount] = useState(false);
  // Payout provider readiness — a missing provider key is the single biggest
  // cause of "withdrawal failed" with no explanation.
  const [providerReady, setProviderReady] = useState<boolean | null>(null);
  // Phone verification is compulsory for withdrawals (it is NOT required for
  // sending or receiving SMS/WhatsApp messages).
  const [phoneVerified, setPhoneVerified] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.functions.invoke("get-psp-config").then(({ data }) => {
      if (cancelled || !data) return;
      const cfg = data as { paystack?: { configured?: boolean }; paypal?: { configured?: boolean } };
      setProviderReady(
        currency === "NGN" ? !!cfg.paystack?.configured : !!cfg.paypal?.configured,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [currency]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [bal, accs, hist] = await Promise.all([
      supabase.rpc("get_owner_available_balance", { _owner_id: user.id, _currency: currency }),
      supabase
        .from("owner_payout_accounts")
        .select("id,provider,currency,bank_name,account_number,account_name,paypal_email,recipient_code,is_default")
        .eq("owner_id", user.id)
        .order("is_default", { ascending: false }),
      supabase
        .from("owner_payouts")
        .select("id,amount,currency,status,provider,transfer_reference,failure_reason,created_at,processed_at")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(25),
    ]);
    setBalance(Number(bal.data ?? 0));
    const list = (accs.data ?? []) as PayoutAccount[];
    setAccounts(list);
    setAccountId((prev) => prev || list.find((a) => a.currency === currency)?.id || list[0]?.id || "");
    setPayouts((hist.data ?? []) as Payout[]);
    const { data: profile } = await supabase
      .from("profiles")
      .select("phone_verified")
      .eq("user_id", user.id)
      .maybeSingle();
    setPhoneVerified(!!profile?.phone_verified);
    setLoading(false);
  }, [user, currency]);

  useEffect(() => {
    load();
  }, [load]);

  const selected = useMemo(() => accounts.find((a) => a.id === accountId), [accounts, accountId]);
  const numericAmount = Number(amount || 0);
  const amountValid = numericAmount > 0 && numericAmount <= balance;
  const inFlight = payouts.some((p) => ["pending", "authorized", "captured", "processing"].includes(p.status));

  const addAccount = async () => {
    if (!user) return;
    setSavingAccount(true);
    try {
      if (currency === "NGN") {
        const { data, error } = await supabase.functions.invoke("create-paystack-recipient", {
          body: { bankCode, accountNumber, currency: "NGN", countryCode: "NG", makeDefault: accounts.length === 0 },
        });
        if (error) throw new Error(await readEdgeError(error, "Could not save payout account"));
        if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      } else {
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(paypalEmail)) throw new Error("Enter a valid PayPal email");
        const { error } = await supabase.from("owner_payout_accounts").insert({
          owner_id: user.id,
          provider: "paypal",
          currency: "USD",
          country_code: "US",
          paypal_email: paypalEmail,
          is_default: accounts.length === 0,
        });
        if (error) throw error;
      }
      toast.success("Payout account saved");
      setBankCode("");
      setAccountNumber("");
      setPaypalEmail("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save payout account");
    } finally {
      setSavingAccount(false);
    }
  };

  const withdraw = async (authorizationId: string) => {
    if (!selected) return;
    setSubmitting(true);
    try {
      const fn = selected.provider === "paypal" ? "initiate-paypal-payout" : "initiate-paystack-transfer";
      const { data, error } = await supabase.functions.invoke(fn, {
        body: { amount: numericAmount, payoutAccountId: selected.id, authorizationId },
      });
      if (error) throw new Error(await readEdgeError(error, "Withdrawal failed"));
      const err = (data as { error?: string })?.error;
      if (err) throw new Error(err);
      toast.success("Withdrawal submitted — funds are on their way.");
      setAmount("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Withdrawal failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-primary" /> Withdraw your earnings
            </CardTitle>
            <CardDescription>
              Self-service — no admin approval needed. Withdrawals are logged and reconciled automatically.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">Available balance</p>
            <p className="text-3xl font-bold text-green-600">{money(balance, currency)}</p>
          </div>

          {providerReady === false && (
            <Alert variant="destructive">
              <AlertTitle>Payouts are temporarily unavailable</AlertTitle>
              <AlertDescription>
                {currency === "NGN"
                  ? "Bank transfers are not configured yet. Our team has been notified — your balance stays safe until payouts are re-enabled."
                  : "PayPal payouts are not configured yet. Our team has been notified — your balance stays safe until payouts are re-enabled."}
              </AlertDescription>
            </Alert>
          )}

          {accounts.length === 0 ? (
            <div className="space-y-3">
              <Alert>
                <AlertTitle>Add a payout destination</AlertTitle>
                <AlertDescription>
                  {currency === "NGN"
                    ? "Add your Nigerian bank account to receive transfers."
                    : "Add the PayPal email that should receive your payouts."}
                </AlertDescription>
              </Alert>
              {currency === "NGN" ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="bank-code">Bank code</Label>
                    <Input id="bank-code" value={bankCode} onChange={(e) => setBankCode(e.target.value)} placeholder="058" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="acct-no">Account number</Label>
                    <Input
                      id="acct-no"
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      placeholder="0123456789"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="pp-email">PayPal email</Label>
                  <Input
                    id="pp-email"
                    type="email"
                    value={paypalEmail}
                    onChange={(e) => setPaypalEmail(e.target.value)}
                    placeholder={samples.email}
                  />
                </div>
              )}
              <Button onClick={addAccount} disabled={savingAccount}>
                {savingAccount && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save payout account
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Payout account</Label>
                <div className="grid gap-2">
                  {accounts.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setAccountId(a.id)}
                      className={`flex items-center justify-between rounded-lg border p-3 text-left transition ${
                        a.id === accountId ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                      }`}
                    >
                      <span className="text-sm">
                        {a.provider === "paypal"
                          ? `PayPal · ${a.paypal_email}`
                          : `${a.bank_name ?? "Bank"} · ****${(a.account_number ?? "").slice(-4)}`}
                      </span>
                      <Badge variant="outline">{a.currency}</Badge>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="wd-amount">Amount ({currency})</Label>
                <Input
                  id="wd-amount"
                  type="number"
                  min={1}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
                {numericAmount > balance && (
                  <p className="text-xs text-destructive">Amount exceeds your available balance.</p>
                )}
              </div>

              {phoneVerified === false ? (
                <Alert>
                  <ShieldCheck className="h-4 w-4" />
                  <AlertTitle>Verify your phone number to withdraw</AlertTitle>
                  <AlertDescription className="space-y-2">
                    <p>
                      Phone verification is required before any payout can be released. It is not
                      needed to receive SMS or WhatsApp messages.
                    </p>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/settings/profile">Verify phone number</Link>
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : inFlight ? (
                <Alert>
                  <Clock className="h-4 w-4" />
                  <AlertTitle>A withdrawal is already in progress</AlertTitle>
                  <AlertDescription>Wait for it to complete before starting another one.</AlertDescription>
                </Alert>
              ) : (
                <WithdrawalAuthorizationGate
                  requestType="owner_payout"
                  amount={numericAmount}
                  currency={currency}
                  subjectUserId={user?.id}
                  destinationRef={selected?.id}
                  metadata={{ provider: selected?.provider, self_service: true }}
                  disabled={!amountValid || !selected}
                  requestLabel="Authorize withdrawal"
                >
                  {(authorizationId) => (
                    <Button className="w-full" onClick={() => withdraw(authorizationId)} disabled={submitting || !amountValid}>
                      {submitting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending…
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="h-4 w-4 mr-2" /> Withdraw {money(numericAmount, currency)}
                        </>
                      )}
                    </Button>
                  )}
                </WithdrawalAuthorizationGate>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Withdrawal history</CardTitle>
          <CardDescription>Every request, with its settlement status and any failure reason.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {payouts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No withdrawals yet.</p>
          ) : (
            payouts.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border p-4">
                <div className="flex items-center gap-3">
                  <StatusIcon status={p.status} />
                  <div>
                    <p className="font-medium">{money(Number(p.amount), p.currency)}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(p.created_at).toLocaleString()} · {p.provider}
                      {p.transfer_reference ? ` · ${p.transfer_reference}` : ""}
                    </p>
                    {p.failure_reason && <p className="text-xs text-destructive">{p.failure_reason}</p>}
                  </div>
                </div>
                <Badge className={statusTone(p.status)}>{p.status}</Badge>
              </div>
            ))
          )}
          <Separator />
          <p className="text-xs text-muted-foreground">
            Withdrawals draw only on settled earnings from your own vehicles. Each one posts a matching wallet ledger
            entry that admins reconcile against platform revenue.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default OwnerWithdrawalPanel;
