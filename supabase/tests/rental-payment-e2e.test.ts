// End-to-end contract test for the payment → confirmation → receipt → invoice paid flow.
//
// These tests validate the invariants the webhook layer & DB triggers must maintain:
//   1. A single "charge success" event marks the payment completed, generates
//      exactly one receipt, and marks the invoice paid — with the exact
//      currency + amount from the agreed rental rate / security deposit line.
//   2. Duplicate provider deliveries (same external_event_id) are short-circuited
//      and produce NO additional receipt and NO additional invoice status changes.
//   3. Retry-storm scenarios (5 rapid deliveries) still leave exactly one
//      receipt and one paid invoice.
//
// The tests operate against Supabase via the service role using seeded rows so
// they exercise the real DB triggers (auto_generate_receipt_from_payment,
// receipts unique(payment_id), invoices status transitions) end-to-end.
//
// Run:  deno test -A supabase/tests/rental-payment-e2e.test.ts
//
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// Skip the whole file when creds are not present so it never fails CI locally.
const canRun = Boolean(SUPABASE_URL && SERVICE_KEY);
const runIf = (cond: boolean, name: string, fn: () => Promise<void>) =>
  Deno.test({ name, ignore: !cond, fn });

const admin = canRun ? createClient(SUPABASE_URL, SERVICE_KEY!) : null;

interface Seed { rentalId: string; rentalInvoiceId: string; depositInvoiceId: string; paymentId: string; }

async function seed(): Promise<Seed> {
  const drv = crypto.randomUUID();
  const own = crypto.randomUUID();
  const veh = crypto.randomUUID();
  const rentalId = crypto.randomUUID();

  // Minimum rental row for the triggers/reports we're testing.
  const { error: rErr } = await admin!.from("rentals").insert({
    id: rentalId, driver_id: drv, owner_id: own, vehicle_id: veh,
    weekly_rate: 500, security_deposit_amount: 200,
    security_deposit_status: "held",
    status: "active", currency: "USD",
    start_date: new Date().toISOString(), end_date: new Date(Date.now() + 30 * 86400_000).toISOString(),
  } as any);
  assertEquals(rErr, null, "seed rental");

  const rentalInv = crypto.randomUUID();
  const depositInv = crypto.randomUUID();
  const { error: iErr } = await admin!.from("invoices").insert([
    { id: rentalInv, invoice_type: "rental", status: "issued", driver_id: drv, owner_id: own,
      rental_id: rentalId, vehicle_id: veh, amount: 500, total_amount: 500, currency: "USD",
      description: "Week 1 rental", line_items: [{ description: "Weekly rate", unit_price: 500, unit: "week", quantity: 1 }] },
    { id: depositInv, invoice_type: "deposit", status: "issued", driver_id: drv, owner_id: own,
      rental_id: rentalId, vehicle_id: veh, amount: 200, total_amount: 200, currency: "USD",
      description: "Refundable security deposit", line_items: [{ description: "Security deposit", unit_price: 200, quantity: 1 }] },
  ] as any);
  assertEquals(iErr, null, "seed invoices");

  await admin!.from("rentals").update({ security_deposit_invoice_id: depositInv }).eq("id", rentalId);

  const paymentId = crypto.randomUUID();
  const { error: pErr } = await admin!.from("payments").insert({
    id: paymentId, driver_id: drv, owner_id: own, rental_id: rentalId, vehicle_id: veh,
    amount: 500, currency: "USD", status: "pending", payment_method: "paystack",
    transaction_id: `TX-${paymentId}`,
  } as any);
  assertEquals(pErr, null, "seed payment");

  // Link payment to the rental invoice so the trigger flips it to paid.
  await admin!.from("invoices").update({ payment_id: paymentId }).eq("id", rentalInv);

  return { rentalId, rentalInvoiceId: rentalInv, depositInvoiceId: depositInv, paymentId };
}

