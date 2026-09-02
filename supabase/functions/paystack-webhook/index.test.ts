// End-to-end webhook simulator for Paystack and Opay.
// Run with: deno test --allow-net --allow-env supabase/functions/paystack-webhook/index.test.ts
//
// Requires PAYSTACK_SECRET_KEY and OPAY_SECRET_KEY to be configured on the
// project so the deployed webhook functions accept signed payloads. If either
// secret is missing the corresponding test is skipped rather than failing.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { createHmac } from "node:crypto";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const PAYSTACK_SECRET = Deno.env.get("PAYSTACK_SECRET_KEY");
const OPAY_SECRET = Deno.env.get("OPAY_SECRET_KEY");

const svc = SERVICE
  ? createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } })
  : null;

async function seedPaystackRow(reference: string) {
  if (!svc) throw new Error("Need SUPABASE_SERVICE_ROLE_KEY to seed test rows");
  const { data: payment } = await svc.from("payments").insert({
    amount: 5000, currency: "NGN", status: "pending", payment_method: "paystack",
    transaction_id: reference,
  }).select("id").single();
  await svc.from("paystack_transactions").insert({
    reference, currency: "NGN", amount: 5000, status: "pending", payment_id: payment!.id,
  });
  return payment!.id as string;
}

async function seedOpayRow(reference: string) {
  if (!svc) throw new Error("Need SUPABASE_SERVICE_ROLE_KEY to seed test rows");
  const { data: payment } = await svc.from("payments").insert({
    amount: 5000, currency: "NGN", status: "pending", payment_method: "opay",
    transaction_id: reference,
  }).select("id").single();
  await svc.from("opay_transactions").insert({
    reference, currency: "NGN", amount: 5000, status: "pending", payment_id: payment!.id,
  });
  return payment!.id as string;
}

async function cleanup(paymentId: string) {
  if (!svc) return;
  await svc.from("paystack_transactions").delete().eq("payment_id", paymentId);
  await svc.from("opay_transactions").delete().eq("payment_id", paymentId);
  await svc.from("payments").delete().eq("id", paymentId);
}

Deno.test({
  name: "Paystack webhook: charge.success flips payment + transaction to completed",
  ignore: !PAYSTACK_SECRET || !svc,
  async fn() {
    const reference = `test_${crypto.randomUUID().replace(/-/g, "")}`;
    const paymentId = await seedPaystackRow(reference);
    try {
      const body = JSON.stringify({
        event: "charge.success",
        data: { reference, channel: "card", gateway_response: "Successful" },
      });
      const sig = createHmac("sha512", PAYSTACK_SECRET!).update(body).digest("hex");
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/paystack-webhook`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-paystack-signature": sig, apikey: ANON },
        body,
      });
      await resp.text();
      assertEquals(resp.status, 200);

      const { data: tx } = await svc!.from("paystack_transactions")
        .select("status").eq("reference", reference).single();
      const { data: pay } = await svc!.from("payments")
        .select("status, processed_at").eq("id", paymentId).single();
      assertEquals(tx?.status, "completed");
      assertEquals(pay?.status, "completed");
    } finally { await cleanup(paymentId); }
  },
});

Deno.test({
  name: "Paystack webhook: charge.failed marks failure_reason",
  ignore: !PAYSTACK_SECRET || !svc,
  async fn() {
    const reference = `test_${crypto.randomUUID().replace(/-/g, "")}`;
    const paymentId = await seedPaystackRow(reference);
    try {
      const body = JSON.stringify({
        event: "charge.failed",
        data: { reference, gateway_response: "Declined by bank" },
      });
      const sig = createHmac("sha512", PAYSTACK_SECRET!).update(body).digest("hex");
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/paystack-webhook`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-paystack-signature": sig, apikey: ANON },
        body,
      });
      await resp.text();
      assertEquals(resp.status, 200);

      const { data: pay } = await svc!.from("payments")
        .select("status, failure_reason").eq("id", paymentId).single();
      assertEquals(pay?.status, "failed");
      assertEquals(pay?.failure_reason, "Declined by bank");
    } finally { await cleanup(paymentId); }
  },
});

Deno.test({
  name: "Paystack webhook: bad signature is rejected",
  ignore: !svc,
  async fn() {
    const body = JSON.stringify({ event: "charge.success", data: { reference: "x" } });
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/paystack-webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-paystack-signature": "deadbeef", apikey: ANON },
      body,
    });
    await resp.text();
    assertEquals(resp.status, 401);
  },
});

Deno.test({
  name: "Opay webhook: SUCCESS flips rows to completed",
  ignore: !OPAY_SECRET || !svc,
  async fn() {
    const reference = `test_${crypto.randomUUID().replace(/-/g, "")}`;
    const paymentId = await seedOpayRow(reference);
    try {
      const body = JSON.stringify({ payload: { reference, status: "SUCCESS" } });
      const sig = createHmac("sha512", OPAY_SECRET!).update(body).digest("hex");
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/opay-webhook`, {
        method: "POST",
        headers: { "content-type": "application/json", Signature: sig, apikey: ANON },
        body,
      });
      await resp.text();
      assertEquals(resp.status, 200);

      const { data: pay } = await svc!.from("payments").select("status").eq("id", paymentId).single();
      assertEquals(pay?.status, "completed");
    } finally { await cleanup(paymentId); }
  },
});

Deno.test({
  name: "Opay webhook: FAIL records failure_reason",
  ignore: !OPAY_SECRET || !svc,
  async fn() {
    const reference = `test_${crypto.randomUUID().replace(/-/g, "")}`;
    const paymentId = await seedOpayRow(reference);
    try {
      const body = JSON.stringify({ payload: { reference, status: "FAIL", failureReason: "Insufficient funds" } });
      const sig = createHmac("sha512", OPAY_SECRET!).update(body).digest("hex");
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/opay-webhook`, {
        method: "POST",
        headers: { "content-type": "application/json", Signature: sig, apikey: ANON },
        body,
      });
      await resp.text();
      assertEquals(resp.status, 200);

      const { data: pay } = await svc!.from("payments").select("status, failure_reason").eq("id", paymentId).single();
      assertEquals(pay?.status, "failed");
      assertEquals(pay?.failure_reason, "Insufficient funds");
    } finally { await cleanup(paymentId); }
  },
});
