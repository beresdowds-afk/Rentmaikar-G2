// deno-lint-ignore-file no-explicit-any
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { requireAuthenticatedUser } from "../_shared/auth-guards.ts";
import { syncPaymentStatus } from "../_shared/payment-status-sync.ts";

const BodySchema = z.object({ reference: z.string().min(6).max(128) });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Require an authenticated caller AND require them to be the driver on
  // the transaction they're verifying. Prevents anonymous enumeration and
  // status-flipping on other users' payments.
  const authRes = await requireAuthenticatedUser(req);
  if (authRes instanceof Response) return authRes;
  const userId = authRes.userId;

  try {
    const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!secret) return json({ error: "Paystack not configured" }, 503);

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
    const { reference } = parsed.data;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: ownTx } = await supabase.from("paystack_transactions")
      .select("driver_id").eq("reference", reference).maybeSingle();
    if (ownTx && ownTx.driver_id && ownTx.driver_id !== userId) {
      return json({ error: "Forbidden" }, 403);
    }

    const resp = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const body = await resp.json();
    if (!resp.ok || !body?.status) return json({ error: body?.message ?? "verify failed" }, 502);

    const data = body.data;
    const success = data.status === "success";
    const status = success ? "completed" : data.status === "failed" ? "failed" : "pending";
    const failureReason = success ? null : data.gateway_response ?? null;

    await supabase.from("paystack_transactions").update({
      status,
      channel: data.channel,
      gateway_response: data.gateway_response,
      failure_reason: failureReason,
      raw_payload: data,
    }).eq("reference", reference);

    const { data: tx } = await supabase.from("paystack_transactions")
      .select("payment_id").eq("reference", reference).maybeSingle();

    if (tx?.payment_id) {
      await syncPaymentStatus(supabase, {
        paymentId: tx.payment_id, status, failureReason: failureReason,
      });

    }

    return json({ status, reference, payment_id: tx?.payment_id ?? null });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "unknown" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
