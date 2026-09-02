// deno-lint-ignore-file no-explicit-any
// Scheduled reconciliation: cross-checks Paystack/Opay/PayPal transactions
// against provider APIs and backfills missing/pending payment rows so
// receipts render and balances update even when a webhook/callback was missed.
//
// Auth: pg_cron passes x-cron-secret matching CRON_SECRET.
// Idempotency: relies on the partial unique index
//   payments_method_txn_unique (payment_method, transaction_id) — a duplicate
//   insert is treated as "already backfilled", never counted as a new backfill.
// Logging: every run writes a row to public.reconciliation_runs (per-PSP
//   summary, backfilled payment ids, errors). Threshold breaches invoke
//   send-reconciliation-alert (email + SMS + in-app banner).

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createHmac } from "node:crypto";
import { resolvePaymentContext } from "../_shared/resolve-payment-context.ts";
import { syncPaymentStatus } from "../_shared/payment-status-sync.ts";


const LOOKBACK_HOURS = 24 * 7;
const MAX_PER_PSP = 200;

// Alert thresholds (see mem: user chose ">25 in one run OR >50 in rolling 1h").
const SPIKE_PER_RUN = 25;
const SPIKE_PER_HOUR = 50;
const ERROR_SPIKE_PER_RUN = 5;

type Supa = ReturnType<typeof createClient>;

interface PspResult {
  psp: "paystack" | "opay" | "paypal";
  checked: number;
  updated: number;
  backfilled_payments: number;
  errors: Array<{ reference?: string; order_id?: string; error: string }>;
  backfilled_payment_ids: string[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const cronSecret = Deno.env.get("CRON_SECRET");
  const provided = req.headers.get("x-cron-secret") ?? new URL(req.url).searchParams.get("secret");
  const triggeredBy = req.headers.get("x-trigger-source") ?? "cron";
  if (cronSecret && provided !== cronSecret) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const sinceIso = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
  const startedAt = Date.now();

  // Open a run row up-front so partial failures still leave a trace.
  const { data: runRow, error: runErr } = await supabase
    .from("reconciliation_runs")
    .insert({ since: sinceIso, status: "running", triggered_by: triggeredBy })
    .select("id")
    .single();
  const runId = runRow?.id as string | undefined;
  if (runErr) console.error("[reconcile-payments] failed to open run row:", runErr);

  const results: PspResult[] = [];
  let fatalError: string | null = null;

  for (const runner of [reconcilePaystack, reconcileOpay, reconcilePaypal] as const) {
    try {
      results.push(await runner(supabase, sinceIso));
    } catch (e) {
      const psp = runner.name.replace("reconcile", "").toLowerCase() as PspResult["psp"];
      results.push({ psp, checked: 0, updated: 0, backfilled_payments: 0,
        errors: [{ error: String(e) }], backfilled_payment_ids: [] });
    }
  }

  const totals = results.reduce((acc, r) => ({
    checked: acc.checked + r.checked,
    updated: acc.updated + r.updated,
    backfilled: acc.backfilled + r.backfilled_payments,
    errors: acc.errors + r.errors.length,
  }), { checked: 0, updated: 0, backfilled: 0, errors: 0 });

  const allBackfilledIds = results.flatMap((r) => r.backfilled_payment_ids);
  const allErrors = results.flatMap((r) => r.errors.map((e) => ({ psp: r.psp, ...e })));
  const perPsp = Object.fromEntries(results.map((r) => [r.psp, {
    checked: r.checked, updated: r.updated,
    backfilled: r.backfilled_payments, errors: r.errors.length,
  }]));

  const runStatus = fatalError ? "error" : totals.errors > 0 ? "partial" : "success";

  if (runId) {
    await supabase.from("reconciliation_runs").update({
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
      status: runStatus,
      total_checked: totals.checked,
      total_updated: totals.updated,
      total_backfilled: totals.backfilled,
      total_errors: totals.errors,
      per_psp: perPsp,
      errors: allErrors,
      backfilled_payment_ids: allBackfilledIds,
      fatal_error: fatalError,
    }).eq("id", runId);
  }

  // Threshold-based alerting.
  await maybeAlert(supabase, {
    runId, results, totals, perPsp,
  });

  return json({
    success: true,
    run_id: runId,
    since: sinceIso,
    status: runStatus,
    totals,
    per_psp: perPsp,
    results,
  });
});

