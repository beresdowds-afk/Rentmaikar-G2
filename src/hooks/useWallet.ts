import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface WalletAccountSummary {
  wallet_id: string;
  account_type: "driver" | "owner" | "platform" | "proxy";
  currency: "USD" | "NGN" | (string & {});
  available_balance: number;
  pending_balance: number;
  lifetime_credits: number;
  lifetime_debits: number;
  status: "active" | "frozen" | "closed";
}

export interface WalletLedgerEntry {
  id: string;
  direction: "credit" | "debit";
  amount: number;
  currency: string;
  entry_type: string;
  status: string;
  balance_after: number;
  description: string | null;
  provider: string | null;
  provider_reference: string | null;
  reference_table: string | null;
  reference_id: string | null;
  created_at: string;
}

/** Wallet balances for the signed-in user, across account types and currencies. */
export function useWalletSummary(currency?: "USD" | "NGN" | (string & {})) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["wallet-summary", user?.id, currency ?? "all"],
    enabled: Boolean(user?.id),
    staleTime: 30_000,
    queryFn: async (): Promise<WalletAccountSummary[]> => {
      const { data, error } = await supabase.rpc("get_my_wallet_summary", {
        _currency: currency ?? null,
      });
      if (error) throw error;
      const rows = (data ?? []) as unknown as WalletAccountSummary[];
      return rows.map((r) => ({
        ...r,
        available_balance: Number(r.available_balance),
        pending_balance: Number(r.pending_balance),
        lifetime_credits: Number(r.lifetime_credits),
        lifetime_debits: Number(r.lifetime_debits),
      }));
    },
  });
}

/** Append-only ledger history for the signed-in user. */
export function useWalletLedger(limit = 25) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["wallet-ledger", user?.id, limit],
    enabled: Boolean(user?.id),
    staleTime: 30_000,
    queryFn: async (): Promise<WalletLedgerEntry[]> => {
      const { data, error } = await supabase
        .from("wallet_ledger_entries")
        .select(
          "id, direction, amount, currency, entry_type, status, balance_after, description, provider, provider_reference, reference_table, reference_id, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ...r,
        amount: Number(r.amount),
        balance_after: Number(r.balance_after),
      })) as WalletLedgerEntry[];
    },
  });
}

export const LEDGER_TYPE_LABELS: Record<string, string> = {
  rental_payment: "Rental payment",
  security_deposit: "Security deposit",
  deposit_refund: "Deposit refund",
  platform_fee: "Platform fee",
  owner_share: "Owner share",
  subscription_training: "Driver training",
  subscription_insurance: "Insurance",
  subscription_roadside: "Roadside support",
  payout: "Payout",
  payout_reversal: "Payout reversed",
  refund: "Refund",
  late_fee: "Late fee",
  adjustment: "Adjustment",
};
