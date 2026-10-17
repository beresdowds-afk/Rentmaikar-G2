// deno-lint-ignore-file no-explicit-any
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { resolveIdempotencyKey } from "../_shared/payment-idempotency.ts";
import { notifyWithdrawalEvent } from "../_shared/withdrawal-notify.ts";
import { requireVerifiedPhone } from "../_shared/verified-phone.ts";

const BodySchema = z.object({
  amount: z.number().positive(),
  payoutAccountId: z.string().uuid(),
  reason: z.string().max(100).optional(),
  authorizationId: z.string().uuid(),
});

const CODE_STATUS: Record<string, number> = {
  invalid_request: 400,
  invalid_amount: 400,
  invalid_provider: 400,
  invalid_idempotency_key: 400,
  invalid_account: 400,
  authorization_not_found: 403,
  authorization_wrong_owner: 403,
  authorization_type_mismatch: 403,
  authorization_not_approved: 403,
  authorization_expired: 403,
  authorization_amount_mismatch: 403,
  authorization_currency_mismatch: 403,
  insufficient_balance: 400,
  payout_in_progress: 409,
  idempotency_conflict: 409,
};

/*
 * Lifecycle (identical invariants to the PayPal path in paymentService.ts):
 *  1. create_owner_self_withdrawal atomically validates + consumes the
 *     authorization, creates the canonical payout under a unique idempotency
 *     key and reserves the wallet.
 *  2. claim_owner_payout_provider_attempt allows exactly one provider call.
 *  3. Paystack is called (reference = the payout transfer_reference, which
 *     Paystack uses to reject duplicate transfers).
 *  4. A submission is recorded as `captured` only; settlement comes from the
 *     verified transfer.success webhook / status lookup.
 *  Ambiguous outcomes keep funds reserved and flag reconciliation.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!secret) return json({ error: "Paystack not configured" }, 503);

    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthenticated" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: u } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    const owner = u?.user;
    if (!owner) return json({ error: "Unauthenticated" }, 401);

    const phoneCheck = await requireVerifiedPhone(supabase, owner.id);
    if (!phoneCheck.ok) return json({ error: phoneCheck.error }, phoneCheck.status ?? 428);

    const rawBody = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(rawBody);
    if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
    const b = parsed.data;

    const idemKey = resolveIdempotencyKey(req, rawBody ?? {});
    if (!idemKey) return json({ error: "Idempotency-Key is required" }, 400);

    const { data: acc } = await supabase.from("owner_payout_accounts")
      .select("id, provider, currency, recipient_code, bank_name")
      .eq("id", b.payoutAccountId).eq("owner_id", owner.id).maybeSingle();
    if (!acc || acc.provider !== "paystack" || !acc.recipient_code) {
      return json({ error: "Invalid Paystack payout account" }, 400);
    }
    if (b.amount < 1) return json({ error: "Amount below minimum payout" }, 400);

    const { data: created, error: createErr } = await supabase.rpc("create_owner_self_withdrawal", {
      _owner_id: owner.id,
      _authorization_id: b.authorizationId,
      _payout_account_id: acc.id,
      _amount: b.amount,
      _currency: acc.currency,
      _provider: "paystack",
      _idempotency_key: idemKey,
    });
    if (createErr) {
      console.error("[initiate-paystack-transfer] create rpc error:", createErr.message);
      return json({ error: "Could not create payout" }, 500);
    }
    if (!created?.ok) {
      return json({ error: created?.error ?? "Withdrawal rejected", code: created?.code },
        CODE_STATUS[created?.code] ?? 400);
    }

    const payoutId: string = created.payout_id;
    const reference: string = created.transfer_reference;

    // A replay returns the existing payout and never calls the provider again.
    if (created.duplicate) {
      return json({ payout: await loadPayout(supabase, payoutId), duplicate: true });
    }

    const { data: claim } = await supabase.rpc("claim_owner_payout_provider_attempt", { _payout_id: payoutId });
    if (!claim?.claimed) {
      return json({ payout: await loadPayout(supabase, payoutId), duplicate: true });
    }

    await notifyWithdrawalEvent(supabase, {
      event: "approved", ownerId: owner.id, amount: b.amount, currency: acc.currency,
      provider: "paystack", payoutId, authorizationId: b.authorizationId,
      destination: acc.bank_name ?? "your bank account",
    }).catch(() => undefined);

    let resp: Response;
    try {
      resp = await fetch("https://api.paystack.co/transfer", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source: "balance",
          amount: Math.round(b.amount * 100),
          currency: acc.currency,
          recipient: acc.recipient_code,
          reason: b.reason ?? "RentMaikar owner payout",
          reference,
        }),
      });
    } catch (netErr) {
      // The request may have reached Paystack: keep funds reserved.
      await supabase.rpc("mark_owner_payout_reconciliation_required", {
        _payout_id: payoutId,
        _reason: "Paystack request outcome unknown (network error/timeout)",
        _payload: { error: netErr instanceof Error ? netErr.message : "network error" },
      });
      return json({ payout: await loadPayout(supabase, payoutId), reconciliation_required: true }, 202);
    }

    const providerBody = await resp.json().catch(() => null);

    if (resp.ok && providerBody?.status === true && providerBody?.data) {
      await supabase.rpc("record_owner_payout_submitted", {
        _payout_id: payoutId,
        _transfer_code: providerBody.data.transfer_code ?? null,
        _provider_status: providerBody.data.status ?? null,
        _payload: providerBody.data,
      });
      // Not settled here: completion comes only from verified provider evidence.
      await notifyWithdrawalEvent(supabase, {
        event: "submitted", ownerId: owner.id, amount: b.amount, currency: acc.currency,
        provider: "paystack", payoutId, destination: acc.bank_name ?? "your bank account",
      }).catch(() => undefined);
      return json({ payout: await loadPayout(supabase, payoutId) });
    }

    if (resp.status >= 400 && resp.status < 500 && providerBody?.status === false) {
      const reason = String(providerBody?.message ?? "Paystack rejected the transfer").slice(0, 300);
      const { data: fin } = await supabase.rpc("finalize_owner_payout", {
        _payout_id: payoutId,
        _outcome: "failed",
        _provider: "paystack",
        _evidence: { source: "initiate", http_status: resp.status, message: reason },
      });
      if (!fin?.ok) {
        await supabase.rpc("mark_owner_payout_reconciliation_required", {
          _payout_id: payoutId, _reason: "Failed to release reservation after rejection",
          _payload: { message: reason },
        });
      }
      await notifyWithdrawalEvent(supabase, {
        event: "failed", ownerId: owner.id, amount: b.amount, currency: acc.currency,
        provider: "paystack", payoutId, reason,
      }).catch(() => undefined);
      return json({ error: reason, payout: await loadPayout(supabase, payoutId) }, 502);
    }

    // 5xx, malformed or incomplete response: Paystack may have accepted it.
    await supabase.rpc("mark_owner_payout_reconciliation_required", {
      _payout_id: payoutId,
      _reason: `Paystack response ambiguous (HTTP ${resp.status})`,
      _payload: providerBody ?? null,
    });
    return json({ payout: await loadPayout(supabase, payoutId), reconciliation_required: true }, 202);
  } catch (err) {
    console.error("[initiate-paystack-transfer] unexpected error:", err);
    return json({ error: "unknown" }, 500);
  }
});

async function loadPayout(supabase: any, id: string) {
  const { data } = await supabase.from("owner_payouts")
    .select("id, status, workflow_type, amount, currency, provider, transfer_reference, transfer_code, reconciliation_required, reconciliation_reason, created_at")
    .eq("id", id).maybeSingle();
  return data;
}

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