// ---------- Paystack ----------
async function reconcilePaystack(supa: Supa, sinceIso: string): Promise<PspResult> {
  const out: PspResult = { psp: "paystack", checked: 0, updated: 0,
    backfilled_payments: 0, errors: [], backfilled_payment_ids: [] };
  const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!secret) return out;

  const { data: txs } = await supa
    .from("paystack_transactions")
    .select("id, reference, status, payment_id, rental_id, driver_id, vehicle_id, amount, currency")
    .gte("created_at", sinceIso)
    .or("status.eq.pending,payment_id.is.null")
    .limit(MAX_PER_PSP);

  for (const tx of txs ?? []) {
    out.checked++;
    try {
      const resp = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(tx.reference)}`, {
        headers: { Authorization: `Bearer ${secret}` },
      });
      const body = await resp.json();
      if (!resp.ok || !body?.status) {
        out.errors.push({ reference: tx.reference, error: body?.message ?? `HTTP ${resp.status}` });
        continue;
      }
      const data = body.data;
      const success = data.status === "success";
      const status = success ? "completed" : data.status === "failed" ? "failed" : "pending";
      const failure = success ? null : data.gateway_response ?? null;

      const ensured = await ensurePayment(supa, {
        existingPaymentId: tx.payment_id, rentalId: tx.rental_id, driverId: tx.driver_id,
        vehicleId: tx.vehicle_id, amount: Number(tx.amount), currency: tx.currency,
        method: "paystack", transactionRef: tx.reference, status, failure,
      });
      if (ensured.backfilled && ensured.paymentId) {
        out.backfilled_payments++;
        out.backfilled_payment_ids.push(ensured.paymentId);
      }

      await supa.from("paystack_transactions").update({
        status, channel: data.channel, gateway_response: data.gateway_response,
        failure_reason: failure, raw_payload: data,
        payment_id: ensured.paymentId ?? tx.payment_id,
      }).eq("id", tx.id);

      if (ensured.paymentId) {
        await syncPaymentStatus(supa, {
          paymentId: ensured.paymentId, status, failureReason: failure,
        });

      }
      out.updated++;
    } catch (e) {
      out.errors.push({ reference: tx.reference, error: String(e) });
    }
  }
  return out;
}

// ---------- Opay ----------
async function reconcileOpay(supa: Supa, sinceIso: string): Promise<PspResult> {
  const out: PspResult = { psp: "opay", checked: 0, updated: 0,
    backfilled_payments: 0, errors: [], backfilled_payment_ids: [] };
  const merchantId = Deno.env.get("OPAY_MERCHANT_ID");
  const secretKey = Deno.env.get("OPAY_SECRET_KEY");
  const publicKey = Deno.env.get("OPAY_PUBLIC_KEY");
  const env = (Deno.env.get("OPAY_ENVIRONMENT") ?? "sandbox").toLowerCase();
  if (!merchantId || !secretKey || !publicKey) return out;

  const baseUrl = env === "live" ? "https://liveapi.opaycheckout.com" : "https://sandboxapi.opaycheckout.com";

  const { data: txs } = await supa
    .from("opay_transactions")
    .select("id, reference, status, payment_id, rental_id, driver_id, vehicle_id, amount, currency")
    .gte("created_at", sinceIso)
    .or("status.eq.pending,payment_id.is.null")
    .limit(MAX_PER_PSP);

  for (const tx of txs ?? []) {
    out.checked++;
    try {
      const payload = JSON.stringify({ reference: tx.reference, country: "NG" });
      const sig = createHmac("sha512", secretKey).update(payload).digest("hex");
      const resp = await fetch(`${baseUrl}/api/v1/international/cashier/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicKey}`,
          MerchantId: merchantId, Signature: sig,
        },
        body: payload,
      });
      const body = await resp.json();
      if (!resp.ok) {
        out.errors.push({ reference: tx.reference, error: body?.message ?? `HTTP ${resp.status}` });
        continue;
      }
      const opayStatus: string = body?.data?.status ?? "PENDING";
      const status = opayStatus === "SUCCESS" ? "completed"
        : opayStatus === "FAIL" || opayStatus === "CLOSE" ? "failed" : "pending";
      const failure = status === "failed" ? body?.data?.failureReason ?? opayStatus : null;

      const ensured = await ensurePayment(supa, {
        existingPaymentId: tx.payment_id, rentalId: tx.rental_id, driverId: tx.driver_id,
        vehicleId: tx.vehicle_id, amount: Number(tx.amount), currency: tx.currency,
        method: "opay", transactionRef: tx.reference, status, failure,
      });
      if (ensured.backfilled && ensured.paymentId) {
        out.backfilled_payments++;
        out.backfilled_payment_ids.push(ensured.paymentId);
      }

      await supa.from("opay_transactions").update({
        status, failure_reason: failure, raw_payload: body?.data,
        payment_id: ensured.paymentId ?? tx.payment_id,
      }).eq("id", tx.id);

      if (ensured.paymentId) {
        await syncPaymentStatus(supa, {
          paymentId: ensured.paymentId, status, failureReason: failure,
        });

      }
      out.updated++;
    } catch (e) {
      out.errors.push({ reference: tx.reference, error: String(e) });
    }
  }
  return out;
}

// ---------- PayPal ----------
async function reconcilePaypal(supa: Supa, sinceIso: string): Promise<PspResult> {
  const out: PspResult = { psp: "paypal", checked: 0, updated: 0,
    backfilled_payments: 0, errors: [], backfilled_payment_ids: [] };
  const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
  const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
  const mode = (Deno.env.get("PAYPAL_MODE") ?? "sandbox").toLowerCase();
  if (!clientId || !clientSecret) return out;
  const base = mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

  const tokRes = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${clientId}:${clientSecret}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!tokRes.ok) {
    out.errors.push({ error: `PayPal token ${tokRes.status}` });
    return out;
  }
  const { access_token } = await tokRes.json();

  const { data: txs } = await supa
    .from("paypal_transactions")
    .select("id, order_id, status, payment_id, rental_id, driver_id, owner_id, vehicle_id, amount, currency")
    .gte("created_at", sinceIso)
    .in("status", ["created", "capture_pending", "pending"])
    .limit(MAX_PER_PSP);

  for (const tx of txs ?? []) {
    out.checked++;
    try {
      const orderRes = await fetch(`${base}/v2/checkout/orders/${tx.order_id}`, {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      const order = await orderRes.json();
      if (!orderRes.ok) {
        out.errors.push({ order_id: tx.order_id, error: `HTTP ${orderRes.status}` });
        continue;
      }

      let captureStatus = order.status;
      let captureId: string | null = null;
      let captureRecord: any = order.purchase_units?.[0]?.payments?.captures?.[0] ?? null;

      if (order.status === "APPROVED") {
        const capRes = await fetch(`${base}/v2/checkout/orders/${tx.order_id}/capture`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${access_token}`,
            "Content-Type": "application/json",
            "Prefer": "return=representation",
          },
        });
        const cap = await capRes.json();
        if (capRes.ok) {
          captureRecord = cap.purchase_units?.[0]?.payments?.captures?.[0] ?? captureRecord;
          captureStatus = captureRecord?.status ?? cap.status ?? captureStatus;
        } else {
          out.errors.push({ order_id: tx.order_id, error: `capture HTTP ${capRes.status}` });
        }
      }
      captureId = captureRecord?.id ?? null;

      const status = captureStatus === "COMPLETED" ? "completed"
        : captureStatus === "VOIDED" || captureStatus === "DECLINED" ? "failed" : "pending";

      const ensured = await ensurePayment(supa, {
        existingPaymentId: tx.payment_id, rentalId: tx.rental_id, driverId: tx.driver_id,
        vehicleId: tx.vehicle_id, ownerId: tx.owner_id, amount: Number(tx.amount),
        currency: tx.currency, method: "paypal", transactionRef: tx.order_id,
        status, failure: status === "failed" ? captureStatus : null,
      });
      if (ensured.backfilled && ensured.paymentId) {
        out.backfilled_payments++;
        out.backfilled_payment_ids.push(ensured.paymentId);
      }

      await supa.from("paypal_transactions").update({
        capture_id: captureId,
        status: captureStatus === "COMPLETED" ? "captured"
          : captureStatus === "VOIDED" || captureStatus === "DECLINED" ? "failed"
          : "capture_pending",
        raw_capture_response: order,
        payment_id: ensured.paymentId ?? tx.payment_id,
      }).eq("id", tx.id);

      if (ensured.paymentId) {
        await syncPaymentStatus(supa, {
          paymentId: ensured.paymentId, status,
          failureReason: status === "failed" ? captureStatus : null,
        });
      }

      out.updated++;
    } catch (e) {
      out.errors.push({ order_id: tx.order_id, error: String(e) });
    }
  }
  return out;
}

