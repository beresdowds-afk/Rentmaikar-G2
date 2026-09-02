import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getDeviceFingerprint, getUserAgentSummary } from "@/lib/device-fingerprint";

export type WithdrawalRequestType = "owner_payout" | "platform_withdrawal" | "treasury_transfer";
export type WithdrawalAuthStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "consumed"
  | "cancelled";

export interface WithdrawalRisk {
  score: number;
  level: "low" | "medium" | "high";
  flags: string[];
  requires_dual_auth: boolean;
  available_balance: number | null;
  window: { count_1h: number; count_24h: number; sum_24h: number };
}

export interface WithdrawalAuthorization {
  id: string;
  request_type: WithdrawalRequestType;
  requested_by: string;
  subject_user_id: string;
  subject_name?: string | null;
  subject_email?: string | null;
  amount: number;
  currency: string;
  destination_ref: string | null;
  device_fingerprint: string | null;
  risk_score: number;
  risk_flags: string[];
  requires_dual_auth: boolean;
  status: WithdrawalAuthStatus;
  approved_by: string | null;
  approved_at: string | null;
  decision_reason: string | null;
  expires_at: string;
  created_at: string;
}

export const RISK_FLAG_LABELS: Record<string, string> = {
  VELOCITY_HOURLY: "3+ requests in the last hour",
  VELOCITY_DAILY: "5+ requests in 24 hours",
  AMOUNT_ANOMALY: "Amount far above this user's average",
  LARGE_AMOUNT: "Large withdrawal amount",
  DAILY_TOTAL_HIGH: "High 24-hour withdrawal total",
  DEVICE_UNKNOWN: "No device fingerprint supplied",
  DEVICE_NEW: "New or unrecognised device",
  INSUFFICIENT_LEDGER_BALANCE: "Ledger balance does not cover this amount",
  PLATFORM_TREASURY: "Platform treasury movement",
};

/**
 * Fire-and-forget lifecycle notification for a withdrawal.
 * Failures never block the money-movement flow.
 */
export async function notifyWithdrawal(input: {
  event: "requested" | "pending_approval" | "approved" | "rejected";
  amount: number;
  currency: string;
  ownerId?: string | null;
  authorizationId?: string | null;
  reason?: string | null;
}): Promise<void> {
  try {
    await supabase.functions.invoke("notify-withdrawal", {
      body: {
        event: input.event,
        amount: input.amount,
        currency: input.currency,
        ownerId: input.ownerId ?? undefined,
        authorizationId: input.authorizationId ?? undefined,
        reason: input.reason ?? undefined,
      },
    });
  } catch (error) {
    console.warn("[withdrawal] notification failed", error);
  }
}

/** Request a (possibly dual-authorized) withdrawal approval. */
export function useRequestWithdrawalAuthorization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      requestType: WithdrawalRequestType;
      amount: number;
      currency: "USD" | "NGN" | (string & {});
      subjectUserId?: string | null;
      destinationRef?: string | null;
      metadata?: Record<string, unknown>;
    }) => {
      const fingerprint = await getDeviceFingerprint();
      const { data, error } = await supabase.rpc("request_withdrawal_authorization" as never, {
        _request_type: input.requestType,
        _amount: input.amount,
        _currency: input.currency,
        _subject_user_id: input.subjectUserId ?? null,
        _destination_ref: input.destinationRef ?? null,
        _device_fingerprint: fingerprint,
        _user_agent: getUserAgentSummary(),
        _metadata: (input.metadata ?? {}) as never,
      } as never);
      if (error) throw error;
      const authorization = data as unknown as {
        id: string;
        status: WithdrawalAuthStatus;
        requires_dual_auth: boolean;
        risk: WithdrawalRisk;
      };
      // Lifecycle notification: initiation, and the extra "awaiting approval"
      // step when the risk engine escalates to dual authorization.
      void notifyWithdrawal({
        event: authorization.requires_dual_auth && authorization.status === "pending"
          ? "pending_approval"
          : "requested",
        amount: input.amount,
        currency: input.currency,
        ownerId: input.subjectUserId ?? undefined,
        authorizationId: authorization.id,
      });
      return authorization;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["withdrawal-authorizations"] });
      queryClient.invalidateQueries({ queryKey: ["my-withdrawal-authorizations"] });
    },
  });
}

/** Poll a single authorization so the UI unlocks as soon as an admin approves. */
export function useWithdrawalAuthorization(id: string | null) {
  return useQuery({
    queryKey: ["withdrawal-authorization", id],
    enabled: Boolean(id),
    refetchInterval: 10_000,
    queryFn: async (): Promise<WithdrawalAuthorization | null> => {
      const { data, error } = await supabase
        .from("withdrawal_authorizations" as never)
        .select("*")
        .eq("id", id as string)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as WithdrawalAuthorization) ?? null;
    },
  });
}

/** The signed-in user's own recent authorization requests. */
export function useMyWithdrawalAuthorizations(limit = 10) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-withdrawal-authorizations", user?.id, limit],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<WithdrawalAuthorization[]> => {
      const { data, error } = await supabase
        .from("withdrawal_authorizations" as never)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as WithdrawalAuthorization[];
    },
  });
}

/** Admin queue of authorization requests. */
export function useWithdrawalAuthorizationQueue(status: WithdrawalAuthStatus | "all" = "pending") {
  return useQuery({
    queryKey: ["withdrawal-authorizations", status],
    refetchInterval: 20_000,
    queryFn: async (): Promise<WithdrawalAuthorization[]> => {
      const { data, error } = await supabase.rpc("admin_list_withdrawal_authorizations" as never, {
        _status: status === "all" ? null : status,
        _limit: 100,
      } as never);
      if (error) throw error;
      return (data ?? []) as unknown as WithdrawalAuthorization[];
    },
  });
}

export function useDecideWithdrawalAuthorization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      decision: "approved" | "rejected";
      reason?: string;
      subjectUserId?: string;
      amount?: number;
      currency?: string;
    }) => {
      const { data, error } = await supabase.rpc("decide_withdrawal_authorization" as never, {
        _id: input.id,
        _decision: input.decision,
        _reason: input.reason ?? null,
      } as never);
      if (error) throw error;
      const result = data as unknown as { ok: boolean; error?: string };
      if (!result?.ok) throw new Error(result?.error ?? "Decision failed");
      if (input.subjectUserId && input.amount != null && input.currency) {
        void notifyWithdrawal({
          event: input.decision,
          amount: input.amount,
          currency: input.currency,
          ownerId: input.subjectUserId,
          authorizationId: input.id,
          reason: input.reason ?? null,
        });
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["withdrawal-authorizations"] });
    },
  });
}

/** Preview risk without persisting a request (used for inline warnings). */
export function useWithdrawalRiskPreview() {
  return useCallback(
    async (userId: string, amount: number, currency: string, requestType: WithdrawalRequestType) => {
      const fingerprint = await getDeviceFingerprint();
      const { data, error } = await supabase.rpc("evaluate_withdrawal_risk" as never, {
        _user_id: userId,
        _amount: amount,
        _currency: currency,
        _device_fingerprint: fingerprint,
        _request_type: requestType,
      } as never);
      if (error) throw error;
      return data as unknown as WithdrawalRisk;
    },
    [],
  );
}
