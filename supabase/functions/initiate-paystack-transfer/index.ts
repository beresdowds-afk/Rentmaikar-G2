// deno-lint-ignore-file no-explicit-any
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { claimIdempotencyKey, completeIdempotencyKey, duplicateResponse, resolveIdempotencyKey } from "../_shared/payment-idempotency.ts";
import { postLedgerEntry } from "../_shared/wallet-ledger.ts";
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
  reason: z.string().max(100).optional(),
  authorizationId: z.string().uuid(),
});


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

    // Compulsory for withdrawals (but never for SMS/WhatsApp messaging).
    const phoneCheck = await requireVerifiedPhone(supabase, owner.id);
    if (!phoneCheck.ok) return json({ error: phoneCheck.error }, phoneCheck.status ?? 428);

    const rawBody = await req.json();
    const parsed = BodySchema.safeParse(rawBody);
    if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
    const b = parsed.data;

    // Request-level idempotency: the same key can never trigger two transfers.
    const idemKey = resolveIdempotencyKey(req, rawBody ?? {});
    const claim = await claimIdempotencyKey(supabase, idemKey, "payout.paystack", owner.id, {
      amount: b.amount, payoutAccountId: b.payoutAccountId,
    });
    if (!claim.claimed) return duplicateResponse(claim, corsHeaders);

    const { data: acc } = await supabase.from("owner_payout_accounts")
      .select("*").eq("id", b.payoutAccountId).eq("owner_id", owner.id).maybeSingle();
    if (!acc || acc.provider !== "paystack" || !acc.recipient_code) {
      return json({ error: "Invalid Paystack payout account" }, 400);
    }

    // Enforce minimum, precision, and available-balance guardrails.
    if (b.amount < 1) return json({ error: "Amount below minimum payout" }, 400);
    if (Math.round(b.amount * 100) !== b.amount * 100) {
      return json({ error: "Amount must have at most 2 decimals" }, 400);
    }

    const { data: balanceRow, error: balanceErr } = await supabase.rpc(
      "get_owner_available_balance",
      { _owner_id: owner.id, _currency: acc.currency },
    );
    if (balanceErr) {
      console.error("[initiate-paystack-transfer] balance rpc error:", balanceErr);
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
      currency: acc.currency,
      requestType: "owner_payout",
    });
    if (!authz.ok) {
      await completeIdempotencyKey(supabase, idemKey, "failed", { error: authz.error });
      return json({ error: authz.error }, authz.status ?? 403);
    }

    // Guard against duplicate in-flight
    const { count } = await supabase.from("owner_payouts")
      .select("*", { count: "exact", head: true })
      .eq("owner_id", owner.id).in("status", ["pending", "authorized", "captured", "processing"]);
    if ((count ?? 0) > 0) return json({ error: "A payout is already in progress" }, 409);

    const reference = `pyt_${crypto.randomUUID().replace(/-/g, "")}`;
    const amountMinor = Math.round(b.amount * 100);

    // Create the payout in the canonical Pending state before touching the PSP.
    const { data: payout } = await supabase.from("owner_payouts").insert({
      owner_id: owner.id, payout_account_id: acc.id, provider: "paystack",
      amount: b.amount, currency: acc.currency,
      status: "pending",
      transfer_reference: reference,
      initiated_by: "owner",
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
      event: "approved", ownerId: owner.id, amount: b.amount, currency: acc.currency,
      provider: "paystack", payoutId: payout.id, authorizationId: authz.authorizationId,
      destination: acc.bank_name ?? "your bank account",
    });

    const resp = await fetch("https://api.paystack.co/transfer", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "balance", amount: amountMinor, currency: acc.currency,
        recipient: acc.recipient_code, reason: b.reason ?? "RentMaikar owner payout", reference,
      }),
    });
    const body = await resp.json();
    if (!resp.ok || !body?.status) {
      await transitionState(supabase, "payout", payout.id, "failed", body?.message ?? "transfer failed");
      await supabase.from("owner_payouts")
        .update({ failure_reason: body?.message ?? "transfer failed", raw_payload: body ?? null })
        .eq("id", payout.id);
      await completeIdempotencyKey(supabase, idemKey, "failed");
      await notifyWithdrawalEvent(supabase, {
        event: "failed", ownerId: owner.id, amount: b.amount, currency: acc.currency,
        provider: "paystack", payoutId: payout.id,
        reason: body?.message ?? "transfer failed",
      });
      return json({ error: body?.message ?? "transfer failed" }, 502);
    }

    await supabase.from("owner_payouts")
      .update({ transfer_code: body.data.transfer_code, raw_payload: body.data })
      .eq("id", payout.id);
    await transitionState(supabase, "payout", payout.id, "captured", "transfer submitted to Paystack");
    if (body.data.status === "success") {
      await transitionState(supabase, "payout", payout.id, "settled", "Paystack reported success");
      await transitionState(supabase, "payout", payout.id, "completed", "payout complete");
      await notifyWithdrawalEvent(supabase, {
        event: "completed", ownerId: owner.id, amount: b.amount, currency: acc.currency,
        provider: "paystack", payoutId: payout.id,
        destination: acc.bank_name ?? "your bank account",
      });
    } else {
      await notifyWithdrawalEvent(supabase, {
        event: "submitted", ownerId: owner.id, amount: b.amount, currency: acc.currency,
        provider: "paystack", payoutId: payout.id,
        destination: acc.bank_name ?? "your bank account",
      });
    }

    // Ledger: reserve the payout against the owner wallet immediately; the
    // webhook flips it to settled or reverses it on failure.
    const led = await postLedgerEntry(supabase, {
      userId: owner.id,
      accountType: "owner",
      currency: acc.currency,
      direction: "debit",
      amount: b.amount,
      entryType: "payout",
      idempotencyKey: `payout:${payout.id}:requested`,
      referenceTable: "owner_payouts",
      referenceId: payout.id,
      provider: "paystack",
      providerReference: reference,
      description: "Owner payout requested",
      status: "pending",
    });
    if (!led.ok) console.error("[initiate-paystack-transfer] ledger error:", led.error);

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
