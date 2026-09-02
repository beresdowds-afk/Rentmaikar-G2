// deno-lint-ignore-file no-explicit-any
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_SECRET = Deno.env.get("CRON_SECRET") || "";

function renderInvoicePdfHtml(inv: any) {
  const items = Array.isArray(inv.line_items) ? inv.line_items : [];
  const rows = items.length
    ? items.map((li: any) => `<tr><td>${li.description ?? ""}</td><td style="text-align:right">${li.quantity ?? 1}</td><td style="text-align:right">${Number(li.unit_price ?? 0).toFixed(2)}</td><td style="text-align:right">${Number(li.total ?? (li.quantity ?? 1) * (li.unit_price ?? 0)).toFixed(2)}</td></tr>`).join("")
    : `<tr><td>${inv.description ?? "Rental charge"}</td><td style="text-align:right">1</td><td style="text-align:right">${Number(inv.amount).toFixed(2)}</td><td style="text-align:right">${Number(inv.amount).toFixed(2)}</td></tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${inv.invoice_number}</title>
    <style>body{font-family:Arial,sans-serif;color:#0A1628;padding:32px;max-width:720px;margin:auto}
    h1{color:#10B981;margin:0}table{width:100%;border-collapse:collapse;margin-top:16px}
    th,td{padding:8px;border-bottom:1px solid #e5e7eb}th{text-align:left;background:#f8fafc}
    .totals{margin-top:16px;text-align:right}.muted{color:#64748b;font-size:12px}</style></head>
    <body><header style="display:flex;justify-content:space-between;align-items:flex-start">
    <div><h1>Rentmaikar</h1><div class="muted">Rideshare Rental Platform</div></div>
    <div style="text-align:right"><h2 style="margin:0">INVOICE</h2>
    <div class="muted">#${inv.invoice_number}</div>
    <div class="muted">Issued: ${new Date(inv.issued_at ?? inv.created_at).toLocaleDateString()}</div>
    ${inv.due_date ? `<div class="muted">Due: ${new Date(inv.due_date).toLocaleDateString()}</div>` : ""}
    </div></header>
    <table><thead><tr><th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit</th><th style="text-align:right">Total</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <div class="totals"><div>Subtotal: ${inv.currency} ${Number(inv.amount).toFixed(2)}</div>
    <div>Tax: ${inv.currency} ${Number(inv.tax_amount ?? 0).toFixed(2)}</div>
    <div style="font-size:18px;font-weight:bold;color:#10B981">Total: ${inv.currency} ${Number(inv.total_amount).toFixed(2)}</div>
    <div class="muted" style="margin-top:8px">Status: ${inv.status.toUpperCase()}</div></div>
    <p class="muted" style="margin-top:32px">Thank you for choosing Rentmaikar.</p>
    </body></html>`;
}

