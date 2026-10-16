// deno-lint-ignore-file no-explicit-any
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { resolveIdempotencyKey } from "../_shared/payment-idempotency.ts";
import { describeError, getPayPalConfig, PayPalError, payPalRequest, ensurePayPalConfig } from "../_shared/paypal-client.ts";
import { notifyWithdrawalEvent } from "../_shared/withdrawal-notify.ts";
import { requireVerifiedPhone } from "../_shared/verified-phone.ts";

const BodySchema = z.object({
  amount: z.number().positive(),
  payoutAccountId: z.string().uuid(),
  note: z.string().max(255).optional(),
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
 * Same lifecycle and invariants as initiate-paystack-transfer and
 * paymentService.processPayPalOwnerPayout: atomic authorization consumption +
 * reservation, exactly one provider attempt, submission != settlement.
 * PayPal-Request-Id and sender_batch_id both carry the payout's persisted
 * transfer_reference, so PayPal itself de-duplicates repeated submissions.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    await ensurePayPalConfig();
    const cfg = getPayPalConfig();
    if (!cfg) return json({ error: "PayPal not configured" }, 503);

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
      .select("id, provider, currency, paypal_email")
      .eq("id", b.payoutAccountId).eq("owner_id", owner.id).maybeSingle();
    if (!acc || acc.provider !== "paypal" || !acc.paypal_email) {
      return json({ error: "Invalid PayPal payout account" }, 400);
    }
    if (b.amount < 1) return json({ error: "Amount below minimum payout" }, 400);

    const { data: created, error: createErr } = await supabase.rpc("create_owner_self_withdrawal", {
      _owner_id: owner.id,
      _authorization_id: b.authorizationId,
      _payout_account_id: acc.id,
      _amount: b.amount,
      _currency: "USD",
      _provider: "paypal",
      _idempotency_key: idemKey,
    });
    if (createErr) {
      console.error("[initiate-paypal-payout] create rpc error:", createErr.message);
      return json({ error: "Could not create payout" }, 500);
    }
    if (!created?.ok) {
      return json({ error: created?.error ?? "Withdrawal rejected", code: created?.code },
        CODE_STATUS[created?.code] ?? 400);
    }

    const payoutId: string = created.payout_id;
    const reference: string = created.transfer_reference;

    if (created.duplicate) {
      return json({ payout: await loadPayout(supabase, payoutId), duplicate: true });
    }

    const { data: claim } = await supabase.rpc("claim_owner_payout_provider_attempt", { _payout_id: payoutId });
    if (!claim?.claimed) {
      return json({ payout: await loadPayout(supabase, payoutId), duplicate: true });
    }

    await notifyWithdrawalEvent(supabase, {
      event: "approved", ownerId: owner.id, amount: b.amount, currency: "USD",
      provider: "paypal", payoutId, authorizationId: b.authorizationId,
      destination: acc.paypal_email,
    }).catch(() => undefined);

    let payoutBody: any;
    try {
      payoutBody = await payPalRequest<any>(cfg, "/v1/payments/payouts", {
        method: "POST",
        requestId: `payout:${reference}`,
        retries: 1,
        body: {
          sender_batch_header: {
            sender_batch_id: reference,
            email_subject: "RentMaikar payout",
            email_message: b.note ?? "Your RentMaikar owner earnings",
          },
          items: [{
            recipient_type: "EMAIL",
            amount: { value: b.amount.toFixed(2), currency: "USD" },
            receiver: acc.paypal_email,
            note: b.note ?? "RentMaikar owner payout",
            sender_item_id: reference,
          }],
        },
      });
    } catch (e) {
      // Only a PayPal 4xx response proves the batch was not created.
      const definitive = e instanceof PayPalError && e.status >= 400 && e.status < 500 && e.status !== 408;
      const message = e instanceof PayPalError
        ? (describeError(e.body) ?? e.message)
        : "Could not reach PayPal";
      if (!definitive) {
        await supabase.rpc("mark_owner_payout_reconciliation_required", {
          _payout_id: payoutId,
          _reason: "PayPal request outcome unknown",
          _payload: { error: message },
        });
        return json({ payout: await loadPayout(supabase, payoutId), reconciliation_required: true }, 202);
      }
      const { data: fin } = await supabase.rpc("finalize_owner_payout", {
        _payout_id: payoutId,
        _outcome: "failed",
        _provider: "paypal",
        _evidence: { source: "initiate", http_status: (e as PayPalError).status, message },
      });
      if (!fin?.ok) {
        await supabase.rpc("mark_owner_payout_reconciliation_required", {
          _payout_id: payoutId, _reason: "Failed to release reservation after rejection",
          _payload: { message },
        });
      }
      await notifyWithdrawalEvent(supabase, {
        event: "failed", ownerId: owner.id, amount: b.amount, currency: "USD",
        provider: "paypal", payoutId, reason: message,
      }).catch(() => undefined);
      return json({ error: message, payout: await loadPayout(supabase, payoutId) }, 502);
    }

    const batchId = payoutBody?.batch_header?.payout_batch_id;
    const batchStatus = payoutBody?.batch_header?.batch_status ?? null;
    if (!batchId) {
      await supabase.rpc("mark_owner_payout_reconciliation_required", {
        _payout_id: payoutId,
        _reason: "PayPal response did not include a payout batch id",
        _payload: payoutBody ?? null,
      });
      return json({ payout: await loadPayout(supabase, payoutId), reconciliation_required: true }, 202);
    }

    // A batch id is a submission, not settlement. Final status comes from the
    // verified PAYMENT.PAYOUTS-ITEM.* webhook or an authenticated status lookup.
    await supabase.rpc("record_owner_payout_submitted", {
      _payout_id: payoutId,
      _transfer_code: batchId,
      _provider_status: batchStatus,
      _payload: payoutBody,
    });
    await notifyWithdrawalEvent(supabase, {
      event: "submitted", ownerId: owner.id, amount: b.amount, currency: "USD",
      provider: "paypal", payoutId, destination: acc.paypal_email,
    }).catch(() => undefined);
    return json({ payout: await loadPayout(supabase, payoutId) });
  } catch (err) {
    console.error("[initiate-paypal-payout] unexpected error:", err);
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