// ---------- shared ----------
interface EnsurePaymentArgs {
  existingPaymentId?: string | null;
  rentalId?: string | null;
  driverId?: string | null;
  vehicleId?: string | null;
  ownerId?: string | null;
  amount: number;
  currency: string;
  method: "paystack" | "opay" | "paypal";
  transactionRef: string;
  status: "pending" | "completed" | "failed";
  failure?: string | null;
}

/** True idempotency: try to insert; on unique-violation, look up the existing row.
 *  Returns paymentId + whether this call actually created the row. */
export async function ensurePayment(
  supa: Supa, a: EnsurePaymentArgs,
): Promise<{ paymentId: string | null; backfilled: boolean }> {
  if (a.existingPaymentId) return { paymentId: a.existingPaymentId, backfilled: false };
  if (!a.driverId) return { paymentId: null, backfilled: false };

  // Pre-check: another concurrent process (webhook) may have inserted it already.
  const { data: existing } = await supa
    .from("payments")
    .select("id")
    .eq("payment_method", a.method)
    .eq("transaction_id", a.transactionRef)
    .maybeSingle();
  if (existing?.id) return { paymentId: existing.id as string, backfilled: false };

  const ctx = await resolvePaymentContext({
    supabase: supa, rentalId: a.rentalId, vehicleId: a.vehicleId, ownerId: a.ownerId,
  });
  if ("error" in ctx) return { paymentId: null, backfilled: false };

  const { data, error } = await supa.from("payments").insert({
    rental_id: ctx.rentalId,
    driver_id: a.driverId,
    owner_id: ctx.ownerId,
    vehicle_id: ctx.vehicleId,
    amount: a.amount,
    currency: a.currency,
    status: a.status,
    payment_method: a.method,
    payment_frequency: "weekly",
    transaction_id: a.transactionRef,
    failure_reason: a.failure ?? null,
    processed_at: a.status === "completed" ? new Date().toISOString() : null,
  }).select("id").single();

  if (error) {
    // 23505 = unique_violation → someone else won the race; fetch that row.
    if ((error as any).code === "23505") {
      const { data: raced } = await supa
        .from("payments").select("id")
        .eq("payment_method", a.method).eq("transaction_id", a.transactionRef)
        .maybeSingle();
      return { paymentId: (raced?.id as string) ?? null, backfilled: false };
    }
    console.error("[reconcile-payments] backfill insert failed:", error);
    return { paymentId: null, backfilled: false };
  }
  return { paymentId: data.id as string, backfilled: true };
}

