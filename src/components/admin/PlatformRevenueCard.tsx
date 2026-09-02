import { useQuery } from "@tanstack/react-query";
import { Coins, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The platform treasury is a real wallet like any other account, so commission
 * revenue can be read straight off the ledger instead of being recomputed.
 */
const PLATFORM_USER_ID = "00000000-0000-0000-0000-000000000000";

interface PlatformWallet {
  currency: string;
  available_balance: number;
  lifetime_credits: number;
  lifetime_debits: number;
}

function money(value: number, currency: string) {
  return `${currency} ${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function PlatformRevenueCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["platform-revenue"],
    queryFn: async (): Promise<PlatformWallet[]> => {
      const { data, error } = await supabase
        .from("wallet_accounts")
        .select("currency, available_balance, lifetime_credits, lifetime_debits")
        .eq("user_id", PLATFORM_USER_ID)
        .eq("account_type", "platform");
      if (error) throw error;
      return (data ?? []) as PlatformWallet[];
    },
    staleTime: 60_000,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Coins className="h-4 w-4" aria-hidden="true" />
          Platform revenue
        </CardTitle>
        <CardDescription>
          Commission, subscription and fee income posted to the platform treasury wallet.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !data?.length ? (
          <p className="text-sm text-muted-foreground">No platform revenue recorded yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {data.map((wallet) => (
              <div key={wallet.currency} className="rounded-lg border p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {wallet.currency} balance
                </p>
                <p className="mt-1 text-2xl font-semibold">
                  {money(wallet.available_balance, wallet.currency)}
                </p>
                <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                  <TrendingUp className="h-3 w-3" aria-hidden="true" />
                  Earned {money(wallet.lifetime_credits, wallet.currency)} · Paid out{" "}
                  {money(wallet.lifetime_debits, wallet.currency)}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
