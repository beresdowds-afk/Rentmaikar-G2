// Rental terms reconciliation.
// Cross-checks rentals ↔ invoices ↔ security deposits ↔ receipts for a date range
// and reports every row where the totals or terms do not match.
//
// Auth: caller must be an admin (checked via has_role RPC).
// Method: POST { start_date: ISO, end_date: ISO }
//
// deno-lint-ignore-file no-explicit-any
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

interface Discrepancy {
  rental_id: string;
  driver_id: string | null;
  owner_id: string | null;
  code: string;
  detail: string;
  expected?: number | string | null;
  actual?: number | string | null;
  currency?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData } = await supabaseUser.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) return new Response("unauthorized", { status: 401 });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: uid, _role: "admin" });
  if (!isAdmin) return new Response("forbidden", { status: 403 });

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }
  const startISO = body.start_date ?? new Date(Date.now() - 90 * 86400_000).toISOString();
  const endISO = body.end_date ?? new Date().toISOString();

  const [rentalsRes, invoicesRes, receiptsRes] = await Promise.all([
    admin.from("rentals").select(
      "id, driver_id, owner_id, vehicle_id, monthly_rate, weekly_rate, daily_rate, security_deposit_amount, security_deposit_status, security_deposit_invoice_id, start_date, end_date, created_at"
    ).gte("created_at", startISO).lte("created_at", endISO),
    admin.from("invoices").select(
      "id, rental_id, invoice_type, status, amount, total_amount, currency, paid_at, created_at, payment_id"
    ).gte("created_at", startISO).lte("created_at", endISO),
    admin.from("receipts").select(
      "id, invoice_id, payment_id, rental_id, amount, currency, created_at"
    ).gte("created_at", startISO).lte("created_at", endISO),
  ]);

  const rentals = rentalsRes.data ?? [];
  const invoices = invoicesRes.data ?? [];
  const receipts = receiptsRes.data ?? [];

  const invByRental = new Map<string, any[]>();
  for (const inv of invoices) {
    if (!inv.rental_id) continue;
    const arr = invByRental.get(inv.rental_id) ?? [];
    arr.push(inv); invByRental.set(inv.rental_id, arr);
  }
  const receiptByInvoice = new Map<string, any>();
  const receiptByPayment = new Map<string, any>();
  for (const rc of receipts) {
    if (rc.invoice_id) receiptByInvoice.set(rc.invoice_id, rc);
    if (rc.payment_id) receiptByPayment.set(rc.payment_id, rc);
  }

  const discrepancies: Discrepancy[] = [];
  let matched = 0;

  for (const r of rentals) {
    const invs = invByRental.get(r.id) ?? [];
    const deposit = invs.find(i => i.invoice_type === "deposit");
    const rentalInvs = invs.filter(i => i.invoice_type !== "deposit");

    // Deposit checks
    if (r.security_deposit_amount && Number(r.security_deposit_amount) > 0) {
      if (!deposit) {
        discrepancies.push({
          rental_id: r.id, driver_id: r.driver_id, owner_id: r.owner_id,
          code: "missing_deposit_invoice",
          detail: "Rental has a security_deposit_amount but no invoice of type=deposit was generated.",
          expected: r.security_deposit_amount, actual: null,
        });
      } else if (Math.abs(Number(deposit.total_amount) - Number(r.security_deposit_amount)) > 0.01) {
        discrepancies.push({
          rental_id: r.id, driver_id: r.driver_id, owner_id: r.owner_id,
          code: "deposit_amount_mismatch",
          detail: `Deposit invoice ${deposit.id} amount does not match rental terms.`,
          expected: r.security_deposit_amount, actual: deposit.total_amount, currency: deposit.currency,
        });
      } else if (r.security_deposit_invoice_id && r.security_deposit_invoice_id !== deposit.id) {
        discrepancies.push({
          rental_id: r.id, driver_id: r.driver_id, owner_id: r.owner_id,
          code: "deposit_invoice_link_mismatch",
          detail: "rentals.security_deposit_invoice_id does not point at the deposit invoice.",
          expected: deposit.id, actual: r.security_deposit_invoice_id,
        });
      }
    }

    // Rental invoice term checks vs agreed rate
    const agreedWeekly = r.weekly_rate ? Number(r.weekly_rate) : null;
    const agreedMonthly = r.monthly_rate ? Number(r.monthly_rate) : null;
    for (const inv of rentalInvs) {
      const total = Number(inv.total_amount);
      const agreed = agreedWeekly ?? agreedMonthly;
      // Only flag when it deviates from every known rate by > 1% AND > 1 unit.
      if (agreed && Math.abs(total - agreed) / agreed > 0.01 && Math.abs(total - agreed) > 1) {
        // A driver may pay a fraction/multiple of period — check divisor.
        const ratio = total / agreed;
        const nearInt = Math.abs(ratio - Math.round(ratio)) < 0.02;
        if (!nearInt) {
          discrepancies.push({
            rental_id: r.id, driver_id: r.driver_id, owner_id: r.owner_id,
            code: "rental_amount_off_agreed_rate",
            detail: `Invoice ${inv.id} total does not align with agreed rate.`,
            expected: agreed, actual: total, currency: inv.currency,
          });
        }
      }
      // Paid invoice must have a receipt
      if (inv.status === "paid") {
        const rc = receiptByInvoice.get(inv.id) ?? (inv.payment_id ? receiptByPayment.get(inv.payment_id) : null);
        if (!rc) {
          discrepancies.push({
            rental_id: r.id, driver_id: r.driver_id, owner_id: r.owner_id,
            code: "paid_invoice_missing_receipt",
            detail: `Invoice ${inv.id} is paid but no receipt row exists.`,
            expected: inv.total_amount, actual: null, currency: inv.currency,
          });
        } else if (Math.abs(Number(rc.amount) - Number(inv.total_amount)) > 0.01) {
          discrepancies.push({
            rental_id: r.id, driver_id: r.driver_id, owner_id: r.owner_id,
            code: "receipt_amount_mismatch",
            detail: `Receipt ${rc.id} amount differs from invoice total.`,
            expected: inv.total_amount, actual: rc.amount, currency: inv.currency,
          });
        } else {
          matched++;
        }
      }
    }
  }

  const summary = {
    range: { start_date: startISO, end_date: endISO },
    rentals_scanned: rentals.length,
    invoices_scanned: invoices.length,
    receipts_scanned: receipts.length,
    reconciled_paid_invoices: matched,
    discrepancy_count: discrepancies.length,
  };

  return new Response(JSON.stringify({ ok: true, summary, discrepancies }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