// ---------- alerting ----------
interface MaybeAlertArgs {
  runId?: string;
  results: PspResult[];
  totals: { checked: number; updated: number; backfilled: number; errors: number };
  perPsp: Record<string, unknown>;
}

async function maybeAlert(supa: Supa, args: MaybeAlertArgs) {
  const alerts: Array<{
    alert_type: string; severity: string; psp: string | null;
    message: string; details: Record<string, unknown>;
  }> = [];

  if (args.totals.backfilled > SPIKE_PER_RUN) {
    alerts.push({
      alert_type: "backfill_spike", severity: "warning", psp: null,
      message: `Reconciler backfilled ${args.totals.backfilled} payments in one run (> ${SPIKE_PER_RUN}).`,
      details: { totals: args.totals, per_psp: args.perPsp },
    });
  }

  // Rolling 1h backfill count
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recent } = await supa
    .from("reconciliation_runs")
    .select("total_backfilled")
    .gte("started_at", oneHourAgo);
  const rolling = (recent ?? []).reduce((s: number, r: any) => s + (r.total_backfilled ?? 0), 0);
  if (rolling > SPIKE_PER_HOUR) {
    alerts.push({
      alert_type: "rolling_backfill_spike", severity: "warning", psp: null,
      message: `Reconciler backfilled ${rolling} payments in the last 1h (> ${SPIKE_PER_HOUR}).`,
      details: { rolling_1h: rolling, threshold: SPIKE_PER_HOUR },
    });
  }

  for (const r of args.results) {
    if (r.errors.length > ERROR_SPIKE_PER_RUN) {
      alerts.push({
        alert_type: "errors_spike", severity: "critical", psp: r.psp,
        message: `${r.psp} reconciliation had ${r.errors.length} errors in one run.`,
        details: { errors: r.errors.slice(0, 10), checked: r.checked },
      });
    }
  }

  if (alerts.length === 0) return;

  for (const a of alerts) {
    await supa.from("reconciliation_alerts").insert({ ...a, run_id: args.runId });
  }

  // Fan-out via edge function (email + SMS + banner already inserted above).
  try {
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-reconciliation-alert`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ run_id: args.runId, alerts }),
    });
  } catch (e) {
    console.error("[reconcile-payments] alert fan-out failed:", e);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