async function cleanup(s: Seed) {
  await admin!.from("receipts").delete().eq("payment_id", s.paymentId);
  await admin!.from("invoices").delete().in("id", [s.rentalInvoiceId, s.depositInvoiceId]);
  await admin!.from("payments").delete().eq("id", s.paymentId);
  await admin!.from("rentals").delete().eq("id", s.rentalId);
}

runIf(canRun, "payment.complete → single receipt + invoice=paid with agreed rate", async () => {
  const s = await seed();
  try {
    // Simulate what the webhook does on charge.success:
    const { error } = await admin!.from("payments").update({
      status: "completed", processed_at: new Date().toISOString(),
    }).eq("id", s.paymentId);
    assertEquals(error, null);

    // The auto_generate_receipt_from_payment trigger runs synchronously.
    const { data: receipts } = await admin!.from("receipts").select("*").eq("payment_id", s.paymentId);
    assertEquals(receipts?.length, 1, "exactly one receipt after completion");
    assertEquals(Number(receipts![0].amount), 500, "receipt matches agreed weekly rate");
    assertEquals(receipts![0].currency, "USD");

    const { data: inv } = await admin!.from("invoices").select("status, total_amount").eq("id", s.rentalInvoiceId).single();
    assertEquals(inv!.status, "paid", "rental invoice marked paid");
    assertEquals(Number(inv!.total_amount), 500, "invoice total unchanged");

    // Deposit invoice remains untouched by the rental payment.
    const { data: dep } = await admin!.from("invoices").select("status, total_amount").eq("id", s.depositInvoiceId).single();
    assertEquals(dep!.status, "issued");
    assertEquals(Number(dep!.total_amount), 200);
  } finally { await cleanup(s); }
});

runIf(canRun, "duplicate provider callbacks never create duplicate receipts", async () => {
  const s = await seed();
  try {
    // First "delivery": completes the payment.
    await admin!.from("payments").update({ status: "completed", processed_at: new Date().toISOString() }).eq("id", s.paymentId);

    // 4 more identical "deliveries" — the webhook would re-set status=completed.
    // The trigger guard (OLD.status='completed' → RETURN NEW) and the receipts
    // unique(payment_id) index must keep this idempotent.
    for (let i = 0; i < 4; i++) {
      await admin!.from("payments").update({ status: "completed", processed_at: new Date().toISOString() }).eq("id", s.paymentId);
    }

    const { data: receipts } = await admin!.from("receipts").select("id, amount").eq("payment_id", s.paymentId);
    assertEquals(receipts?.length, 1, "still exactly one receipt after 5 deliveries");

    const { data: inv } = await admin!.from("invoices").select("status, paid_at").eq("id", s.rentalInvoiceId).single();
    assertEquals(inv!.status, "paid");
    assert(inv!.paid_at, "paid_at is set once");
  } finally { await cleanup(s); }
});

runIf(canRun, "duplicate webhook event log is blocked by unique index", async () => {
  const externalId = `pstk-${crypto.randomUUID()}`;
  const { error: first } = await admin!.from("payment_webhook_events").insert({
    provider: "paystack", event_type: "charge.success",
    external_event_id: externalId, status: "verified",
    signature_valid: true, payload: { test: true },
  } as any);
  assertEquals(first, null);

  const { error: second } = await admin!.from("payment_webhook_events").insert({
    provider: "paystack", event_type: "charge.success",
    external_event_id: externalId, status: "verified",
    signature_valid: true, payload: { test: true, retry: true },
  } as any);
  assert(second, "second insert must be rejected");
  assertEquals((second as any).code, "23505", "unique violation on (provider, external_event_id)");

  await admin!.from("payment_webhook_events").delete().eq("external_event_id", externalId);
});

runIf(canRun, "security deposit invoice does NOT flip when rental payment completes", async () => {
  const s = await seed();
  try {
    await admin!.from("payments").update({ status: "completed", processed_at: new Date().toISOString() }).eq("id", s.paymentId);
    const { data: dep } = await admin!.from("invoices").select("status").eq("id", s.depositInvoiceId).single();
    assertEquals(dep!.status, "issued", "deposit stays unpaid until its own payment lands");
  } finally { await cleanup(s); }
});
