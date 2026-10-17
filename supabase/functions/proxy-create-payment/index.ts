// deno-lint-ignore-file no-explicit-any
// Driver proxy payment: a driver pays an obligation using an approved proxy
// payer's card or bank account (Paystack hosted checkout, channels card|bank).
// Security: driver identity from JWT; proxy must be active (consent signed,
// identity verified, admin approved, inside validity window, uses remaining);
// amount authoritative from DB obligation; use is reserved with an optimistic
// lock so max_uses cannot be exceeded. Settlement credits the DRIVER's payment
// via the existing paystack-webhook / verify-paystack-transaction path.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { authorizeAmount, claimInvoice } from "../_shared/payment-obligation.ts";
import { resolvePaymentContext } from "../_shared/resolve-payment-context.ts";
import { claimIdempotencyKey, completeIdempotencyKey, duplicateResponse, resolveIdempotencyKey } from "../_shared/payment-idempotency.ts";
import { checkRateLimit, tooMany } from "../_shared/rate-limit.ts";

const BodySchema = z.object({
  proxyAccountId: z.string().uuid(),
  method: z.enum(["card", "bank"]),
  amount: z.number().positive(),
  currency: z.enum(["NGN", "GHS", "ZAR", "KES", "XOF", "EGP", "USD"]),
  rentalId: z.string().uuid().optional(),
  vehicleId: z.string().uuid().optional(),
  paymentFrequency: z.enum(["daily", "weekly"]).optional(),
  purpose: z.string().optional(),
  invoiceId: z.string().uuid().optional(),
  callbackUrl: z.string().url().optional(),
});

