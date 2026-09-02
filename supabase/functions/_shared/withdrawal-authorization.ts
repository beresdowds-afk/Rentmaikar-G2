// Shared enforcement for withdrawal dual-authorization.
//
// Every payout/withdrawal edge function must present an approved
// withdrawal_authorizations row before money moves. Approvals are single-use,
// expire after 24h, and are bound to the beneficiary, amount and currency.
// deno-lint-ignore-file no-explicit-any

export interface AuthorizationCheck {
  ok: boolean;
  status?: number;
  error?: string;
  authorizationId?: string;
}

export async function requireWithdrawalAuthorization(
  supabase: any,
  args: {
    authorizationId?: string | null;
    subjectUserId: string;
    amount: number;
    currency: string;
    requestType?: "owner_payout" | "platform_withdrawal" | "treasury_transfer";
  },
): Promise<AuthorizationCheck> {
  if (!args.authorizationId) {
    return { ok: false, status: 428, error: "withdrawal authorization required" };
  }

  const { data, error } = await supabase
    .from("withdrawal_authorizations")
    .select("*")
    .eq("id", args.authorizationId)
    .maybeSingle();

  if (error) return { ok: false, status: 500, error: error.message };
  if (!data) return { ok: false, status: 404, error: "authorization not found" };
  if (data.subject_user_id !== args.subjectUserId) {
    return { ok: false, status: 403, error: "authorization belongs to another user" };
  }
  if (args.requestType && data.request_type !== args.requestType) {
    return { ok: false, status: 400, error: "authorization type mismatch" };
  }
  if (Math.abs(Number(data.amount) - args.amount) > 0.009) {
    return { ok: false, status: 409, error: "authorization amount mismatch" };
  }
  if (String(data.currency).toUpperCase() !== args.currency.toUpperCase()) {
    return { ok: false, status: 409, error: "authorization currency mismatch" };
  }
  if (data.status !== "approved") {
    return { ok: false, status: 409, error: `authorization is ${data.status}` };
  }
  if (new Date(data.expires_at).getTime() < Date.now()) {
    return { ok: false, status: 409, error: "authorization expired" };
  }

  return { ok: true, authorizationId: data.id };
}

export async function consumeWithdrawalAuthorization(
  supabase: any,
  authorizationId: string,
  reference?: string | null,
): Promise<void> {
  const { error } = await supabase.rpc("consume_withdrawal_authorization", {
    _id: authorizationId,
    _reference: reference ?? null,
  });
  if (error) console.error("[withdrawal-authorization] consume failed:", error.message);
}

/** Move a payment/payout through the canonical state machine. */
export async function transitionState(
  supabase: any,
  entity: "payment" | "payout",
  entityId: string,
  toState:
    | "pending"
    | "authorized"
    | "captured"
    | "settled"
    | "available"
    | "completed"
    | "failed"
    | "refunded"
    | "disputed",
  reason?: string,
  metadata?: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc("transition_payment_state", {
    _entity: entity,
    _entity_id: entityId,
    _to_state: toState,
    _reason: reason ?? null,
    _metadata: metadata ?? {},
  });
  if (error) {
    console.error(`[state-machine] ${entity} ${entityId} -> ${toState} failed:`, error.message);
    return { ok: false, error: error.message };
  }
  if (data && data.ok === false) {
    console.error(`[state-machine] rejected ${entity} ${entityId} -> ${toState}:`, data.error);
    return { ok: false, error: data.error };
  }
  return { ok: true };
}
