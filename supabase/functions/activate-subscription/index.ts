// Verifies a subscription payment with the PSP and activates the subscription.
// Auth required. User can only activate their own subscription.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const Body = z.object({
  plan_id: z.string().uuid(),
  reference: z.string().min(4).max(128),
  provider: z.enum(["paystack", "paypal"]),
});

function getPayPalBase(mode: string) {
  return mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthenticated" }, 401);

    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: u, error: uErr } = await supa.auth.getUser(auth.replace("Bearer ", ""));
    if (uErr || !u?.user) return json({ error: "Unauthenticated" }, 401);
    const userId = u.user.id;

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const { plan_id, reference, provider } = parsed.data;

    const { data: plan } = await supa
      .from("subscription_plans")
      .select("id,plan_type,price,currency,billing_interval,region,is_active")
      .eq("id", plan_id)
      .maybeSingle();
    if (!plan || !plan.is_active) return json({ error: "Plan not found or inactive" }, 404);

    // Verify with provider
    if (provider === "paystack") {
      const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
      if (!secret) return json({ error: "Paystack not configured" }, 503);
      const vr = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
        headers: { Authorization: `Bearer ${secret}` },
      });
      const body = await vr.json();
      if (!vr.ok || !body?.status) return json({ error: "Verification failed", details: body }, 502);
      const tx = body.data;
      const expectedMinor = Math.round(Number(plan.price) * 100);
      if (tx.status !== "success") return json({ error: `Payment status ${tx.status}` }, 402);
      if (tx.currency !== plan.currency) return json({ error: "Currency mismatch" }, 400);
      if (Number(tx.amount) < expectedMinor) return json({ error: "Amount mismatch" }, 400);
      const metaUser = tx?.metadata?.user_id;
      if (metaUser && metaUser !== userId) return json({ error: "Reference does not belong to caller" }, 403);
    } else {
      const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
      const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
      const mode = (Deno.env.get("PAYPAL_MODE") ?? "sandbox").toLowerCase();
      if (!clientId || !clientSecret) return json({ error: "PayPal not configured" }, 503);
      const base = getPayPalBase(mode);
      const tokRes = await fetch(`${base}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(`${clientId}:${clientSecret}`),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      });
      if (!tokRes.ok) return json({ error: "PayPal token error" }, 502);
      const { access_token } = await tokRes.json();

      // Try capture (idempotent-ish); if already captured, fetch order
      let order: Record<string, unknown> | null = null;
      const cap = await fetch(`${base}/v2/checkout/orders/${encodeURIComponent(reference)}/capture`, {
        method: "POST",
        headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json", Prefer: "return=representation" },
      });
      if (cap.ok) {
        order = await cap.json();
      } else {
        const get = await fetch(`${base}/v2/checkout/orders/${encodeURIComponent(reference)}`, {
          headers: { Authorization: `Bearer ${access_token}` },
        });
        if (!get.ok) return json({ error: "PayPal verification failed", details: await get.text() }, 502);
        order = await get.json();
      }
      if (!order || order.status !== "COMPLETED") return json({ error: `Order status ${order?.status}` }, 402);
      const pu = ((order.purchase_units as { amount?: { currency_code?: string; value?: string }; custom_id?: string }[]) ?? [])[0];
      const amount = Number(pu?.amount?.value ?? 0);
      const cur = pu?.amount?.currency_code;
      if (cur !== "USD" || plan.currency !== "USD") return json({ error: "Currency mismatch" }, 400);
      if (amount + 1e-6 < Number(plan.price)) return json({ error: "Amount mismatch" }, 400);
      const custom = pu?.custom_id ?? "";
      // custom_id was "sub:<plan_id>:<user_id>"
      const parts = custom.split(":");
      if (parts[0] !== "sub" || parts[1] !== plan_id || parts[2] !== userId) {
        return json({ error: "Order does not match caller/plan" }, 403);
      }
    }

    // Activate via SECURITY DEFINER RPC (service_role)
    const { data: subId, error: rpcErr } = await supa.rpc("activate_user_subscription", {
      _user_id: userId,
      _plan_id: plan_id,
      _payment_reference: reference,
      _payment_method: provider,
    });
    if (rpcErr) {
      console.error("[activate-subscription] rpc error:", rpcErr);
      return json({ error: rpcErr.message }, 400);
    }
    return json({ subscription_id: subId, status: "active" });
  } catch (e) {
    console.error("[activate-subscription] error:", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