function renderReceiptPdfHtml(r: any) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${r.receipt_number}</title>
    <style>body{font-family:Arial,sans-serif;color:#0A1628;padding:32px;max-width:640px;margin:auto}
    h1{color:#10B981;margin:0}.box{border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin-top:16px}
    .row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px dashed #e5e7eb}
    .muted{color:#64748b;font-size:12px}.big{font-size:28px;font-weight:bold;color:#10B981}</style></head>
    <body><header><h1>Rentmaikar</h1><div class="muted">Payment Receipt</div></header>
    <div class="box"><div class="row"><span>Receipt #</span><strong>${r.receipt_number}</strong></div>
    <div class="row"><span>Date</span><span>${new Date(r.issued_at ?? r.created_at).toLocaleString()}</span></div>
    <div class="row"><span>Method</span><span>${r.payment_method ?? "N/A"}</span></div>
    ${r.transaction_id ? `<div class="row"><span>Transaction ID</span><span style="font-family:monospace">${r.transaction_id}</span></div>` : ""}
    ${r.invoice_id ? `<div class="row"><span>Invoice</span><span>${r.invoice_id}</span></div>` : ""}
    <div class="row" style="border:none;margin-top:8px"><span>Amount Paid</span><span class="big">${r.currency} ${Number(r.amount).toFixed(2)}</span></div></div>
    <p class="muted" style="margin-top:24px">This receipt confirms your payment has been received.</p>
    </body></html>`;
}

async function trySendEmail(admin: any, params: {
  to: string; subject: string; html: string; category: string; entity_id: string; entity_type: string;
}) {
  try {
    const { error } = await admin.functions.invoke("send-outbound-email", {
      body: {
        to: params.to, subject: params.subject, html: params.html,
        category: params.category, priority: "normal",
        metadata: { entity_id: params.entity_id, entity_type: params.entity_type },
      },
    });
    if (error) throw error;
    return { ok: true as const };
  } catch (e) {
    console.error("[billing-portal] email failed", e);
    return { ok: false as const, error: String((e as Error).message ?? e) };
  }
}

async function resolveEmail(admin: any, row: any): Promise<string | null> {
  if (row.recipient_email) return row.recipient_email;
  if (row.driver_id) {
    const { data: p } = await admin.from("profiles").select("email").eq("user_id", row.driver_id).maybeSingle();
    if (p?.email) return p.email;
  }
  if (row.owner_id) {
    const { data: p } = await admin.from("profiles").select("email").eq("user_id", row.owner_id).maybeSingle();
    if (p?.email) return p.email;
  }
  return null;
}

async function sendInvoiceById(admin: any, invoice_id: string, actor_id: string | null) {
  const { data: inv, error } = await admin.from("invoices").select("*").eq("id", invoice_id).single();
  if (error || !inv) throw error ?? new Error("Invoice not found");
  const email = await resolveEmail(admin, inv);
  const now = new Date().toISOString();
  const attempts = (inv.email_attempts ?? 0) + 1;

  if (!email) {
    await admin.from("invoices").update({
      email_status: "failed", email_error: "No recipient email",
      email_attempts: attempts, email_last_attempt_at: now,
    }).eq("id", invoice_id);
    await admin.from("invoice_activity_log").insert({
      entity_type: "invoice", entity_id: invoice_id, action: "send_failed",
      actor_id, channel: "email", details: { error: "No recipient email", attempts },
    });
    return { ok: false, email: null, error: "No recipient email" };
  }

  const send = await trySendEmail(admin, {
    to: email, subject: `Invoice ${inv.invoice_number} – ${inv.currency} ${Number(inv.total_amount).toFixed(2)}`,
    html: renderInvoicePdfHtml(inv), category: "payment", entity_id: inv.id, entity_type: "invoice",
  });

  await admin.from("invoices").update({
    status: send.ok ? "sent" : inv.status,
    sent_at: send.ok ? now : inv.sent_at,
    recipient_email: email,
    email_status: send.ok ? "sent" : "failed",
    email_error: send.ok ? null : send.error,
    email_attempts: attempts,
    email_last_attempt_at: now,
  }).eq("id", invoice_id);

  await admin.from("invoice_activity_log").insert({
    entity_type: "invoice", entity_id: inv.id,
    action: send.ok ? "sent" : "send_failed",
    actor_id, channel: "email",
    details: { email, error: send.ok ? null : send.error, attempts },
  });
  return { ok: send.ok, email, error: send.ok ? null : send.error };
}

async function sendReceiptById(admin: any, receipt_id: string, actor_id: string | null) {
  const { data: r, error } = await admin.from("receipts").select("*").eq("id", receipt_id).single();
  if (error || !r) throw error ?? new Error("Receipt not found");
  const email = await resolveEmail(admin, r);
  const now = new Date().toISOString();
  const attempts = (r.email_attempts ?? 0) + 1;

  if (!email) {
    await admin.from("receipts").update({
      email_status: "failed", email_error: "No recipient email",
      email_attempts: attempts, email_last_attempt_at: now,
    }).eq("id", receipt_id);
    await admin.from("invoice_activity_log").insert({
      entity_type: "receipt", entity_id: receipt_id, action: "send_failed",
      actor_id, channel: "email", details: { error: "No recipient email", attempts },
    });
    return { ok: false, email: null, error: "No recipient email" };
  }

  const send = await trySendEmail(admin, {
    to: email, subject: `Receipt ${r.receipt_number} – ${r.currency} ${Number(r.amount).toFixed(2)}`,
    html: renderReceiptPdfHtml(r), category: "payment_receipt", entity_id: r.id, entity_type: "receipt",
  });

  await admin.from("receipts").update({
    status: send.ok ? "sent" : r.status,
    sent_at: send.ok ? now : r.sent_at,
    recipient_email: email,
    email_status: send.ok ? "sent" : "failed",
    email_error: send.ok ? null : send.error,
    email_attempts: attempts,
    email_last_attempt_at: now,
  }).eq("id", receipt_id);

  await admin.from("invoice_activity_log").insert({
    entity_type: "receipt", entity_id: r.id,
    action: send.ok ? "sent" : "send_failed",
    actor_id, channel: "email",
    details: { email, error: send.ok ? null : send.error, attempts },
  });
  return { ok: send.ok, email, error: send.ok ? null : send.error };
}

/** True when the actor holds the admin (or admin_assistant) role. */
async function isPrivileged(admin: any, actor_id: string | null): Promise<boolean> {
  if (!actor_id) return false;
  const { data } = await admin
    .from("user_roles").select("role").eq("user_id", actor_id)
    .in("role", ["admin", "admin_assistant"]);
  return !!data && data.length > 0;
}

/**
 * Ownership gate: loads the invoice/receipt and asserts the caller is the
 * driver or owner on the record, or an admin. Throws a 403-marked error
 * otherwise so callers can never touch records they do not own.
 */
async function assertCanAccess(
  admin: any, kind: "invoice" | "receipt", id: string,
  actor_id: string | null, isInternal: boolean,
): Promise<any> {
  const table = kind === "receipt" ? "receipts" : "invoices";
  const { data: row, error } = await admin.from(table).select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!row) { const e: any = new Error("Not found"); e.status = 404; throw e; }
  if (isInternal) return row;
  if (actor_id && (row.driver_id === actor_id || row.owner_id === actor_id)) return row;
  if (await isPrivileged(admin, actor_id)) return row;
  const e: any = new Error("Forbidden");
  e.status = 403;
  throw e;
}

function isUuid(v: unknown): v is string {
  return typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const internal = req.headers.get("x-internal-secret") ?? "";
  const isInternal = !!INTERNAL_SECRET && internal === INTERNAL_SECRET;

  let actor_id: string | null = null;
  if (!isInternal) {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    const { data: userData } = await admin.auth.getUser(jwt);
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    actor_id = userData.user.id;
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const action = body.action as string;

  try {
    // ---------- Idempotent invoice create (admins / internal only) ----------
    if (action === "create_invoice") {
      if (!isInternal && !(await isPrivileged(admin, actor_id))) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const {
        rental_id, driver_id, owner_id, vehicle_id, subscription_id, invoice_type,
        amount, tax_amount = 0, currency = "USD", description, line_items = [],
        due_date, recipient_email, region, payment_id, idempotency_key,
      } = body;
      if (!(Number(amount) >= 0) || !Number.isFinite(Number(amount))) {
        return new Response(JSON.stringify({ error: "Invalid amount" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const total = Number(amount) + Number(tax_amount || 0);
      const idem = idempotency_key
        ?? (payment_id ? `payment-${payment_id}` : (rental_id ? `rental-${rental_id}-${invoice_type}-${amount}` : null));

      if (idem) {
        const { data: existing } = await admin.from("invoices").select("*").eq("idempotency_key", idem).maybeSingle();
        if (existing) return new Response(JSON.stringify({ ok: true, invoice: existing, idempotent: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: inv, error } = await admin.from("invoices").insert({
        rental_id, driver_id, owner_id, vehicle_id, subscription_id, payment_id,
        invoice_type: invoice_type || "rental",
        amount, tax_amount, total_amount: total, currency, description, line_items,
        due_date, recipient_email, region,
        status: "draft", created_by: actor_id, idempotency_key: idem,
      }).select().single();
      if (error) throw error;
      await admin.from("invoice_activity_log").insert({
        entity_type: "invoice", entity_id: inv.id, action: "created",
        actor_id, details: { amount, currency, idempotency_key: idem },
      });
      return new Response(JSON.stringify({ ok: true, invoice: inv }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "send_invoice") {
      if (!isUuid(body.invoice_id)) throw Object.assign(new Error("Invalid invoice_id"), { status: 400 });
      await assertCanAccess(admin, "invoice", body.invoice_id, actor_id, isInternal);
      const r = await sendInvoiceById(admin, body.invoice_id, actor_id);
      return new Response(JSON.stringify(r), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "send_receipt" || action === "auto_send_receipt_for_payment") {
      let receipt_id = body.receipt_id as string | undefined;
      if (!receipt_id && isUuid(body.payment_id)) {
        const { data: rc } = await admin.from("receipts").select("id").eq("payment_id", body.payment_id).maybeSingle();
        receipt_id = rc?.id;
      }
      if (!isUuid(receipt_id)) {
        return new Response(JSON.stringify({ ok: false, error: "receipt not found" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      await assertCanAccess(admin, "receipt", receipt_id, actor_id, isInternal);
      const r = await sendReceiptById(admin, receipt_id, actor_id);
      return new Response(JSON.stringify(r), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "retry_email") {
      const { kind, id } = body; // kind = 'invoice' | 'receipt'
      if (!isUuid(id)) throw Object.assign(new Error("Invalid id"), { status: 400 });
      const k = kind === "receipt" ? "receipt" : "invoice";
      await assertCanAccess(admin, k, id, actor_id, isInternal);
      const r = k === "receipt"
        ? await sendReceiptById(admin, id, actor_id)
        : await sendInvoiceById(admin, id, actor_id);
      return new Response(JSON.stringify(r), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "render_html") {
      const { kind, id } = body;
      if (!isUuid(id)) throw Object.assign(new Error("Invalid id"), { status: 400 });
      const k = kind === "receipt" ? "receipt" : "invoice";
      const data = await assertCanAccess(admin, k, id, actor_id, isInternal);
      await admin.from("invoice_activity_log").insert({
        entity_type: k, entity_id: id, action: "viewed", actor_id, channel: "download",
      });
      const html = k === "receipt" ? renderReceiptPdfHtml(data) : renderInvoicePdfHtml(data);
      return new Response(html, { headers: { ...corsHeaders, "Content-Type": "text/html" } });
    }

    // ---------- Voiding is an administrative action ----------
    if (action === "void_invoice") {
      const { invoice_id, reason } = body;
      if (!isUuid(invoice_id)) throw Object.assign(new Error("Invalid invoice_id"), { status: 400 });
      if (!isInternal && !(await isPrivileged(admin, actor_id))) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await admin.from("invoices").update({
        status: "void", voided_at: new Date().toISOString(),
        metadata: { void_reason: typeof reason === "string" ? reason.slice(0, 500) : null },
      }).eq("id", invoice_id);
      await admin.from("invoice_activity_log").insert({
        entity_type: "invoice", entity_id: invoice_id, action: "voided",
        actor_id, details: { reason },
      });
      return new Response(JSON.stringify({ ok: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    const status = typeof e?.status === "number" ? e.status : 500;
    if (status >= 500) console.error("[billing-portal]", e);
    return new Response(JSON.stringify({ error: status >= 500 ? "Internal error" : String(e?.message ?? e) }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
