// deno-lint-ignore-file no-explicit-any
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { requireAuthenticatedUser } from "../_shared/auth-guards.ts";
import { syncPaymentStatus } from "../_shared/payment-status-sync.ts";
import {
  getOpayConfig,
  mapOpayStatus,
  opayFailureReason,
  queryCashierStatus,
  ensureOpayConfig,
} from "../_shared/opay-client.ts";

const BodySchema = z.object({ reference: z.string().min(6).max(128) });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Require an authenticated caller AND require them to be a party on the
  // transaction they're verifying. Prevents anonymous enumeration and
  // status-flipping attacks on other users' payments.
  const authRes = await requireAuthenticatedUser(req);
  if (authRes instanceof Response) return authRes;
  const userId = authRes.userId;

  try {
    await ensureOpayConfig();
    const cfg = getOpayConfig();
    if (!cfg) return json({ error: "Opay not configured" }, 503);

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
    const { reference } = parsed.data;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: ownTx } = await supabase.from("opay_transactions")
      .select("driver_id, status").eq("reference", reference).maybeSingle();
    if (ownTx && ownTx.driver_id && ownTx.driver_id !== userId) {
      return json({ error: "Forbidden" }, 403);
    }

    const result = await queryCashierStatus(reference, cfg);
    if (!result.ok) {
      return json({ error: result.message, code: result.code, retryable: result.retryable }, 502);
    }

    const opayStatus = String(result.data?.status ?? "PENDING");
    const status = mapOpayStatus(opayStatus);
    const failure = status === "failed"
      ? opayFailureReason(opayStatus, (result.data as any)?.failureReason ?? null)
      : null;

    // Never regress a terminal state (the webhook may have settled it already).
    const terminal = ownTx?.status === "completed" || ownTx?.status === "refunded";
    if (!terminal) {
      await supabase.from("opay_transactions").update({
        status, failure_reason: failure, raw_payload: result.data,
      }).eq("reference", reference);
    }

    const { data: tx } = await supabase.from("opay_transactions")
      .select("payment_id").eq("reference", reference).maybeSingle();
    if (tx?.payment_id && !terminal) {
      await syncPaymentStatus(supabase, {
        paymentId: tx.payment_id, status, failureReason: failure,
      });
    }

    return json({
      status: terminal ? ownTx?.status : status,
      opay_status: opayStatus,
      failure_reason: failure,
      reference,
      payment_id: tx?.payment_id ?? null,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "unknown" }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
