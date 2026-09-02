// deno-lint-ignore-file no-explicit-any
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { resolvePaymentContext } from "../_shared/resolve-payment-context.ts";
import { claimIdempotencyKey, completeIdempotencyKey, duplicateResponse, resolveIdempotencyKey } from "../_shared/payment-idempotency.ts";

const BodySchema = z.object({
  amount: z.number().positive(),
  currency: z.enum(["NGN", "GHS", "ZAR", "KES", "XOF", "EGP", "USD"]),
  rentalId: z.string().uuid().optional(),
  vehicleId: z.string().uuid().optional(),
  driverId: z.string().uuid().optional(),
  paymentFrequency: z.enum(["daily", "weekly"]).optional(),
  channels: z.array(z.enum(["card", "bank", "ussd", "bank_transfer", "mobile_money", "qr"])).optional(),
  description: z.string().max(255).optional(),
  callbackUrl: z.string().url().optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!secret) {
      return new Response(JSON.stringify({ error: "Paystack not configured" }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const auth = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const rawBody = await req.json();
    const parsed = BodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const body = parsed.data;

    // Driver identity is ALWAYS derived from the JWT — never trust the body.
    if (!auth.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: userData, error: userErr } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const driverId = userData.user.id;
    // If the caller passed a mismatched driverId, reject rather than silently accept.
    if (body.driverId && body.driverId !== driverId) {
      return new Response(JSON.stringify({ error: "driverId does not match authenticated user" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch driver email (required by Paystack)
    const { data: profile } = await supabase
      .from("profiles").select("email").eq("user_id", driverId).maybeSingle();
    const email = profile?.email;
    if (!email) {
      return new Response(JSON.stringify({ error: "Driver email not found" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Duplicate submissions (double-click, retry) must not create two charges.
    const idemKey = resolveIdempotencyKey(req, rawBody ?? {});
    const claim = await claimIdempotencyKey(supabase, idemKey, "charge.paystack", driverId, {
      amount: body.amount, currency: body.currency, rentalId: body.rentalId, vehicleId: body.vehicleId,
    });
    if (!claim.claimed) return duplicateResponse(claim, corsHeaders);

    const reference = `rmk_${crypto.randomUUID().replace(/-/g, "")}`;
    const amountMinor = Math.round(body.amount * 100);

    const ctx = await resolvePaymentContext({
      supabase, rentalId: body.rentalId, vehicleId: body.vehicleId, ownerId: undefined,
    });
    if ("error" in ctx) {
      return new Response(JSON.stringify({ error: ctx.error }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resp = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        amount: amountMinor,
        currency: body.currency,
        reference,
        channels: body.channels,
        callback_url: body.callbackUrl,
        metadata: {
          rental_id: ctx.rentalId,
          vehicle_id: ctx.vehicleId,
          owner_id: ctx.ownerId,
          driver_id: driverId,
          payment_frequency: body.paymentFrequency,
          description: body.description,
        },
      }),
    });
    const pay = await resp.json();
    if (!resp.ok || !pay?.status) {
      await completeIdempotencyKey(supabase, idemKey, "failed");
      return new Response(JSON.stringify({ error: pay?.message ?? "Paystack init failed" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create pending payment + paystack row
    const { data: payment, error: paymentError } = await supabase.from("payments").insert({
      rental_id: ctx.rentalId,
      driver_id: driverId,
      owner_id: ctx.ownerId,
      vehicle_id: ctx.vehicleId,
      amount: body.amount,
      currency: body.currency,
      status: "pending",
      payment_method: "paystack",
      payment_frequency: body.paymentFrequency ?? "weekly",
      transaction_id: reference,
    }).select("id").single();

    if (paymentError || !payment?.id) {
      console.error("[create-paystack-transaction] payment insert failed:", paymentError);
      await completeIdempotencyKey(supabase, idemKey, "failed");
      return new Response(JSON.stringify({ error: "Failed to record payment" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("paystack_transactions").insert({
      reference,
      access_code: pay.data.access_code,
      authorization_url: pay.data.authorization_url,
      currency: body.currency,
      amount: body.amount,
      status: "pending",
      rental_id: ctx.rentalId,
      driver_id: driverId,
      vehicle_id: ctx.vehicleId,
      payment_id: payment.id,
      raw_payload: pay.data,
    });

    const successBody = {
      reference,
      access_code: pay.data.access_code,
      authorization_url: pay.data.authorization_url,
      payment_id: payment?.id,
    };
    await completeIdempotencyKey(supabase, idemKey, "succeeded", successBody);

    return new Response(
      JSON.stringify({
        reference,
        access_code: pay.data.access_code,
        authorization_url: pay.data.authorization_url,
        payment_id: payment?.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
