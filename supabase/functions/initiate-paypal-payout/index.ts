// deno-lint-ignore-file no-explicit-any
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { claimIdempotencyKey, completeIdempotencyKey, duplicateResponse, resolveIdempotencyKey } from "../_shared/payment-idempotency.ts";
import { postLedgerEntry } from "../_shared/wallet-ledger.ts";
import { describeError, getPayPalConfig, PayPalError, payPalRequest,
  ensurePayPalConfig,
} from "../_shared/paypal-client.ts";
import {
  consumeWithdrawalAuthorization,
  requireWithdrawalAuthorization,
  transitionState,
} from "../_shared/withdrawal-authorization.ts";
import { notifyWithdrawalEvent } from "../_shared/withdrawal-notify.ts";
import { requireVerifiedPhone } from "../_shared/verified-phone.ts";


const BodySchema = z.object({
  amount: z.number().positive(),
  payoutAccountId: z.string().uuid(),
  note: z.string().max(255).optional(),
  authorizationId: z.string().uuid(),
});


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

    // Compulsory for withdrawals (but never for SMS/WhatsApp messaging).
    const phoneCheck = await requireVerifiedPhone(supabase, owner.id);
    if (!phoneCheck.ok) return json({ error: phoneCheck.error }, phoneCheck.status ?? 428);

    const rawBody = await req.json();
    const parsed = BodySchema.safeParse(rawBody);
    if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
    const b = parsed.data;

    const idemKey = resolveIdempotencyKey(req, rawBody ?? {});
    const claim = await claimIdempotencyKey(supabase, idemKey, "payout.paypal", owner.id, {
      amount: b.amount, payoutAccountId: b.payoutAccountId,
    });
    if (!claim.claimed) return duplicateResponse(claim, corsHeaders);

    const { data: acc } = await supabase.from("owner_payout_accounts")
      .select("*").eq("id", b.payoutAccountId).eq("owner_id", owner.id).maybeSingle();
    if (!acc || acc.provider !== "paypal" || !acc.paypal_email) {
      return json({ error: "Invalid PayPal payout account" }, 400);
    }

    // Enforce minimum, precision, and available-balance guardrails.
    if (b.amount < 1) return json({ error: "Amount below minimum payout" }, 400);
    if (Math.round(b.amount * 100) !== b.amount * 100) {
      return json({ error: "Amount must have at most 2 decimals" }, 400);
    }

    const { data: balanceRow, error: balanceErr } = await supabase.rpc(
      "get_owner_available_balance",
      { _owner_id: owner.id, _currency: "USD" },
    );
    if (balanceErr) {
      console.error("[initiate-paypal-payout] balance rpc error:", balanceErr);
      return json({ error: "Failed to verify balance" }, 500);
    }
    const available = Number(balanceRow ?? 0);
    if (b.amount > available) {
      return json({ error: "Amount exceeds available balance", available }, 400);
    }

    // Dual authorization + velocity/device-risk gate.
    const authz = await requireWithdrawalAuthorization(supabase, {
      authorizationId: b.authorizationId,
      subjectUserId: owner.id,
      amount: b.amount,
      currency: "USD",
      requestType: "owner_payout",
    });
    if (!authz.ok) {
      await completeIdempotencyKey(supabase, idemKey, "failed", { error: authz.error });
      return json({ error: authz.error }, authz.status ?? 403);
    }

    const { count } = await supabase.from("owner_payouts")
      .select("*", { count: "exact", head: true })
      .eq("owner_id", owner.id).in("status", ["pending", "authorized", "captured", "processing"]);
    if ((count ?? 0) > 0) return json({ error: "A payout is already in progress" }, 409);

    const reference = `pyt_${crypto.randomUUID().replace(/-/g, "")}`;

    // Create the payout in the canonical Pending state before touching the PSP.
    const { data: payout } = await supabase.from("owner_payouts").insert({
      owner_id: owner.id, payout_account_id: acc.id, provider: "paypal",
      amount: b.amount, currency: "USD", status: "pending",
      transfer_reference: reference, initiated_by: "owner",
    }).select("*").maybeSingle();

    if (!payout?.id) {
      await completeIdempotencyKey(supabase, idemKey, "failed");
      return json({ error: "Could not create payout record" }, 500);
    }

    await transitionState(supabase, "payout", payout.id, "authorized", "dual authorization approved", {
      authorization_id: authz.authorizationId,
    });
    await consumeWithdrawalAuthorization(supabase, authz.authorizationId!, payout.id);
    await notifyWithdrawalEvent(supabase, {
      event: "approved", ownerId: owner.id, amount: b.amount, currency: "USD",
      provider: "paypal", payoutId: payout.id, authorizationId: authz.authorizationId,
      destination: acc.paypal_email,
    });

    // `sender_batch_id` plus `PayPal-Request-Id` both carry the same unique
    // reference, so a retried request can never disburse the money twice.
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
      const isAuth = e instanceof PayPalError && (e.status === 401 || e.status === 403);
      const message = e instanceof PayPalError
        ? (describeError(e.body) ?? e.message)
        : "Could not reach PayPal";
      await transitionState(
        supabase, "payout", payout.id, "failed",
        isAuth ? "PayPal auth failed" : message,
      );
      await supabase.from("owner_payouts")
        .update({
          failure_reason: message,
          raw_payload: e instanceof PayPalError ? e.body : { error: message },
        })
        .eq("id", payout.id);
      await completeIdempotencyKey(supabase, idemKey, "failed");
      await notifyWithdrawalEvent(supabase, {
        event: "failed", ownerId: owner.id, amount: b.amount, currency: "USD",
        provider: "paypal", payoutId: payout.id, reason: message,
      });
      return json({ error: message }, 502);
    }


    const batchStatus = payoutBody?.batch_header?.batch_status ?? "PENDING";

    await supabase.from("owner_payouts").update({
      transfer_code: payoutBody?.batch_header?.payout_batch_id,
      raw_payload: payoutBody,
    }).eq("id", payout.id);

    await transitionState(supabase, "payout", payout.id, "captured", "payout batch submitted to PayPal");
    if (batchStatus === "SUCCESS") {
      await transitionState(supabase, "payout", payout.id, "settled", "PayPal batch success");
      await transitionState(supabase, "payout", payout.id, "completed", "payout complete");
      await notifyWithdrawalEvent(supabase, {
        event: "completed", ownerId: owner.id, amount: b.amount, currency: "USD",
        provider: "paypal", payoutId: payout.id, destination: acc.paypal_email,
      });
    } else if (batchStatus === "DENIED") {
      await transitionState(supabase, "payout", payout.id, "failed", "PayPal denied the batch");
      await notifyWithdrawalEvent(supabase, {
        event: "failed", ownerId: owner.id, amount: b.amount, currency: "USD",
        provider: "paypal", payoutId: payout.id, reason: "PayPal denied the payout batch",
      });
    } else {
      await notifyWithdrawalEvent(supabase, {
        event: "submitted", ownerId: owner.id, amount: b.amount, currency: "USD",
        provider: "paypal", payoutId: payout.id, destination: acc.paypal_email,
      });
    }

    const led = await postLedgerEntry(supabase, {
      userId: owner.id,
      accountType: "owner",
      currency: "USD",
      direction: "debit",
      amount: b.amount,
      entryType: "payout",
      idempotencyKey: `payout:${payout.id}:requested`,
      referenceTable: "owner_payouts",
      referenceId: payout.id,
      provider: "paypal",
      providerReference: reference,
      description: "Owner payout requested",
      status: batchStatus === "SUCCESS" ? "posted" : "pending",
    });
    if (!led.ok) console.error("[initiate-paypal-payout] ledger error:", led.error);

    const { data: finalPayout } = await supabase.from("owner_payouts")
      .select("*").eq("id", payout.id).maybeSingle();

    await completeIdempotencyKey(supabase, idemKey, "succeeded", { payout: finalPayout });
    return json({ payout: finalPayout });

  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "unknown" }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