const CHANNELS = { card: ["card"], bank: ["bank", "bank_transfer"] } as const;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!secret) return json(503, { error: "Paystack not configured" });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json(401, { error: "Unauthenticated" });
  const { data: userData } = await supabase.auth.getUser(auth.slice(7));
  const driverId = userData?.user?.id;
  if (!driverId) return json(401, { error: "Unauthenticated" });

  const rl = await checkRateLimit(driverId, "proxy-create-payment", 10);
  if (!rl.allowed) return tooMany(rl.retry_after_seconds);

  const rawBody = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(rawBody);
  if (!parsed.success) return json(400, { error: parsed.error.flatten().fieldErrors });
  const body = parsed.data;

  let reserved: { id: string; uses: number } | null = null;
  let idemKey: string | null = null;
  const fail = async (status: number, error: string) => {
    if (idemKey) await completeIdempotencyKey(supabase, idemKey, "failed");
    if (reserved) {
      await supabase.from("driver_proxy_billing_accounts")
        .update({ uses_count: reserved.uses }).eq("id", reserved.id).eq("uses_count", reserved.uses + 1);
    }
    return json(status, { error });
  };

  try {
    const { data: proxy } = await supabase.from("driver_proxy_billing_accounts")
      .select("id, driver_id, proxy_email, proxy_full_name, status, consent_status, identity_status, admin_review_status, validity_starts_at, validity_expires_at, max_uses, uses_count")
      .eq("id", body.proxyAccountId).maybeSingle();
    if (!proxy || proxy.driver_id !== driverId) return json(404, { error: "Proxy account not found" });

    const now = Date.now();
    if (
      proxy.status !== "active" || proxy.consent_status !== "signed" ||
      proxy.identity_status !== "verified" || proxy.admin_review_status !== "approved"
    ) return json(409, { error: "Proxy account is not active" });
    if (proxy.validity_starts_at && new Date(proxy.validity_starts_at).getTime() > now) return json(409, { error: "Proxy account not yet valid" });
    if (proxy.validity_expires_at && new Date(proxy.validity_expires_at).getTime() <= now) return json(409, { error: "Proxy account expired" });
    const uses = Number(proxy.uses_count ?? 0);
    if (proxy.max_uses != null && uses >= proxy.max_uses) return json(409, { error: "Proxy account use limit reached" });

    const obl = await authorizeAmount(supabase, {
      driverId, purpose: body.purpose, rentalId: body.rentalId, invoiceId: body.invoiceId,
      amount: body.amount, currency: body.currency,
    });
    if (!obl.ok) return json(obl.status, { error: obl.error });
    body.amount = obl.amount;

    idemKey = resolveIdempotencyKey(req, rawBody ?? {});
    const claim = await claimIdempotencyKey(supabase, idemKey, "charge.proxy", driverId, {
      amount: body.amount, currency: body.currency, proxyAccountId: proxy.id, method: body.method,
    });
    if (!claim.claimed) return duplicateResponse(claim, corsHeaders);

    const ctx = await resolvePaymentContext({
      supabase, rentalId: body.rentalId, vehicleId: body.vehicleId, ownerId: driverId, purpose: body.purpose,
    });
    if ("error" in ctx) return fail(400, ctx.error);

    // Reserve one use (optimistic lock on uses_count).
    const { data: lock } = await supabase.from("driver_proxy_billing_accounts")
      .update({ uses_count: uses + 1 }).eq("id", proxy.id).eq("uses_count", uses).select("id");
    if (!lock?.length) return fail(409, "Proxy account is busy, please retry");
    reserved = { id: proxy.id, uses };

    const reference = `rmk_px_${crypto.randomUUID().replace(/-/g, "")}`;
    const resp = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: "Bearer " + secret, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: proxy.proxy_email,
        amount: Math.round(body.amount * 100),
        currency: body.currency,
        reference,
        channels: CHANNELS[body.method],
        callback_url: body.callbackUrl,
        metadata: {
          rental_id: ctx.rentalId, vehicle_id: ctx.vehicleId, owner_id: ctx.ownerId,
          driver_id: driverId, proxy_account_id: proxy.id, payer_type: "proxy",
          payment_method_type: body.method, purpose: body.purpose,
        },
      }),
    });
    const pay = await resp.json().catch(() => ({}));
    if (!resp.ok || !pay?.status) {
      console.error("[proxy-create-payment] init failed", pay?.message);
      return fail(502, "Payment provider could not start the payment");
    }

    // Payment belongs to the DRIVER, so settlement updates the driver's account.
    const { data: payment, error: payErr } = await supabase.from("payments").insert({
      rental_id: ctx.rentalId ?? null, driver_id: driverId, owner_id: ctx.ownerId ?? driverId,
      vehicle_id: ctx.vehicleId ?? null, amount: body.amount, currency: body.currency,
      status: "pending", payment_method: "paystack",
      payment_frequency: body.paymentFrequency ?? "weekly", transaction_id: reference,
      purpose: body.purpose ?? "rental",
    }).select("id").single();
    if (payErr || !payment?.id) return fail(500, "Failed to record payment");

    if (!(await claimInvoice(supabase, obl.invoiceId, payment.id))) {
      return fail(409, "Payment already in progress for this invoice");
    }

    await supabase.from("paystack_transactions").insert({
      reference, access_code: pay.data.access_code, authorization_url: pay.data.authorization_url,
      currency: body.currency, amount: body.amount, status: "pending",
      rental_id: ctx.rentalId ?? null, driver_id: driverId, vehicle_id: ctx.vehicleId ?? null,
      payment_id: payment.id, raw_payload: pay.data,
    });

    await supabase.from("proxy_billing_audit_log").insert({
      proxy_account_id: proxy.id, driver_id: driverId, actor_id: driverId, actor_role: "driver",
      action: "proxy_payment_initiated",
      details: { reference, method: body.method, amount: body.amount, currency: body.currency, payment_id: payment.id },
      idempotency_key: idemKey,
    }).then(() => {}, () => {});

    const successBody = {
      reference, access_code: pay.data.access_code,
      authorization_url: pay.data.authorization_url, payment_id: payment.id, method: body.method,
    };
    await completeIdempotencyKey(supabase, idemKey, "succeeded", successBody);
    return json(200, successBody);
  } catch (err) {
    console.error("[proxy-create-payment] error:", err);
    return fail(500, "Proxy payment failed");
  }
});
